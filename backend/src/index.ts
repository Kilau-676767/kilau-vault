import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth';
import { vaultRoutes } from './routes/vaults';
import { noteRoutes } from './routes/notes';
import { graphRoutes } from './routes/graph';
import { shareRoutes } from './routes/share';
import { aiRoutes } from './routes/ai';
import type { AppContext } from './types';

const app = new Hono<AppContext>();

app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.get('/api/health', (c) => c.json({ status: 'ok', service: 'web-obsidian-api' }));

app.route('/api/auth', authRoutes);
app.route('/api/vaults', vaultRoutes);
app.route('/api/notes', noteRoutes);
app.route('/api/graph', graphRoutes);
app.route('/api/share', shareRoutes);
app.route('/api/ai', aiRoutes);

export default app;
