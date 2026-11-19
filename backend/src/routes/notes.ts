import { Hono } from 'hono';
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { vaults, notes, noteLinks, noteRevisions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { extractSnippet, parseMarkdownMeta } from '../utils/markdown';
import { buildFtsMatchQuery, deleteNoteFts, upsertNoteFts } from '../utils/fts';
import type { AppContext } from '../types';

export const noteRoutes = new Hono<AppContext>();

noteRoutes.use('*', authMiddleware);

async function verifyVaultOwnership(db: ReturnType<typeof drizzle>, vaultId: string, userId: string) {
  return db
    .select()
    .from(vaults)
    .where(and(eq(vaults.id, vaultId), eq(vaults.userId, userId)))
    .get();
}

function titleFromPath(path: string, isFolder: boolean): string {
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? path;
  if (!isFolder && last.toLowerCase().endsWith('.md')) {
    return last.slice(0, -3);
  }
  return last;
}

async function runBatched(d1: D1Database, stmts: D1PreparedStatement[], chunkSize = 80) {
  for (let i = 0; i < stmts.length; i += chunkSize) {
    await d1.batch(stmts.slice(i, i + chunkSize));
  }
}

/**
 * Metadata-only vault listing (lazy-loads full content only when opening a note).
 */
noteRoutes.get('/vault/:vaultId', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const db = drizzle(c.env.DB);

  const vault = await verifyVaultOwnership(db, vaultId, userId);
  if (!vault) return c.json({ error: '知识库不存在或无权限' }, 404);

  const list = await db
    .select({
      id: notes.id,
      vaultId: notes.vaultId,
      path: notes.path,
      title: notes.title,
      excerpt: sql<string>`substr(${notes.content}, 1, 140)`,
      tags: notes.tags,
      wordCount: notes.wordCount,
      isFolder: notes.isFolder,
      isStarred: notes.isStarred,
      pageRank: notes.pageRank,
      cluster: notes.cluster,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.vaultId, vaultId))
    .all();

  return c.json({ notes: list });
});

/**
 * Full-vault export endpoint for .zip packaging.
 */
noteRoutes.get('/vault/:vaultId/export', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const db = drizzle(c.env.DB);

  const vault = await verifyVaultOwnership(db, vaultId, userId);
  if (!vault) return c.json({ error: '知识库不存在或无权限' }, 404);

  const files = await db
    .select({ path: notes.path, content: notes.content })
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), eq(notes.isFolder, false)))
    .all();

  return c.json({ files });
});

/**
 * SQLite FTS5 full-text search endpoint with LIKE fallback.
 */
noteRoutes.get('/vault/:vaultId/search', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const q = c.req.query('q')?.trim() ?? '';
  const db = drizzle(c.env.DB);

  const vault = await verifyVaultOwnership(db, vaultId, userId);
  if (!vault) return c.json({ error: '知识库不存在或无权限' }, 404);
  if (!q) return c.json({ results: [] });

  const ftsQuery = buildFtsMatchQuery(q);
  const matchedIds = new Set<string>();

  if (ftsQuery) {
    try {
      const ftsRows = await c.env.DB.prepare(
        `SELECT note_id FROM notes_fts WHERE vault_id = ? AND notes_fts MATCH ? ORDER BY bm25(notes_fts) LIMIT 25`
      )
        .bind(vaultId, ftsQuery)
        .all<{ note_id: string }>();
      for (const r of ftsRows.results) matchedIds.add(r.note_id);
    } catch {
      // Fallback to LIKE below if FTS syntax rejects input
    }
  }

  // Substring fallback for CJK partial phrases
  if (matchedIds.size < 15) {
    const likePattern = `%${q}%`;
    const likeRows = await c.env.DB.prepare(
      `SELECT id FROM notes WHERE vault_id = ? AND is_folder = 0 AND (title LIKE ? OR content LIKE ?) LIMIT 25`
    )
      .bind(vaultId, likePattern, likePattern)
      .all<{ id: string }>();
    for (const r of likeRows.results) matchedIds.add(r.id);
  }

  if (matchedIds.size === 0) return c.json({ results: [] });

  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      path: notes.path,
      wordCount: notes.wordCount,
      content: notes.content,
    })
    .from(notes)
    .where(inArray(notes.id, Array.from(matchedIds)))
    .all();

  const results = rows.map((r) => ({
    id: r.id,
    title: r.title,
    path: r.path,
    wordCount: r.wordCount,
    snippet: extractSnippet(r.content, q, 45),
  }));

  return c.json({ results });
});

noteRoutes.get('/:id', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const db = drizzle(c.env.DB);

  const note = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!note) return c.json({ error: '笔记不存在' }, 404);

  const vault = await verifyVaultOwnership(db, note.vaultId, userId);
  if (!vault) return c.json({ error: '无权限访问' }, 403);

  // Linked mentions (Backlinks) via indexed note_links
  const incomingLinks = await db
    .select({ sourceNoteId: noteLinks.sourceNoteId })
    .from(noteLinks)
    .where(and(eq(noteLinks.vaultId, note.vaultId), eq(noteLinks.targetNoteId, note.id)))
    .all();

  const backlinkSourceIds = Array.from(new Set(incomingLinks.map((l) => l.sourceNoteId)));
  const backlinks = [];

  if (backlinkSourceIds.length > 0) {
    const srcNotes = await db
      .select({
        id: notes.id,
        title: notes.title,
        path: notes.path,
        content: notes.content,
      })
      .from(notes)
      .where(inArray(notes.id, backlinkSourceIds))
      .all();

    for (const src of srcNotes) {
      backlinks.push({
        noteId: src.id,
        title: src.title,
        path: src.path,
        snippet: extractSnippet(src.content, `[[${note.title}`),
      });
    }
  }

  // Unlinked mentions using SQL LIKE pushdown (bounded to 20 candidates)
  const unlinkedMentions = [];
  if (!note.isFolder && note.title.length >= 2) {
    const likePattern = `%${note.title}%`;
    const candidates = await c.env.DB.prepare(
      `SELECT id, title, path, content FROM notes WHERE vault_id = ? AND is_folder = 0 AND id != ? AND content LIKE ? LIMIT 20`
    )
      .bind(note.vaultId, note.id, likePattern)
      .all<{ id: string; title: string; path: string; content: string }>();

    const backlinkSet = new Set(backlinkSourceIds);
    for (const other of candidates.results) {
      if (backlinkSet.has(other.id)) continue;
      unlinkedMentions.push({
        noteId: other.id,
        title: other.title,
        path: other.path,
        snippet: extractSnippet(other.content, note.title),
      });
    }
  }

  return c.json({ note, backlinks, unlinkedMentions });
});

noteRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    vaultId?: string;
    path?: string;
    content?: string;
    isFolder?: boolean;
  }>();

  if (!body.vaultId || !body.path?.trim()) {
    return c.json({ error: '缺少必要参数 vaultId 或 path' }, 400);
  }

  const db = drizzle(c.env.DB);
  const vault = await verifyVaultOwnership(db, body.vaultId, userId);
  if (!vault) return c.json({ error: '知识库不存在' }, 404);

  const isFolder = Boolean(body.isFolder);
  let normalizedPath = body.path.trim().replace(/^\/+/, '');
  if (!isFolder && !normalizedPath.toLowerCase().endsWith('.md')) {
    normalizedPath += '.md';
  }

  const existing = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.vaultId, body.vaultId), eq(notes.path, normalizedPath)))
    .get();
  if (existing) {
    return c.json({ error: '该路径文件或文件夹已存在' }, 409);
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const title = titleFromPath(normalizedPath, isFolder);
  const content = isFolder ? '' : body.content ?? `# ${title}\n\n`;
  const meta = isFolder ? { links: [], tags: [], wordCount: 0 } : parseMarkdownMeta(content);

  await db.insert(notes).values({
    id,
    vaultId: body.vaultId,
    path: normalizedPath,
    title,
    content,
    tags: JSON.stringify(meta.tags),
    wordCount: meta.wordCount,
    isFolder,
    createdAt: now,
    updatedAt: now,
  });

  if (!isFolder) {
    await upsertNoteFts(c.env.DB, id, body.vaultId, title, content);

    await db
      .update(noteLinks)
      .set({ targetNoteId: id })
      .where(and(eq(noteLinks.vaultId, body.vaultId), eq(noteLinks.targetTitle, title)));

    if (meta.links.length > 0) {
      const targetNotes = await db
        .select({ id: notes.id, title: notes.title })
        .from(notes)
        .where(
          and(
            eq(notes.vaultId, body.vaultId),
            eq(notes.isFolder, false),
            inArray(notes.title, meta.links)
          )
        )
        .all();
      const titleToId = new Map(targetNotes.map((n) => [n.title, n.id]));

      const linkStmts = meta.links.map((targetTitle) =>
        c.env.DB.prepare(
          'INSERT INTO note_links (id, vault_id, source_note_id, target_note_id, target_title) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          crypto.randomUUID(),
          body.vaultId,
          id,
          titleToId.get(targetTitle) ?? null,
          targetTitle
        )
      );
      await runBatched(c.env.DB, linkStmts);
    }
  }

  const created = await db.select().from(notes).where(eq(notes.id, id)).get();
  return c.json({ note: created }, 201);
});

noteRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const body = await c.req.json<{ content?: string; path?: string }>();

  const db = drizzle(c.env.DB);
  const existing = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!existing) return c.json({ error: '笔记不存在' }, 404);

  const vault = await verifyVaultOwnership(db, existing.vaultId, userId);
  if (!vault) return c.json({ error: '无权限' }, 403);

  const now = Date.now();
  let newPath = existing.path;
  let newTitle = existing.title;

  if (body.path !== undefined && body.path.trim() !== existing.path) {
    newPath = body.path.trim().replace(/^\/+/, '');
    if (!existing.isFolder && !newPath.toLowerCase().endsWith('.md')) {
      newPath += '.md';
    }
    newTitle = titleFromPath(newPath, existing.isFolder);
  }

  const newContent = existing.isFolder ? '' : body.content ?? existing.content;
  const meta = existing.isFolder
    ? { links: [], tags: [], wordCount: 0 }
    : parseMarkdownMeta(newContent);

  await db
    .update(notes)
    .set({
      path: newPath,
      title: newTitle,
      content: newContent,
      tags: JSON.stringify(meta.tags),
      wordCount: meta.wordCount,
      updatedAt: now,
    })
    .where(eq(notes.id, noteId));

  if (existing.isFolder && newPath !== existing.path) {
    const children = await db
      .select({ id: notes.id, path: notes.path })
      .from(notes)
      .where(and(eq(notes.vaultId, existing.vaultId), like(notes.path, `${existing.path}/%`)))
      .all();
    const stmts = children.map((child) =>
      c.env.DB.prepare('UPDATE notes SET path = ?, updated_at = ? WHERE id = ?').bind(
        newPath + child.path.slice(existing.path.length),
        now,
        child.id
      )
    );
    await runBatched(c.env.DB, stmts);
  }

  if (!existing.isFolder) {
    await upsertNoteFts(c.env.DB, noteId, existing.vaultId, newTitle, newContent);

    if (body.content !== undefined && body.content !== existing.content) {
      const latestRev = await db
        .select({ createdAt: noteRevisions.createdAt })
        .from(noteRevisions)
        .where(eq(noteRevisions.noteId, noteId))
        .orderBy(desc(noteRevisions.createdAt))
        .get();

      if (!latestRev || now - latestRev.createdAt > 30_000) {
        await db.insert(noteRevisions).values({
          id: crypto.randomUUID(),
          noteId,
          vaultId: existing.vaultId,
          content: existing.content,
          wordCount: existing.wordCount,
          label: '自动快照',
          createdAt: now,
        });
      }
    }

    await db.delete(noteLinks).where(eq(noteLinks.sourceNoteId, noteId));

    if (meta.links.length > 0) {
      const targetNotes = await db
        .select({ id: notes.id, title: notes.title })
        .from(notes)
        .where(
          and(
            eq(notes.vaultId, existing.vaultId),
            eq(notes.isFolder, false),
            inArray(notes.title, meta.links)
          )
        )
        .all();
      const titleToId = new Map(targetNotes.map((n) => [n.title, n.id]));

      const linkStmts = meta.links.map((targetTitle) =>
        c.env.DB.prepare(
          'INSERT INTO note_links (id, vault_id, source_note_id, target_note_id, target_title) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          crypto.randomUUID(),
          existing.vaultId,
          noteId,
          titleToId.get(targetTitle) ?? null,
          targetTitle
        )
      );
      await runBatched(c.env.DB, linkStmts);
    }

    if (newTitle !== existing.title) {
      await db
        .update(noteLinks)
        .set({ targetNoteId: noteId })
        .where(and(eq(noteLinks.vaultId, existing.vaultId), eq(noteLinks.targetTitle, newTitle)));
    }
  }

  const updated = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  return c.json({ note: updated });
});

noteRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const db = drizzle(c.env.DB);

  const existing = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!existing) return c.json({ error: '笔记不存在' }, 404);

  const vault = await verifyVaultOwnership(db, existing.vaultId, userId);
  if (!vault) return c.json({ error: '无权限' }, 403);

  if (existing.isFolder) {
    const children = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.vaultId, existing.vaultId), like(notes.path, `${existing.path}/%`)))
      .all();
    const ftsDeletes = children.map((ch) =>
      c.env.DB.prepare('DELETE FROM notes_fts WHERE note_id = ?').bind(ch.id)
    );
    await runBatched(c.env.DB, ftsDeletes);
    await db
      .delete(notes)
      .where(and(eq(notes.vaultId, existing.vaultId), like(notes.path, `${existing.path}/%`)));
  } else {
    await deleteNoteFts(c.env.DB, noteId);
  }

  await db.delete(notes).where(eq(notes.id, noteId));
  return c.json({ ok: true });
});

noteRoutes.patch('/:id/bookmark', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const body = await c.req.json<{ isStarred?: boolean }>();
  const db = drizzle(c.env.DB);

  const existing = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!existing) return c.json({ error: '笔记不存在' }, 404);

  const vault = await verifyVaultOwnership(db, existing.vaultId, userId);
  if (!vault) return c.json({ error: '无权限' }, 403);

  const nextStarred = body.isStarred !== undefined ? Boolean(body.isStarred) : !existing.isStarred;
  await db.update(notes).set({ isStarred: nextStarred }).where(eq(notes.id, noteId));

  const updated = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  return c.json({ note: updated });
});

// ==================== Version History & Diff ====================

noteRoutes.get('/:id/revisions', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const db = drizzle(c.env.DB);

  const note = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!note) return c.json({ error: '笔记不存在' }, 404);

  const vault = await verifyVaultOwnership(db, note.vaultId, userId);
  if (!vault) return c.json({ error: '无权限' }, 403);

  const revisions = await db
    .select()
    .from(noteRevisions)
    .where(eq(noteRevisions.noteId, noteId))
    .orderBy(desc(noteRevisions.createdAt))
    .all();

  return c.json({ revisions });
});

noteRoutes.post('/:id/revisions', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const body = await c.req.json<{ label?: string }>().catch(() => ({ label: undefined }));
  const db = drizzle(c.env.DB);

  const note = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!note) return c.json({ error: '笔记不存在' }, 404);

  const vault = await verifyVaultOwnership(db, note.vaultId, userId);
  if (!vault) return c.json({ error: '无权限' }, 403);

  const now = Date.now();
  const id = crypto.randomUUID();
  const label = body.label?.trim() || '手动快照';

  await db.insert(noteRevisions).values({
    id,
    noteId: note.id,
    vaultId: note.vaultId,
    content: note.content,
    wordCount: note.wordCount,
    label,
    createdAt: now,
  });

  const revision = await db.select().from(noteRevisions).where(eq(noteRevisions.id, id)).get();
  return c.json({ revision }, 201);
});

noteRoutes.post('/:id/restore/:revisionId', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const revisionId = c.req.param('revisionId');
  const db = drizzle(c.env.DB);

  const note = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!note) return c.json({ error: '笔记不存在' }, 404);

  const vault = await verifyVaultOwnership(db, note.vaultId, userId);
  if (!vault) return c.json({ error: '无权限' }, 403);

  const targetRev = await db
    .select()
    .from(noteRevisions)
    .where(and(eq(noteRevisions.id, revisionId), eq(noteRevisions.noteId, noteId)))
    .get();
  if (!targetRev) return c.json({ error: '历史版本不存在' }, 404);

  const now = Date.now();

  await db.insert(noteRevisions).values({
    id: crypto.randomUUID(),
    noteId: note.id,
    vaultId: note.vaultId,
    content: note.content,
    wordCount: note.wordCount,
    label: '回滚前备份',
    createdAt: now,
  });

  const meta = parseMarkdownMeta(targetRev.content);
  await db
    .update(notes)
    .set({
      content: targetRev.content,
      tags: JSON.stringify(meta.tags),
      wordCount: meta.wordCount,
      updatedAt: now,
    })
    .where(eq(notes.id, noteId));

  await upsertNoteFts(c.env.DB, noteId, note.vaultId, note.title, targetRev.content);

  await db.delete(noteLinks).where(eq(noteLinks.sourceNoteId, noteId));
  if (meta.links.length > 0) {
    const targetNotes = await db
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(
        and(
          eq(notes.vaultId, note.vaultId),
          eq(notes.isFolder, false),
          inArray(notes.title, meta.links)
        )
      )
      .all();
    const titleToId = new Map(targetNotes.map((n) => [n.title, n.id]));

    const linkStmts = meta.links.map((targetTitle) =>
      c.env.DB.prepare(
        'INSERT INTO note_links (id, vault_id, source_note_id, target_note_id, target_title) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        crypto.randomUUID(),
        note.vaultId,
        noteId,
        titleToId.get(targetTitle) ?? null,
        targetTitle
      )
    );
    await runBatched(c.env.DB, linkStmts);
  }

  const updated = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  return c.json({ note: updated });
});

// ==================== Batch Import (D1 db.batch) ====================

noteRoutes.post('/vault/:vaultId/import', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const body = await c.req.json<{ files?: { path: string; content: string }[] }>();

  if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
    return c.json({ error: '请选择要导入的 Markdown 文件' }, 400);
  }

  const db = drizzle(c.env.DB);
  const vault = await verifyVaultOwnership(db, vaultId, userId);
  if (!vault) return c.json({ error: '知识库不存在或无权限' }, 404);

  const now = Date.now();
  const existingNotes = await db
    .select({ id: notes.id, path: notes.path, title: notes.title, isFolder: notes.isFolder })
    .from(notes)
    .where(eq(notes.vaultId, vaultId))
    .all();

  const existingByPath = new Map(existingNotes.map((n) => [n.path, n]));
  const stmts: D1PreparedStatement[] = [];

  let importedCount = 0;
  let updatedCount = 0;

  for (const file of body.files) {
    const cleanPath = file.path.trim().replace(/^\/+/, '');
    if (!cleanPath || !cleanPath.toLowerCase().endsWith('.md')) continue;

    const parts = cleanPath.split('/').filter(Boolean);
    let folderPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      folderPath = folderPath ? `${folderPath}/${parts[i]}` : parts[i];
      if (!existingByPath.has(folderPath)) {
        const folderId = crypto.randomUUID();
        stmts.push(
          c.env.DB.prepare(
            'INSERT INTO notes (id, vault_id, path, title, content, tags, word_count, is_folder, is_starred, page_rank, cluster, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?, ?)'
          ).bind(folderId, vaultId, folderPath, parts[i], '', '[]', 0, now, now)
        );
        existingByPath.set(folderPath, {
          id: folderId,
          path: folderPath,
          title: parts[i],
          isFolder: true,
        });
      }
    }

    const title = titleFromPath(cleanPath, false);
    const meta = parseMarkdownMeta(file.content);
    const prev = existingByPath.get(cleanPath);

    if (prev && !prev.isFolder) {
      stmts.push(
        c.env.DB.prepare(
          'UPDATE notes SET content = ?, tags = ?, word_count = ?, updated_at = ? WHERE id = ?'
        ).bind(file.content, JSON.stringify(meta.tags), meta.wordCount, now, prev.id),
        c.env.DB.prepare('DELETE FROM notes_fts WHERE note_id = ?').bind(prev.id),
        c.env.DB.prepare(
          'INSERT INTO notes_fts (note_id, vault_id, title, content) VALUES (?, ?, ?, ?)'
        ).bind(prev.id, vaultId, title, file.content)
      );
      updatedCount += 1;
    } else if (!prev) {
      const id = crypto.randomUUID();
      stmts.push(
        c.env.DB.prepare(
          'INSERT INTO notes (id, vault_id, path, title, content, tags, word_count, is_folder, is_starred, page_rank, cluster, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)'
        ).bind(
          id,
          vaultId,
          cleanPath,
          title,
          file.content,
          JSON.stringify(meta.tags),
          meta.wordCount,
          now,
          now
        ),
        c.env.DB.prepare(
          'INSERT INTO notes_fts (note_id, vault_id, title, content) VALUES (?, ?, ?, ?)'
        ).bind(id, vaultId, title, file.content)
      );
      existingByPath.set(cleanPath, { id, path: cleanPath, title, isFolder: false });
      importedCount += 1;
    }
  }

  await runBatched(c.env.DB, stmts);

  // Rebuild all noteLinks in vault via batch
  await db.delete(noteLinks).where(eq(noteLinks.vaultId, vaultId));
  const allVaultFiles = await db
    .select({ id: notes.id, title: notes.title, content: notes.content })
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), eq(notes.isFolder, false)))
    .all();

  const titleToId = new Map(allVaultFiles.map((n) => [n.title, n.id]));
  const linkStmts: D1PreparedStatement[] = [];

  for (const n of allVaultFiles) {
    const meta = parseMarkdownMeta(n.content);
    for (const targetTitle of meta.links) {
      linkStmts.push(
        c.env.DB.prepare(
          'INSERT INTO note_links (id, vault_id, source_note_id, target_note_id, target_title) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          crypto.randomUUID(),
          vaultId,
          n.id,
          titleToId.get(targetTitle) ?? null,
          targetTitle
        )
      );
    }
  }

  await runBatched(c.env.DB, linkStmts);

  return c.json({ importedCount, updatedCount, linkCount: linkStmts.length });
});
