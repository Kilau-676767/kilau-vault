import type {
  AiSource,
  AnalyticsData,
  BacklinkItem,
  GraphData,
  ImportResult,
  Note,
  NoteRevision,
  SearchResult,
  ShareItem,
  User,
  UserStats,
  Vault,
  WebSource,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

function getToken(): string | null {
  return localStorage.getItem('kilau_vault_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || `请求失败 (${res.status})`) as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const authApi = {
  register: (email: string, username: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: User }>('/api/auth/me'),
  updateProfile: (data: { username: string; bio?: string; avatar?: string }) =>
    request<{ user: User }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
  getStats: () => request<UserStats>('/api/auth/stats'),
  deleteAccount: (password: string) =>
    request<{ ok: boolean }>('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),
};

export const vaultsApi = {
  list: () => request<{ vaults: Vault[] }>('/api/vaults'),
  create: (name: string, description?: string) =>
    request<{ vault: Vault }>('/api/vaults', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  rename: (id: string, name: string) =>
    request<{ ok: boolean }>(`/api/vaults/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/api/vaults/${id}`, { method: 'DELETE' }),
};

export const notesApi = {
  listByVault: (vaultId: string) =>
    request<{ notes: Note[] }>(`/api/notes/vault/${vaultId}`),
  exportVault: (vaultId: string) =>
    request<{ files: { path: string; content: string }[] }>(`/api/notes/vault/${vaultId}/export`),
  search: (vaultId: string, q: string) =>
    request<{ results: SearchResult[] }>(
      `/api/notes/vault/${vaultId}/search?q=${encodeURIComponent(q)}`
    ),
  getDetail: (noteId: string) =>
    request<{
      note: Note;
      backlinks: BacklinkItem[];
      unlinkedMentions: BacklinkItem[];
    }>(`/api/notes/${noteId}`),
  create: (vaultId: string, path: string, content?: string, isFolder = false) =>
    request<{ note: Note }>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ vaultId, path, content, isFolder }),
    }),
  update: (noteId: string, data: { content?: string; path?: string }) =>
    request<{ note: Note }>(`/api/notes/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  remove: (noteId: string) =>
    request<{ ok: boolean }>(`/api/notes/${noteId}`, { method: 'DELETE' }),
  toggleBookmark: (noteId: string, isStarred: boolean) =>
    request<{ note: Note }>(`/api/notes/${noteId}/bookmark`, {
      method: 'PATCH',
      body: JSON.stringify({ isStarred }),
    }),
  listRevisions: (noteId: string) =>
    request<{ revisions: NoteRevision[] }>(`/api/notes/${noteId}/revisions`),
  createRevision: (noteId: string, label?: string) =>
    request<{ revision: NoteRevision }>(`/api/notes/${noteId}/revisions`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  restoreRevision: (noteId: string, revisionId: string) =>
    request<{ note: Note }>(`/api/notes/${noteId}/restore/${revisionId}`, {
      method: 'POST',
    }),
  batchImport: (vaultId: string, files: { path: string; content: string }[]) =>
    request<ImportResult>(`/api/notes/vault/${vaultId}/import`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),
};

export const graphApi = {
  getVaultGraph: (vaultId: string) =>
    request<GraphData>(`/api/graph/vault/${vaultId}`),
  getAnalytics: (vaultId: string) =>
    request<AnalyticsData>(`/api/graph/vault/${vaultId}/analytics`),
};

export const shareApi = {
  create: (noteId: string, password?: string, expiresInDays?: number) =>
    request<{ share: ShareItem }>('/api/share', {
      method: 'POST',
      body: JSON.stringify({ noteId, password, expiresInDays }),
    }),
  listByNote: (noteId: string) =>
    request<{ shares: ShareItem[] }>(`/api/share/note/${noteId}`),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/api/share/${id}`, { method: 'DELETE' }),
  getPublic: (code: string, password?: string) => {
    const query = password ? `?password=${encodeURIComponent(password)}` : '';
    return request<{
      note: {
        title: string;
        content: string;
        tags: string[];
        updatedAt: number;
        wordCount: number;
      };
      viewCount: number;
    }>(`/api/share/public/${code}${query}`);
  },
};

export const aiApi = {
  chat: (payload: {
    question: string;
    scope: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    webSearch?: boolean;
    tavilyApiKey?: string;
    history: { role: 'user' | 'assistant'; content: string }[];
  }) => request<{
    answer: string;
    sources: AiSource[];
    sourceLinks: { source: string; target: string }[];
    webSources: WebSource[];
  }>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
};
