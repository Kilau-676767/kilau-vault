import React, { useMemo, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { useT } from '../stores/useI18nStore';
import { ImportModal } from './ImportModal';
import type { Note } from '../types';

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  note?: Note;
  children: TreeNode[];
}

function buildTree(notes: Note[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  const sorted = [...notes].sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.path.localeCompare(b.path, 'zh-CN');
  });

  for (const note of sorted) {
    const parts = note.path.split('/').filter(Boolean);
    let currentLevel = root;
    let accumPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumPath = accumPath ? `${accumPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      let existing = map.get(accumPath);
      if (!existing) {
        existing = {
          name: isLast && !note.isFolder && part.endsWith('.md') ? part.slice(0, -3) : part,
          path: accumPath,
          isFolder: isLast ? note.isFolder : true,
          note: isLast ? note : undefined,
          children: [],
        };
        map.set(accumPath, existing);
        currentLevel.push(existing);
      } else if (isLast) {
        existing.note = note;
        existing.isFolder = note.isFolder;
      }
      currentLevel = existing.children;
    }
  }

  return root;
}

export const FileTree: React.FC = () => {
  const { notes, activeNoteId, openNote, createNote, deleteNote, renameNote, toggleBookmark } =
    useAppStore();
  const { t } = useT();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    方法论: true,
    技术原理: true,
  });
  const [bookmarksOpen, setBookmarksOpen] = useState(true);
  const [creating, setCreating] = useState<{ isFolder: boolean; parentPath: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const tree = useMemo(() => buildTree(notes), [notes]);
  const bookmarkedNotes = useMemo(
    () => notes.filter((n) => !n.isFolder && n.isStarred),
    [notes]
  );

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creating || !newName.trim()) {
      setCreating(null);
      return;
    }
    const targetPath = creating.parentPath
      ? `${creating.parentPath}/${newName.trim()}`
      : newName.trim();
    await createNote(targetPath, creating.isFolder);
    if (creating.parentPath) {
      setExpanded((prev) => ({ ...prev, [creating.parentPath]: true }));
    }
    setCreating(null);
    setNewName('');
  };

  const handleRenameSubmit = async (e: React.FormEvent, note: Note) => {
    e.preventDefault();
    if (renameVal.trim() && renameVal.trim() !== note.path) {
      await renameNote(note.id, renameVal.trim());
    }
    setRenamingId(null);
  };

  const renderNode = (node: TreeNode, depth = 0) => {
    const isOpen = expanded[node.path] ?? false;
    const isActive = node.note?.id === activeNoteId;

    if (node.isFolder) {
      return (
        <div key={node.path}>
          <div
            onClick={() => setExpanded((s) => ({ ...s, [node.path]: !isOpen }))}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className="group flex items-center justify-between py-1 pr-2 text-sm text-[var(--muted-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg-strong)] rounded-lg cursor-pointer select-none transition"
          >
            <div className="flex items-center gap-1.5 truncate">
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
              )}
              {isOpen ? (
                <FolderOpen className="w-3.5 h-3.5 text-[var(--ochre)] shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-[var(--ochre)] shrink-0" />
              )}
              <span className="truncate">{node.name}</span>
            </div>
            <div className="hidden group-hover:flex items-center gap-1">
              <button
                type="button"
                title="在此文件夹新建笔记"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreating({ isFolder: false, parentPath: node.path });
                  setNewName('');
                }}
                className="p-0.5 hover:text-[var(--fg-strong)] text-[var(--muted)]"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              {node.note && (
                <button
                  type="button"
                  title="删除文件夹"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除文件夹「${node.name}」及其下所有笔记吗？`)) {
                      void deleteNote(node.note!.id);
                    }
                  }}
                  className="p-0.5 hover:text-red-400 text-[var(--muted)]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {isOpen && (
            <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    if (node.note && renamingId === node.note.id) {
      return (
        <form
          key={node.path}
          onSubmit={(e) => handleRenameSubmit(e, node.note!)}
          style={{ paddingLeft: `${depth * 14 + 22}px` }}
          className="pr-2 py-0.5"
        >
          <input
            autoFocus
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={() => setRenamingId(null)}
            className="w-full bg-[var(--bg)] border border-[var(--accent)] rounded px-1.5 py-0.5 text-xs text-[var(--fg-strong)] outline-none"
          />
        </form>
      );
    }

    return (
      <div
        key={node.path}
        onClick={() => node.note && void openNote(node.note.id)}
        style={{ paddingLeft: `${depth * 14 + 22}px` }}
        className={`group flex items-center justify-between py-1 pr-2 text-sm rounded-lg cursor-pointer select-none transition ${
          isActive
            ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
            : 'text-[var(--muted-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--fg-strong)]'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
          <span className="truncate">{node.name}</span>
        </div>
        {node.note && (
          <div className="hidden group-hover:flex items-center gap-1">
            <button
              type="button"
              data-tip={node.note.isStarred ? '取消书签' : '加入书签'}
              onClick={(e) => {
                e.stopPropagation();
                void toggleBookmark(node.note!.id);
              }}
              className={`p-0.5 ${
                node.note.isStarred
                  ? 'text-[var(--ochre)]'
                  : 'text-[var(--muted)] hover:text-[var(--ochre)]'
              }`}
            >
              <Bookmark
                className="w-3 h-3"
                fill={node.note.isStarred ? 'currentColor' : 'none'}
              />
            </button>
            <button
              type="button"
              data-tip="重命名"
              onClick={(e) => {
                e.stopPropagation();
                setRenamingId(node.note!.id);
                setRenameVal(node.note!.path);
              }}
              className="p-0.5 hover:text-[var(--fg-strong)] text-[var(--muted)]"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              data-tip="删除"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`确定删除笔记「${node.name}」吗？`)) {
                  void deleteNote(node.note!.id);
                }
              }}
              className="p-0.5 hover:text-red-400 text-[var(--muted)]"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted)]">
          {t.fileDirectory}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-tip={t.newNote}
            onClick={() => {
              setCreating({ isFolder: false, parentPath: '' });
              setNewName('');
            }}
            className="p-1 text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-muted)] rounded-md transition cursor-pointer"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-tip={t.newFolder}
            onClick={() => {
              setCreating({ isFolder: true, parentPath: '' });
              setNewName('');
            }}
            className="p-1 text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-muted)] rounded-md transition cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-tip="批量导入本地 Markdown"
            onClick={() => setImportOpen(true)}
            className="p-1 text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-muted)] rounded-md transition cursor-pointer"
          >
            <Upload className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inline creation input */}
      {creating && (
        <form
          onSubmit={handleCreateSubmit}
          className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-raised)]"
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => setCreating(null)}
            placeholder={creating.isFolder ? t.newFolderPlaceholder : t.newNotePlaceholder}
            className="w-full bg-[var(--bg)] border border-[var(--accent)] rounded-md px-2 py-1 text-xs text-[var(--fg-strong)] outline-none"
          />
        </form>
      )}

      {/* Bookmarks Section */}
      {bookmarkedNotes.length > 0 && (
        <div className="border-b border-[var(--border)] px-2 py-2 bg-[var(--surface-raised)]/40">
          <button
            type="button"
            onClick={() => setBookmarksOpen((v) => !v)}
            className="w-full flex items-center justify-between px-1 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--ochre)] cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Bookmark className="w-3 h-3" fill="currentColor" />
              书签收藏 ({bookmarkedNotes.length})
            </span>
            {bookmarksOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
          {bookmarksOpen && (
            <div className="mt-1 space-y-0.5 max-h-36 overflow-y-auto">
              {bookmarkedNotes.map((bn) => (
                <div
                  key={bn.id}
                  onClick={() => void openNote(bn.id)}
                  className={`group flex items-center justify-between px-2 py-1 text-xs rounded-lg cursor-pointer transition ${
                    bn.id === activeNoteId
                      ? 'bg-[var(--ochre)]/15 text-[var(--ochre)] font-medium'
                      : 'text-[var(--fg)] hover:bg-[var(--surface-muted)]'
                  }`}
                >
                  <span className="truncate">{bn.title}</span>
                  <button
                    type="button"
                    data-tip="移出书签"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleBookmark(bn.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--ochre)] cursor-pointer"
                  >
                    <Bookmark className="w-3 h-3" fill="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {tree.length === 0 ? (
          <div className="text-xs text-[var(--muted)] text-center py-6">
            {t.emptyNotes}
          </div>
        ) : (
          tree.map((node) => renderNode(node))
        )}
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
};
