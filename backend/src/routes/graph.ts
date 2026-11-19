import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { vaults, notes, noteLinks } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { analyzeKnowledgeGraph } from '../utils/graph';
import type { AppContext } from '../types';

export const graphRoutes = new Hono<AppContext>();

graphRoutes.use('*', authMiddleware);

graphRoutes.get('/vault/:vaultId', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const db = drizzle(c.env.DB);

  const vault = await db
    .select()
    .from(vaults)
    .where(and(eq(vaults.id, vaultId), eq(vaults.userId, userId)))
    .get();
  if (!vault) return c.json({ error: '知识库不存在' }, 404);

  const vaultNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      path: notes.path,
      tags: notes.tags,
      wordCount: notes.wordCount,
    })
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), eq(notes.isFolder, false)))
    .all();

  const vaultLinks = await db
    .select({
      sourceNoteId: noteLinks.sourceNoteId,
      targetNoteId: noteLinks.targetNoteId,
    })
    .from(noteLinks)
    .where(eq(noteLinks.vaultId, vaultId))
    .all();

  const result = analyzeKnowledgeGraph(vaultNotes, vaultLinks);
  return c.json(result);
});

graphRoutes.get('/vault/:vaultId/analytics', async (c) => {
  const userId = c.get('userId');
  const vaultId = c.req.param('vaultId');
  const db = drizzle(c.env.DB);

  const vault = await db
    .select()
    .from(vaults)
    .where(and(eq(vaults.id, vaultId), eq(vaults.userId, userId)))
    .get();
  if (!vault) return c.json({ error: '知识库不存在' }, 404);

  const vaultNotes = await db
    .select()
    .from(notes)
    .where(and(eq(notes.vaultId, vaultId), eq(notes.isFolder, false)))
    .all();

  const vaultLinks = await db
    .select({
      sourceNoteId: noteLinks.sourceNoteId,
      targetNoteId: noteLinks.targetNoteId,
    })
    .from(noteLinks)
    .where(eq(noteLinks.vaultId, vaultId))
    .all();

  const graph = analyzeKnowledgeGraph(
    vaultNotes.map((n) => ({
      id: n.id,
      title: n.title,
      path: n.path,
      tags: n.tags,
      wordCount: n.wordCount,
    })),
    vaultLinks
  );

  const tagFrequency: Record<string, number> = {};
  const activityByDay: Record<string, number> = {};
  let totalWords = 0;

  for (const n of vaultNotes) {
    totalWords += n.wordCount;
    try {
      const parsed: string[] = JSON.parse(n.tags);
      for (const t of parsed) {
        tagFrequency[t] = (tagFrequency[t] ?? 0) + 1;
      }
    } catch {
      // ignore invalid tags JSON
    }
    const day = new Date(n.updatedAt).toISOString().slice(0, 10);
    activityByDay[day] = (activityByDay[day] ?? 0) + 1;
  }

  const topTags = Object.entries(tagFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));

  const topHubs = [...graph.nodes]
    .sort((a, b) => b.pageRank - a.pageRank)
    .slice(0, 5)
    .map((n) => ({
      id: n.id,
      title: n.title,
      degree: n.degree,
      pageRank: n.pageRank,
    }));

  return c.json({
    totalNotes: vaultNotes.length,
    totalWords,
    totalLinks: graph.metrics.edgeCount,
    isolatedCount: graph.metrics.isolatedCount,
    density: graph.metrics.density,
    clusterCount: graph.metrics.clusterCount,
    topTags,
    topHubs,
    activityByDay,
  });
});
