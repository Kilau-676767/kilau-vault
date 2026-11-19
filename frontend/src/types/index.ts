export interface User {
  id: string;
  email: string;
  username: string;
  bio?: string;
  avatar?: string;
  createdAt: number;
}

export interface UserStats {
  vaultCount: number;
  noteCount: number;
  totalWords: number;
  storageBytes: number;
  quotaBytes: number;
  shareCount: number;
}

export interface Vault {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  vaultId: string;
  path: string;
  title: string;
  content: string;
  tags: string; // JSON string
  wordCount: number;
  isFolder: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BacklinkItem {
  noteId: string;
  title: string;
  path: string;
  snippet: string;
}

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

export interface GraphData {
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

export interface AnalyticsData {
  totalNotes: number;
  totalWords: number;
  totalLinks: number;
  isolatedCount: number;
  density: number;
  clusterCount: number;
  topTags: { tag: string; count: number }[];
  topHubs: { id: string; title: string; degree: number; pageRank: number }[];
  activityByDay: Record<string, number>;
}

export interface ShareItem {
  id: string;
  code: string;
  hasPassword: boolean;
  expiresAt: number | null;
  viewCount: number;
  createdAt: number;
}

export interface NoteRevision {
  id: string;
  noteId: string;
  vaultId: string;
  content: string;
  wordCount: number;
  label: string;
  createdAt: number;
}

export interface ImportResult {
  importedCount: number;
  updatedCount: number;
  linkCount: number;
}
