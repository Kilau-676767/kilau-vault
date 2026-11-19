import { create } from 'zustand';
import { authApi, notesApi, vaultsApi } from '../api/client';
import type { BacklinkItem, ImportResult, Note, User, Vault } from '../types';

export type ActiveView = 'editor' | 'graph' | 'dashboard';
export type EditorMode = 'edit' | 'split' | 'preview';

interface AppState {
  user: User | null;
  authChecked: boolean;
  vaults: Vault[];
  currentVaultId: string | null;
  notes: Note[];
  openTabIds: string[];
  activeNoteId: string | null;
  activeView: ActiveView;
  editorMode: EditorMode;
  backlinks: BacklinkItem[];
  unlinkedMentions: BacklinkItem[];
  commandPaletteOpen: boolean;
  saving: boolean;

  setCommandPaletteOpen: (open: boolean) => void;
  setActiveView: (view: ActiveView) => void;
  setEditorMode: (mode: EditorMode) => void;

  checkAuth: () => Promise<void>;
  setAuth: (token: string, user: User) => Promise<void>;
  setUser: (user: User) => void;
  logout: () => void;

  loadVaults: () => Promise<void>;
  selectVault: (vaultId: string) => Promise<void>;
  createVault: (name: string) => Promise<void>;
  renameVault: (id: string, name: string) => Promise<void>;
  deleteVault: (id: string) => Promise<void>;

  openNote: (noteId: string) => Promise<void>;
  openNoteByTitle: (title: string) => Promise<void>;
  closeTab: (noteId: string) => void;
  createNote: (path: string, isFolder?: boolean, content?: string) => Promise<Note | null>;
  updateNoteContent: (noteId: string, content: string) => Promise<void>;
  renameNote: (noteId: string, newPath: string) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  refreshBacklinks: (noteId: string) => Promise<void>;
  restoreNoteRevision: (noteId: string, revisionId: string) => Promise<void>;
  batchImportNotes: (files: { path: string; content: string }[]) => Promise<ImportResult | null>;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  authChecked: false,
  vaults: [],
  currentVaultId: null,
  notes: [],
  openTabIds: [],
  activeNoteId: null,
  activeView: 'editor',
  editorMode: 'split',
  backlinks: [],
  unlinkedMentions: [],
  commandPaletteOpen: false,
  saving: false,

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setActiveView: (view) => set({ activeView: view }),
  setEditorMode: (mode) => set({ editorMode: mode }),

  checkAuth: async () => {
    const token = localStorage.getItem('obs_token');
    if (!token) {
      set({ user: null, authChecked: true });
      return;
    }
    try {
      const { user } = await authApi.me();
      set({ user, authChecked: true });
      await get().loadVaults();
    } catch {
      localStorage.removeItem('obs_token');
      set({ user: null, authChecked: true });
    }
  },

  setAuth: async (token, user) => {
    localStorage.setItem('obs_token', token);
    set({ user, authChecked: true });
    await get().loadVaults();
  },

  setUser: (user) => set({ user }),

  logout: () => {
    localStorage.removeItem('obs_token');
    set({
      user: null,
      vaults: [],
      currentVaultId: null,
      notes: [],
      openTabIds: [],
      activeNoteId: null,
      backlinks: [],
      unlinkedMentions: [],
    });
  },

  loadVaults: async () => {
    const { vaults } = await vaultsApi.list();
    set({ vaults });
    if (vaults.length > 0) {
      const current = get().currentVaultId;
      const target = vaults.find((v) => v.id === current)?.id ?? vaults[0].id;
      await get().selectVault(target);
    }
  },

  selectVault: async (vaultId) => {
    set({
      currentVaultId: vaultId,
      openTabIds: [],
      activeNoteId: null,
      backlinks: [],
      unlinkedMentions: [],
    });
    const { notes } = await notesApi.listByVault(vaultId);
    set({ notes });
    const firstFile = notes.find((n) => !n.isFolder);
    if (firstFile) {
      await get().openNote(firstFile.id);
    }
  },

  createVault: async (name) => {
    const { vault } = await vaultsApi.create(name);
    set((s) => ({ vaults: [vault, ...s.vaults] }));
    await get().selectVault(vault.id);
  },

  renameVault: async (id, name) => {
    await vaultsApi.rename(id, name);
    set((s) => ({
      vaults: s.vaults.map((v) => (v.id === id ? { ...v, name } : v)),
    }));
  },

  deleteVault: async (id) => {
    await vaultsApi.remove(id);
    const remaining = get().vaults.filter((v) => v.id !== id);
    set({ vaults: remaining });
    if (get().currentVaultId === id && remaining.length > 0) {
      await get().selectVault(remaining[0].id);
    } else if (remaining.length === 0) {
      set({ currentVaultId: null, notes: [], openTabIds: [], activeNoteId: null });
    }
  },

  openNote: async (noteId) => {
    const target = get().notes.find((n) => n.id === noteId);
    if (!target || target.isFolder) return;

    set((s) => ({
      activeNoteId: noteId,
      activeView: 'editor',
      openTabIds: s.openTabIds.includes(noteId) ? s.openTabIds : [...s.openTabIds, noteId],
    }));
    await get().refreshBacklinks(noteId);
  },

  openNoteByTitle: async (title) => {
    const clean = title.split('|')[0].split('#')[0].trim();
    if (!clean) return;
    const existing = get().notes.find(
      (n) => !n.isFolder && n.title.toLowerCase() === clean.toLowerCase()
    );
    if (existing) {
      await get().openNote(existing.id);
      return;
    }
    // Create new note if it doesn't exist yet (Obsidian behavior!)
    const created = await get().createNote(`${clean}.md`, false, `# ${clean}\n\n`);
    if (created) {
      await get().openNote(created.id);
    }
  },

  closeTab: (noteId) => {
    set((s) => {
      const nextTabs = s.openTabIds.filter((id) => id !== noteId);
      let nextActive = s.activeNoteId;
      if (s.activeNoteId === noteId) {
        const idx = s.openTabIds.indexOf(noteId);
        nextActive = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0] ?? null;
      }
      return { openTabIds: nextTabs, activeNoteId: nextActive };
    });
    const nextId = get().activeNoteId;
    if (nextId) {
      void get().refreshBacklinks(nextId);
    } else {
      set({ backlinks: [], unlinkedMentions: [] });
    }
  },

  createNote: async (path, isFolder = false, content) => {
    const vaultId = get().currentVaultId;
    if (!vaultId) return null;
    const { note } = await notesApi.create(vaultId, path, content, isFolder);
    set((s) => ({ notes: [...s.notes, note] }));
    if (!isFolder) {
      await get().openNote(note.id);
    }
    return note;
  },

  updateNoteContent: async (noteId, content) => {
    // Optimistically update local state
    set((s) => ({
      saving: true,
      notes: s.notes.map((n) => (n.id === noteId ? { ...n, content } : n)),
    }));
    try {
      const { note } = await notesApi.update(noteId, { content });
      set((s) => ({
        saving: false,
        notes: s.notes.map((n) => (n.id === noteId ? note : n)),
      }));
      if (get().activeNoteId === noteId) {
        await get().refreshBacklinks(noteId);
      }
    } catch {
      set({ saving: false });
    }
  },

  renameNote: async (noteId, newPath) => {
    const vaultId = get().currentVaultId;
    await notesApi.update(noteId, { path: newPath });
    if (vaultId) {
      const { notes } = await notesApi.listByVault(vaultId);
      set({ notes });
    }
  },

  deleteNote: async (noteId) => {
    await notesApi.remove(noteId);
    const vaultId = get().currentVaultId;
    if (vaultId) {
      const { notes } = await notesApi.listByVault(vaultId);
      set((s) => {
        const validIds = new Set(notes.map((n) => n.id));
        const nextTabs = s.openTabIds.filter((id) => validIds.has(id));
        const nextActive =
          s.activeNoteId && validIds.has(s.activeNoteId)
            ? s.activeNoteId
            : nextTabs[0] ?? null;
        return { notes, openTabIds: nextTabs, activeNoteId: nextActive };
      });
    }
  },

  refreshBacklinks: async (noteId) => {
    try {
      const { backlinks, unlinkedMentions } = await notesApi.getDetail(noteId);
      if (get().activeNoteId === noteId) {
        set({ backlinks, unlinkedMentions });
      }
    } catch {
      // ignore transient error
    }
  },

  restoreNoteRevision: async (noteId, revisionId) => {
    const { note } = await notesApi.restoreRevision(noteId, revisionId);
    set((s) => ({
      notes: s.notes.map((n) => (n.id === noteId ? note : n)),
    }));
    await get().refreshBacklinks(noteId);
  },

  batchImportNotes: async (files) => {
    const vaultId = get().currentVaultId;
    if (!vaultId) return null;
    const result = await notesApi.batchImport(vaultId, files);
    const { notes } = await notesApi.listByVault(vaultId);
    set({ notes });
    if (get().activeNoteId) {
      await get().refreshBacklinks(get().activeNoteId!);
    }
    return result;
  },
}));
