import { Hono } from 'hono';
import { and, desc, eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { vaults, notes, noteLinks, noteRevisions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { extractSnippet, parseMarkdownMeta } from '../utils/markdown';
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

noteRoutes.get('/vault/:vaultId', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const db = drizzle(c.env.DB);

  const vault = await verifyVaultOwnership(db, vaultId, userId);
  if (!vault) return c.json({ error: '知识库不存在或无权限' }, 404);

  const list = await db.select().from(notes).where(eq(notes.vaultId, vaultId)).all();
  return c.json({ notes: list });
});

noteRoutes.get('/:id', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const db = drizzle(c.env.DB);

  const note = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!note) return c.json({ error: '笔记不存在' }, 404);

  const vault = await verifyVaultOwnership(db, note.vaultId, userId);
  if (!vault) return c.json({ error: '无权限访问' }, 403);

  // Linked mentions (Backlinks)
  const incomingLinks = await db
    .select()
    .from(noteLinks)
    .where(and(eq(noteLinks.vaultId, note.vaultId), eq(noteLinks.targetNoteId, note.id)))
    .all();

  const allVaultNotes = await db
    .select()
    .from(notes)
    .where(and(eq(notes.vaultId, note.vaultId), eq(notes.isFolder, false)))
    .all();

  const noteById = new Map(allVaultNotes.map((n) => [n.id, n]));
  const backlinkSourceIds = new Set<string>();
  const backlinks = incomingLinks
    .map((l) => {
      const src = noteById.get(l.sourceNoteId);
      if (!src) return null;
      backlinkSourceIds.add(src.id);
      return {
        noteId: src.id,
        title: src.title,
        path: src.path,
        snippet: extractSnippet(src.content, `[[${note.title}`),
      };
    })
    .filter(Boolean);

  // Unlinked mentions: other notes that mention this note's title without [[...]]
  const unlinkedMentions = [];
  if (!note.isFolder && note.title.length >= 2) {
    const lowerTitle = note.title.toLowerCase();
    for (const other of allVaultNotes) {
      if (other.id === note.id || backlinkSourceIds.has(other.id)) continue;
      if (other.content.toLowerCase().includes(lowerTitle)) {
        unlinkedMentions.push({
          noteId: other.id,
          title: other.title,
          path: other.path,
          snippet: extractSnippet(other.content, note.title),
        });
      }
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
    .select()
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
    // Resolve any dangling links in the vault pointing to this new title
    await db
      .update(noteLinks)
      .set({ targetNoteId: id })
      .where(and(eq(noteLinks.vaultId, body.vaultId), eq(noteLinks.targetTitle, title)));

    // Insert outgoing links
    const allNotes = await db
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(and(eq(notes.vaultId, body.vaultId), eq(notes.isFolder, false)))
      .all();
    const titleToId = new Map(allNotes.map((n) => [n.title, n.id]));

    for (const targetTitle of meta.links) {
      await db.insert(noteLinks).values({
        id: crypto.randomUUID(),
        vaultId: body.vaultId,
        sourceNoteId: id,
        targetNoteId: titleToId.get(targetTitle) ?? null,
        targetTitle,
      });
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

  // If folder renamed, update all descendant paths
  if (existing.isFolder && newPath !== existing.path) {
    const children = await db
      .select()
      .from(notes)
      .where(and(eq(notes.vaultId, existing.vaultId), like(notes.path, `${existing.path}/%`)))
      .all();
    for (const child of children) {
      const updatedChildPath = newPath + child.path.slice(existing.path.length);
      await db
        .update(notes)
        .set({ path: updatedChildPath, updatedAt: now })
        .where(eq(notes.id, child.id));
    }
  }

  // Rebuild outgoing links for this note
  if (!existing.isFolder) {
    // Save automatic revision if content changed & > 30s since last snapshot
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

    const allNotes = await db
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(and(eq(notes.vaultId, existing.vaultId), eq(notes.isFolder, false)))
      .all();
    const titleToId = new Map(allNotes.map((n) => [n.title, n.id]));

    for (const targetTitle of meta.links) {
      await db.insert(noteLinks).values({
        id: crypto.randomUUID(),
        vaultId: existing.vaultId,
        sourceNoteId: noteId,
        targetNoteId: titleToId.get(targetTitle) ?? null,
        targetTitle,
      });
    }

    // If title changed, resolve any dangling links matching newTitle
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
    await db
      .delete(notes)
      .where(and(eq(notes.vaultId, existing.vaultId), like(notes.path, `${existing.path}/%`)));
  }

  await db.delete(notes).where(eq(notes.id, noteId));
  return c.json({ ok: true });
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

  // Backup current state before restoring
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

  // Rebuild outgoing links
  await db.delete(noteLinks).where(eq(noteLinks.sourceNoteId, noteId));
  const allNotes = await db
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(and(eq(notes.vaultId, note.vaultId), eq(notes.isFolder, false)))
    .all();
  const titleToId = new Map(allNotes.map((n) => [n.title, n.id]));

  for (const targetTitle of meta.links) {
    await db.insert(noteLinks).values({
      id: crypto.randomUUID(),
      vaultId: note.vaultId,
      sourceNoteId: noteId,
      targetNoteId: titleToId.get(targetTitle) ?? null,
      targetTitle,
    });
  }

  const updated = await db.select().from(notes).where(eq(notes.id, noteId)).get();
  return c.json({ note: updated });
});

// ==================== Batch Import Markdown Files ====================

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
  const existingNotes = await db.select().from(notes).where(eq(notes.vaultId, vaultId)).all();
  const existingByPath = new Map(existingNotes.map((n) => [n.path, n]));

  let importedCount = 0;
  let updatedCount = 0;

  // 1. Ensure parent folders exist & upsert notes
  for (const file of body.files) {
    const cleanPath = file.path.trim().replace(/^\/+/, '');
    if (!cleanPath || !cleanPath.toLowerCase().endsWith('.md')) continue;

    // Create parent folder entries if missing
    const parts = cleanPath.split('/').filter(Boolean);
    let folderPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      folderPath = folderPath ? `${folderPath}/${parts[i]}` : parts[i];
      if (!existingByPath.has(folderPath)) {
        const folderId = crypto.randomUUID();
        const folderRow = {
          id: folderId,
          vaultId,
          path: folderPath,
          title: parts[i],
          content: '',
          tags: '[]',
          wordCount: 0,
          isFolder: true,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(notes).values(folderRow);
        existingByPath.set(folderPath, folderRow);
      }
    }

    const title = titleFromPath(cleanPath, false);
    const meta = parseMarkdownMeta(file.content);
    const prev = existingByPath.get(cleanPath);

    if (prev && !prev.isFolder) {
      await db
        .update(notes)
        .set({
          content: file.content,
          tags: JSON.stringify(meta.tags),
          wordCount: meta.wordCount,
          updatedAt: now,
        })
        .where(eq(notes.id, prev.id));
      updatedCount += 1;
    } else if (!prev) {
      const id = crypto.randomUUID();
      const newNote = {
        id,
        vaultId,
        path: cleanPath,
        title,
        content: file.content,
        tags: JSON.stringify(meta.tags),
        wordCount: meta.wordCount,
        isFolder: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(notes).values(newNote);
      existingByPath.set(cleanPath, newNote);
      importedCount += 1;
    }
  }

  // 2. Rebuild all noteLinks in this vault so cross-references resolve cleanly
  await db.delete(noteLinks).where(eq(noteLinks.vaultId, vaultId));
  const allVaultFiles = await db
    .select()
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), eq(notes.isFolder, false)))
    .all();

  const titleToId = new Map(allVaultFiles.map((n) => [n.title, n.id]));
  let linkCount = 0;

  for (const n of allVaultFiles) {
    const meta = parseMarkdownMeta(n.content);
    for (const targetTitle of meta.links) {
      await db.insert(noteLinks).values({
        id: crypto.randomUUID(),
        vaultId,
        sourceNoteId: n.id,
        targetNoteId: titleToId.get(targetTitle) ?? null,
        targetTitle,
      });
      linkCount += 1;
    }
  }

  return c.json({ importedCount, updatedCount, linkCount });
});
