import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { users, vaults, notes, shareLinks } from '../db/schema';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { seedDefaultVault } from '../utils/seed';
import { authMiddleware } from '../middleware/auth';
import type { AppContext } from '../types';

export const authRoutes = new Hono<AppContext>();

authRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ email?: string; username?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const username = body.username?.trim();
  const password = body.password;

  if (!email || !username || !password) {
    return c.json({ error: '邮箱、用户名和密码均不能为空' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: '密码长度至少为 6 位' }, 400);
  }

  const db = drizzle(c.env.DB);
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return c.json({ error: '该邮箱已被注册' }, 409);
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  await db.insert(users).values({
    id: userId,
    email,
    username,
    passwordHash,
    bio: '',
    avatar: '',
    createdAt: now,
  });

  await seedDefaultVault(db, userId);

  const token = await sign(
    {
      sub: userId,
      email,
      username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    c.env.JWT_SECRET
  );

  return c.json(
    {
      token,
      user: { id: userId, email, username, bio: '', avatar: '', createdAt: now },
    },
    201
  );
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return c.json({ error: '请输入邮箱和密码' }, 400);
  }

  const db = drizzle(c.env.DB);
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  const token = await sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    c.env.JWT_SECRET
  );

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      bio: user.bio,
      avatar: user.avatar,
      createdAt: user.createdAt,
    },
  });
});

authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = drizzle(c.env.DB);
  const user = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      bio: users.bio,
      avatar: users.avatar,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  return c.json({ user });
});

authRoutes.put('/profile', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ username?: string; bio?: string; avatar?: string }>();
  const username = body.username?.trim();
  if (!username) {
    return c.json({ error: '用户名不能为空' }, 400);
  }

  const db = drizzle(c.env.DB);
  await db
    .update(users)
    .set({
      username,
      bio: body.bio?.trim() ?? '',
      avatar: body.avatar?.trim() ?? '',
    })
    .where(eq(users.id, userId));

  const updated = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      bio: users.bio,
      avatar: users.avatar,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return c.json({ user: updated });
});

authRoutes.put('/password', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ oldPassword?: string; newPassword?: string }>();
  if (!body.oldPassword || !body.newPassword) {
    return c.json({ error: '请填写原密码和新密码' }, 400);
  }
  if (body.newPassword.length < 6) {
    return c.json({ error: '新密码长度至少为 6 位' }, 400);
  }

  const db = drizzle(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return c.json({ error: '用户不存在' }, 404);

  const valid = await verifyPassword(body.oldPassword, user.passwordHash);
  if (!valid) {
    return c.json({ error: '原密码不正确' }, 400);
  }

  const newHash = await hashPassword(body.newPassword);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
  return c.json({ ok: true });
});

authRoutes.get('/stats', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = drizzle(c.env.DB);

  const userVaults = await db
    .select({ id: vaults.id })
    .from(vaults)
    .where(eq(vaults.userId, userId))
    .all();

  const vaultIds = userVaults.map((v) => v.id);
  let noteCount = 0;
  let totalWords = 0;
  let storageBytes = 0;

  if (vaultIds.length > 0) {
    const allNotes = await db
      .select({
        content: notes.content,
        wordCount: notes.wordCount,
        isFolder: notes.isFolder,
      })
      .from(notes)
      .where(inArray(notes.vaultId, vaultIds))
      .all();

    const encoder = new TextEncoder();
    for (const n of allNotes) {
      if (!n.isFolder) {
        noteCount += 1;
        totalWords += n.wordCount;
        storageBytes += encoder.encode(n.content).length;
      }
    }
  }

  const shares = await db
    .select({ id: shareLinks.id })
    .from(shareLinks)
    .where(eq(shareLinks.userId, userId))
    .all();

  return c.json({
    vaultCount: userVaults.length,
    noteCount,
    totalWords,
    storageBytes,
    quotaBytes: 50 * 1024 * 1024, // 50 MB
    shareCount: shares.length,
  });
});

authRoutes.delete('/account', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ password?: string }>();
  if (!body.password) {
    return c.json({ error: '请输入密码以确认注销账户' }, 400);
  }

  const db = drizzle(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return c.json({ error: '用户不存在' }, 404);

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: '密码错误，无法注销账户' }, 401);
  }

  await db.delete(users).where(eq(users.id, userId));
  return c.json({ ok: true });
});
