export interface GraphNode {
  id: string;
  title: string;
  path: string;
  tags: string[];
  wordCount: number;
  inDegree: number;
  outDegree: number;
  degree: number;
  pageRank: number;
  cluster: number;
  isIsolated: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphAnalysisResult {
  nodes: GraphNode[];
  links: GraphLink[];
  metrics: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    isolatedCount: number;
    clusterCount: number;
    hubNote: { id: string; title: string; pageRank: number; degree: number } | null;
  };
}

interface RawNote {
  id: string;
  title: string;
  path: string;
  tags: string;
  wordCount: number;
}

interface RawLink {
  sourceNoteId: string;
  targetNoteId: string | null;
}

/**
 * Compute graph topology, PageRank centrality, degree centrality,
 * and connected-component / label-propagation communities.
 */
export function analyzeKnowledgeGraph(
  rawNotes: RawNote[],
  rawLinks: RawLink[]
): GraphAnalysisResult {
  const nodeMap = new Map<string, GraphNode>();

  for (const n of rawNotes) {
    let parsedTags: string[] = [];
    try {
      parsedTags = JSON.parse(n.tags);
    } catch {
      parsedTags = [];
    }
    nodeMap.set(n.id, {
      id: n.id,
      title: n.title,
      path: n.path,
      tags: parsedTags,
      wordCount: n.wordCount,
      inDegree: 0,
      outDegree: 0,
      degree: 0,
      pageRank: 1 / Math.max(1, rawNotes.length),
      cluster: 0,
      isIsolated: true,
    });
  }

  // Deduplicate edges and filter to valid resolved target nodes
  const edgeSet = new Set<string>();
  const links: GraphLink[] = [];
  const outNeighbors = new Map<string, string[]>();
  const undirectedNeighbors = new Map<string, string[]>();

  for (const id of nodeMap.keys()) {
    outNeighbors.set(id, []);
    undirectedNeighbors.set(id, []);
  }

  for (const l of rawLinks) {
    if (!l.targetNoteId || l.sourceNoteId === l.targetNoteId) continue;
    if (!nodeMap.has(l.sourceNoteId) || !nodeMap.has(l.targetNoteId)) continue;

    const key = `${l.sourceNoteId}->${l.targetNoteId}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);

    links.push({ source: l.sourceNoteId, target: l.targetNoteId });
    outNeighbors.get(l.sourceNoteId)!.push(l.targetNoteId);
    undirectedNeighbors.get(l.sourceNoteId)!.push(l.targetNoteId);
    undirectedNeighbors.get(l.targetNoteId)!.push(l.sourceNoteId);

    const src = nodeMap.get(l.sourceNoteId)!;
    const tgt = nodeMap.get(l.targetNoteId)!;
    src.outDegree += 1;
    tgt.inDegree += 1;
  }

  // Degree & isolation
  let isolatedCount = 0;
  for (const node of nodeMap.values()) {
    node.degree = node.inDegree + node.outDegree;
    node.isIsolated = node.degree === 0;
    if (node.isIsolated) isolatedCount += 1;
  }

  // PageRank (damping = 0.85, 20 iterations)
  const N = nodeMap.size;
  if (N > 0) {
    const d = 0.85;
    let ranks = new Map<string, number>();
    for (const id of nodeMap.keys()) ranks.set(id, 1 / N);

    for (let iter = 0; iter < 20; iter++) {
      const nextRanks = new Map<string, number>();
      let danglingSum = 0;
      for (const [id, rank] of ranks.entries()) {
        if ((outNeighbors.get(id)?.length ?? 0) === 0) {
          danglingSum += rank;
        }
      }
      const base = (1 - d) / N + (d * danglingSum) / N;
      for (const id of nodeMap.keys()) {
        nextRanks.set(id, base);
      }
      for (const [srcId, targets] of outNeighbors.entries()) {
        if (targets.length === 0) continue;
        const share = (d * (ranks.get(srcId) ?? 0)) / targets.length;
        for (const tgtId of targets) {
          nextRanks.set(tgtId, (nextRanks.get(tgtId) ?? 0) + share);
        }
      }
      ranks = nextRanks;
    }

    for (const [id, rank] of ranks.entries()) {
      nodeMap.get(id)!.pageRank = Number(rank.toFixed(4));
    }
  }

  // Community / Connected-component clustering (BFS)
  const visited = new Set<string>();
  let clusterId = 0;
  for (const id of nodeMap.keys()) {
    if (visited.has(id)) continue;
    clusterId += 1;
    const queue = [id];
    visited.add(id);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      nodeMap.get(curr)!.cluster = clusterId;
      for (const nb of undirectedNeighbors.get(curr) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
  }

  const nodes = Array.from(nodeMap.values());
  let hubNote: GraphAnalysisResult['metrics']['hubNote'] = null;
  for (const n of nodes) {
    if (!hubNote || n.pageRank > hubNote.pageRank) {
      hubNote = { id: n.id, title: n.title, pageRank: n.pageRank, degree: n.degree };
    }
  }

  const density = N > 1 ? Number((links.length / (N * (N - 1))).toFixed(4)) : 0;

  return {
    nodes,
    links,
    metrics: {
      nodeCount: N,
      edgeCount: links.length,
      density,
      isolatedCount,
      clusterCount: clusterId,
      hubNote,
    },
  };
}
