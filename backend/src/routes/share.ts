import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { notes, shareLinks, vaults } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { hashPassword, verifyPassword } from '../utils/crypto';
import type { AppContext } from '../types';

export const shareRoutes = new Hono<AppContext>();

shareRoutes.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    noteId?: string;
    password?: string;
    expiresInDays?: number;
  }>();

  if (!body.noteId) {
    return c.json({ error: '缺少 noteId' }, 400);
  }

  const db = drizzle(c.env.DB);
  const note = await db.select().from(notes).where(eq(notes.id, body.noteId)).get();
  if (!note) return c.json({ error: '笔记不存在' }, 404);

  const vault = await db
    .select()
    .from(vaults)
    .where(and(eq(vaults.id, note.vaultId), eq(vaults.userId, userId)))
    .get();
  if (!vault) return c.json({ error: '无权限分享该笔记' }, 403);

  const code = crypto.randomUUID().slice(0, 8);
  const passwordHash = body.password?.trim()
    ? await hashPassword(body.password.trim())
    : null;
  const expiresAt =
    body.expiresInDays && body.expiresInDays > 0
      ? Date.now() + body.expiresInDays * 86400 * 1000
      : null;

  const id = crypto.randomUUID();
  const now = Date.now();

  await db.insert(shareLinks).values({
    id,
    noteId: note.id,
    userId,
    code,
    passwordHash,
    expiresAt,
    viewCount: 0,
    createdAt: now,
  });

  return c.json(
    {
      share: {
        id,
        code,
        hasPassword: Boolean(passwordHash),
        expiresAt,
        createdAt: now,
      },
    },
    201
  );
});

shareRoutes.get('/note/:noteId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('noteId');
  const db = drizzle(c.env.DB);

  const list = await db
    .select({
      id: shareLinks.id,
      code: shareLinks.code,
      expiresAt: shareLinks.expiresAt,
      viewCount: shareLinks.viewCount,
      createdAt: shareLinks.createdAt,
      passwordHash: shareLinks.passwordHash,
    })
    .from(shareLinks)
    .where(and(eq(shareLinks.noteId, noteId), eq(shareLinks.userId, userId)))
    .all();

  return c.json({
    shares: list.map((s) => ({
      id: s.id,
      code: s.code,
      hasPassword: Boolean(s.passwordHash),
      expiresAt: s.expiresAt,
      viewCount: s.viewCount,
      createdAt: s.createdAt,
    })),
  });
});

shareRoutes.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = drizzle(c.env.DB);

  await db
    .delete(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.userId, userId)));
  return c.json({ ok: true });
});

// Public endpoint (no auth required)
shareRoutes.get('/public/:code', async (c) => {
  const code = c.req.param('code');
  const password = c.req.query('password');
  const db = drizzle(c.env.DB);

  const link = await db.select().from(shareLinks).where(eq(shareLinks.code, code)).get();
  if (!link) return c.json({ error: '分享链接不存在或已失效' }, 404);

  if (link.expiresAt && Date.now() > link.expiresAt) {
    return c.json({ error: '该分享链接已过期' }, 410);
  }

  if (link.passwordHash) {
    if (!password) {
      return c.json({ requiresPassword: true, error: '需要输入访问密码' }, 401);
    }
    const ok = await verifyPassword(password, link.passwordHash);
    if (!ok) {
      return c.json({ requiresPassword: true, error: '访问密码错误' }, 401);
    }
  }

  const note = await db.select().from(notes).where(eq(notes.id, link.noteId)).get();
  if (!note) return c.json({ error: '原笔记已被删除' }, 404);

  await db
    .update(shareLinks)
    .set({ viewCount: link.viewCount + 1 })
    .where(eq(shareLinks.id, link.id));

  return c.json({
    note: {
      title: note.title,
      content: note.content,
      tags: JSON.parse(note.tags || '[]'),
      updatedAt: note.updatedAt,
      wordCount: note.wordCount,
    },
    viewCount: link.viewCount + 1,
  });
});
