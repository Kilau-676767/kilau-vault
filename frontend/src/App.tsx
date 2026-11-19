import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  BarChart3,
  Calendar,
  Columns2,
  Download,
  Edit3,
  Eye,
  FileText,
  LogOut,
  Moon,
  PanelLeft,
  PanelRight,
  Pin,
  Plus,
  Route,
  Search,
  Share2,
  Sun,
  X,
} from 'lucide-react';
import { useAppStore } from './stores/useAppStore';
import { AuthScreen } from './components/AuthScreen';
import { FileTree } from './components/FileTree';
import { CodeMirrorEditor } from './components/CodeMirrorEditor';
import { MarkdownPreview } from './components/MarkdownPreview';
import { BacklinksPanel } from './components/BacklinksPanel';
import { GraphView } from './components/GraphView';
import { DashboardView } from './components/DashboardView';
import { CommandPalette } from './components/CommandPalette';
import { ShareModal } from './components/ShareModal';
import { PublicShareView } from './components/PublicShareView';
import { UserProfileModal } from './components/UserProfileModal';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useT } from './stores/useI18nStore';

export function App() {
  const shareMatch = /^\/share\/([a-zA-Z0-9_-]+)/.exec(window.location.pathname);
  if (shareMatch) {
    return <PublicShareView code={shareMatch[1]} />;
  }

  return <WorkspaceApp />;
}

const WorkspaceApp: React.FC = () => {
  const {
    user,
    authChecked,
    checkAuth,
    logout,
    vaults,
    currentVaultId,
    selectVault,
    createVault,
    notes,
    openTabIds,
    activeNoteId,
    activeView,
    setActiveView,
    editorMode,
    setEditorMode,
    openNote,
    openNoteByTitle,
    closeTab,
    createNote,
    updateNoteContent,
    setCommandPaletteOpen,
    saving,
  } = useAppStore();

  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  );
  const { t } = useT();

  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem('kilau-vault-theme', next);
  };

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? null,
    [notes, activeNoteId]
  );

  const noteTitles = useMemo(
    () => notes.filter((n) => !n.isFolder).map((n) => n.title),
    [notes]
  );

  const handleEditorChange = (newContent: string) => {
    if (!activeNote) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    const targetId = activeNote.id;
    saveTimerRef.current = window.setTimeout(() => {
      void updateNoteContent(targetId, newContent);
    }, 600);
  };

  const handleDailyNote = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = notes.find((n) => !n.isFolder && n.title === today);
    if (existing) {
      await openNote(existing.id);
    } else {
      await createNote(
        `日记/${today}.md`,
        false,
        `# ${today} 每日随笔\n\n## 今日计划\n- [ ] \n\n## 灵感与阅读\n\n\n#日记\n`
      );
    }
  };

  const handleExportZip = async () => {
    const zip = new JSZip();
    for (const n of notes) {
      if (!n.isFolder) {
        zip.file(n.path, n.content);
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const vaultName = vaults.find((v) => v.id === currentVaultId)?.name ?? 'vault';
    a.href = url;
    a.download = `${vaultName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center text-sm text-[var(--muted)]">
        {t.verifyingAuth}
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      {/* Kilau-style Top Navigation Bar */}
      <header className="h-14 bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border)] px-4 flex items-center justify-between shrink-0 z-30">
        {/* Left: Brand Mark + Primary Nav Links */}
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveView('editor')}
            className="group flex items-center gap-2.5 cursor-pointer"
          >
            <span className="w-8 h-8 rounded-full border border-[var(--border-strong)] group-hover:border-[var(--accent)] flex items-center justify-center text-[var(--accent)] transition-transform duration-200 group-hover:-rotate-12">
              <Route className="w-4 h-4" />
            </span>
            <span className="font-serif-display text-base font-bold text-[var(--fg-strong)] tracking-tight">
              Kilau Vault
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveView('editor')}
              className={`relative h-9 px-3 rounded-full text-[13px] font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'editor'
                  ? 'text-[var(--fg-strong)] bg-[var(--surface-raised)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-raised)]/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              {t.navWorkspace}
              {activeView === 'editor' && (
                <span className="absolute bottom-0.5 left-3 right-3 h-[1.5px] bg-[var(--accent)] rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('graph')}
              className={`relative h-9 px-3 rounded-full text-[13px] font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'graph'
                  ? 'text-[var(--fg-strong)] bg-[var(--surface-raised)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-raised)]/60'
              }`}
            >
              <Pin className="w-3.5 h-3.5 rotate-45" />
              {t.navGraph}
              {activeView === 'graph' && (
                <span className="absolute bottom-0.5 left-3 right-3 h-[1.5px] bg-[var(--accent)] rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className={`relative h-9 px-3 rounded-full text-[13px] font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'dashboard'
                  ? 'text-[var(--fg-strong)] bg-[var(--surface-raised)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-raised)]/60'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {t.navDashboard}
              {activeView === 'dashboard' && (
                <span className="absolute bottom-0.5 left-3 right-3 h-[1.5px] bg-[var(--accent)] rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleDailyNote()}
              className="h-9 px-3 rounded-full text-[13px] font-medium text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-raised)]/60 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              {t.navDaily}
            </button>
          </nav>
        </div>

        {/* Right: Search, Language, Theme, Export, User Profile, Logout */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]/70 hover:border-[var(--border-strong)] text-xs text-[var(--muted)] hover:text-[var(--fg-strong)] flex items-center gap-2 transition cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.quickSearch}</span>
            <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)]">
              ⌘P
            </kbd>
          </button>

          <LanguageSwitcher />

          <button
            type="button"
            data-tip={theme === 'dark' ? t.themeLight : t.themeDark}
            onClick={toggleTheme}
            className="w-9 h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)]/70 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] flex items-center justify-center text-[var(--fg)] transition cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            data-tip={t.exportZip}
            onClick={() => void handleExportZip()}
            className="w-9 h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)]/70 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] flex items-center justify-center text-[var(--fg)] transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-tip="个人中心与账户设置"
            onClick={() => setProfileModalOpen(true)}
            className="h-9 pl-1.5 pr-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]/70 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] flex items-center gap-2 transition cursor-pointer"
          >
            <span
              style={{ backgroundColor: user.avatar || '#d98a73' }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
            >
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden sm:inline text-xs font-medium text-[var(--fg-strong)] max-w-[90px] truncate">
              {user.username}
            </span>
          </button>

          <button
            type="button"
            data-tip={t.logout}
            onClick={logout}
            className="w-9 h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)]/70 hover:border-red-500/40 hover:text-red-400 flex items-center justify-center text-[var(--muted)] transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (Vault Switcher + File Tree) */}
        {leftSidebarOpen && (
          <aside className="w-64 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col shrink-0">
            <div className="p-2.5 border-b border-[var(--border)] flex items-center gap-1.5">
              <select
                value={currentVaultId ?? ''}
                onChange={(e) => void selectVault(e.target.value)}
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--fg-strong)] outline-none focus:border-[var(--accent)]"
              >
                {vaults.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="新建知识库"
                onClick={() => {
                  const name = prompt('请输入新知识库名称：');
                  if (name?.trim()) void createVault(name.trim());
                }}
                className="p-1.5 bg-[var(--surface-raised)] hover:bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg text-[var(--muted-strong)] hover:text-[var(--fg-strong)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="收起侧边栏"
                onClick={() => setLeftSidebarOpen(false)}
                className="p-1.5 text-[var(--muted)] hover:text-[var(--fg-strong)] cursor-pointer"
              >
                <PanelLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              <FileTree />
            </div>
          </aside>
        )}

        {/* Center Workspace */}
        <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg)]">
          {activeView === 'graph' && <GraphView />}
          {activeView === 'dashboard' && <DashboardView />}

          {activeView === 'editor' && (
            <>
              {/* Tabs Bar */}
              <div className="h-10 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between px-2 shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {!leftSidebarOpen && (
                    <button
                      type="button"
                      title="展开目录"
                      onClick={() => setLeftSidebarOpen(true)}
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--fg-strong)] cursor-pointer"
                    >
                      <PanelLeft className="w-4 h-4" />
                    </button>
                  )}

                  {openTabIds.map((tabId) => {
                    const n = notes.find((item) => item.id === tabId);
                    if (!n) return null;
                    const isActive = tabId === activeNoteId;
                    return (
                      <div
                        key={tabId}
                        onClick={() => void openNote(tabId)}
                        className={`group flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-lg cursor-pointer max-w-[190px] border-t border-x transition ${
                          isActive
                            ? 'bg-[var(--bg)] text-[var(--fg-strong)] border-[var(--border)] font-medium'
                            : 'bg-transparent text-[var(--muted)] border-transparent hover:bg-[var(--surface-raised)] hover:text-[var(--fg)]'
                        }`}
                      >
                        <span className="truncate">{n.title}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(tabId);
                          }}
                          className="opacity-50 group-hover:opacity-100 hover:text-[var(--accent)] cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Editor Mode & Actions */}
                {activeNote && (
                  <div className="flex items-center gap-1.5 shrink-0 pl-2">
                    <span className="text-[11px] text-[var(--muted)] mr-2 hidden sm:inline">
                      {saving ? t.syncing : t.synced}
                    </span>

                    <div className="flex bg-[var(--surface-raised)] rounded-lg p-0.5 border border-[var(--border)]">
                      <button
                        type="button"
                        data-tip={t.modeEdit}
                        onClick={() => setEditorMode('edit')}
                        className={`p-1 rounded-md cursor-pointer transition ${
                          editorMode === 'edit'
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--muted)] hover:text-[var(--fg-strong)]'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        data-tip={t.modeSplit}
                        onClick={() => setEditorMode('split')}
                        className={`p-1 rounded-md cursor-pointer transition ${
                          editorMode === 'split'
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--muted)] hover:text-[var(--fg-strong)]'
                        }`}
                      >
                        <Columns2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        data-tip={t.modePreview}
                        onClick={() => setEditorMode('preview')}
                        className={`p-1 rounded-md cursor-pointer transition ${
                          editorMode === 'preview'
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--muted)] hover:text-[var(--fg-strong)]'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      data-tip={t.shareNote}
                      onClick={() => setShareModalOpen(true)}
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-raised)] rounded-lg cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      data-tip="切换右侧图钉关联面板"
                      onClick={() => setRightSidebarOpen((v) => !v)}
                      className={`p-1.5 rounded-lg cursor-pointer ${
                        rightSidebarOpen
                          ? 'text-[var(--accent)] bg-[var(--accent)]/12'
                          : 'text-[var(--muted)] hover:text-[var(--fg-strong)]'
                      }`}
                    >
                      <PanelRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Editor & Preview Body */}
              {activeNote ? (
                <div className="flex-1 flex overflow-hidden">
                  {(editorMode === 'edit' || editorMode === 'split') && (
                    <div
                      className={`h-full overflow-hidden ${
                        editorMode === 'split' ? 'w-1/2 border-r border-[var(--border)]' : 'w-full'
                      }`}
                    >
                      <CodeMirrorEditor
                        noteId={activeNote.id}
                        initialContent={activeNote.content}
                        noteTitles={noteTitles}
                        onChange={handleEditorChange}
                      />
                    </div>
                  )}

                  {(editorMode === 'preview' || editorMode === 'split') && (
                    <div
                      className={`h-full overflow-y-auto px-8 py-6 bg-[var(--bg)] ${
                        editorMode === 'split' ? 'w-1/2' : 'w-full max-w-4xl mx-auto'
                      }`}
                    >
                      <MarkdownPreview
                        content={activeNote.content}
                        onWikilinkClick={(title) => void openNoteByTitle(title)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-[var(--muted)] gap-3">
                  <p className="font-serif-display text-base">{t.noOpenNote}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void createNote('未命名笔记.md')}
                      className="px-4 py-1.5 rounded-full bg-[var(--accent)] hover:opacity-90 text-white text-xs cursor-pointer"
                    >
                      {t.createNoteBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommandPaletteOpen(true)}
                      className="px-4 py-1.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--fg)] text-xs cursor-pointer"
                    >
                      {t.searchShortcutBtn}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* Right Sidebar (Backlinks & Outline) */}
        {activeView === 'editor' && rightSidebarOpen && (
          <aside className="w-72 bg-[var(--surface)] border-l border-[var(--border)] shrink-0 overflow-hidden">
            <BacklinksPanel />
          </aside>
        )}
      </div>

      {/* Command Palette */}
      <CommandPalette />

      {/* Share Modal */}
      {shareModalOpen && activeNote && (
        <ShareModal
          noteId={activeNote.id}
          noteTitle={activeNote.title}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {/* User Profile Modal */}
      {profileModalOpen && (
        <UserProfileModal onClose={() => setProfileModalOpen(false)} />
      )}
    </div>
  );
};

export default App;
