import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { AppContext } from '../types';

export const authMiddleware = createMiddleware<AppContext>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未授权，请先登录' }, 401);
  }

  const token = authHeader.slice(7).trim();
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    c.set('userId', String(payload.sub));
    c.set('email', String(payload.email));
    c.set('username', String(payload.username));
    await next();
  } catch {
    return c.json({ error: '登录凭证已失效，请重新登录' }, 401);
  }
});
