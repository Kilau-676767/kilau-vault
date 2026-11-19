import { Hono } from 'hono';
import { and, eq, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { vaults, notes } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppContext } from '../types';

export const vaultRoutes = new Hono<AppContext>();

vaultRoutes.use('*', authMiddleware);

vaultRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(c.env.DB);
  const list = await db
    .select()
    .from(vaults)
    .where(eq(vaults.userId, userId))
    .orderBy(desc(vaults.updatedAt))
    .all();

  return c.json({ vaults: list });
});

vaultRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ name?: string; description?: string }>();
  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: '知识库名称不能为空' }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = Date.now();
  const id = crypto.randomUUID();

  await db.insert(vaults).values({
    id,
    userId,
    name,
    description: body.description?.trim() ?? '',
    createdAt: now,
    updatedAt: now,
  });

  // Create an initial index note inside the new vault
  await db.insert(notes).values({
    id: crypto.randomUUID(),
    vaultId: id,
    path: 'README.md',
    title: 'README',
    content: `# ${name}\n\n开始记录你的第一篇笔记吧！`,
    tags: '[]',
    wordCount: 12,
    isFolder: false,
    createdAt: now,
    updatedAt: now,
  });

  return c.json(
    {
      vault: {
        id,
        userId,
        name,
        description: body.description?.trim() ?? '',
        createdAt: now,
        updatedAt: now,
      },
    },
    201
  );
});

vaultRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; description?: string }>();

  const db = drizzle(c.env.DB);
  const existing = await db
    .select()
    .from(vaults)
    .where(and(eq(vaults.id, id), eq(vaults.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ error: '知识库不存在' }, 404);
  }

  const now = Date.now();
  await db
    .update(vaults)
    .set({
      name: body.name?.trim() || existing.name,
      description: body.description !== undefined ? body.description.trim() : existing.description,
      updatedAt: now,
    })
    .where(eq(vaults.id, id));

  return c.json({ ok: true });
});

vaultRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = drizzle(c.env.DB);

  const existing = await db
    .select()
    .from(vaults)
    .where(and(eq(vaults.id, id), eq(vaults.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ error: '知识库不存在' }, 404);
  }

  await db.delete(vaults).where(eq(vaults.id, id));
  return c.json({ ok: true });
});
