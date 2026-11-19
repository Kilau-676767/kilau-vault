import React, { useEffect, useMemo, useState } from 'react';
import { Search, FileText, Plus } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { useT } from '../stores/useI18nStore';

export const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    notes,
    openNote,
    openNoteByTitle,
  } = useAppStore();
  const { t } = useT();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      } else if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) setQuery('');
  }, [commandPaletteOpen]);

  const filtered = useMemo(() => {
    const files = notes.filter((n) => !n.isFolder);
    const q = query.trim().toLowerCase();
    if (!q) return files.slice(0, 12);
    return files
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.path.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [notes, query]);

  if (!commandPaletteOpen) return null;

  return (
    <div
      onClick={() => setCommandPaletteOpen(false)}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-24 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="flex-1 bg-transparent text-sm text-[var(--fg-strong)] outline-none placeholder-[var(--muted)]"
          />
          <kbd className="text-[10px] text-[var(--muted)] bg-[var(--surface)] px-1.5 py-0.5 rounded border border-[var(--border)]">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                void openNote(n.id);
                setCommandPaletteOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-left rounded-xl hover:bg-[var(--accent)]/15 text-sm text-[var(--fg)] transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5 truncate">
                <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <div className="truncate">
                  <div className="font-medium truncate">{n.title}</div>
                  <div className="text-[11px] text-[var(--muted)] truncate">{n.path}</div>
                </div>
              </div>
              <span className="text-[11px] text-[var(--muted)] shrink-0">{n.wordCount} {t.wordsUnit}</span>
            </button>
          ))}

          {query.trim() && (
            <button
              type="button"
              onClick={() => {
                void openNoteByTitle(query.trim());
                setCommandPaletteOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-xl hover:bg-[var(--accent)]/15 text-sm text-[var(--accent)] transition cursor-pointer mt-1 border-t border-[var(--border)]"
            >
              <Plus className="w-4 h-4" />
              {t.createAndOpen}：「{query.trim()}」
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
