import React, { useEffect, useMemo, useState } from 'react';
import { Pin, Sparkles, ListTree, ArrowUpRight, History, Camera } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { useT } from '../stores/useI18nStore';
import { notesApi } from '../api/client';
import { VersionDiffModal } from './VersionDiffModal';
import type { NoteRevision } from '../types';

export const BacklinksPanel: React.FC = () => {
  const {
    notes,
    activeNoteId,
    backlinks,
    unlinkedMentions,
    openNote,
    refreshBacklinks,
    restoreNoteRevision,
  } = useAppStore();
  const { t } = useT();
  const [tab, setTab] = useState<'links' | 'outline' | 'history'>('links');
  const [revisions, setRevisions] = useState<NoteRevision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<NoteRevision | null>(null);
  const [creatingSnap, setCreatingSnap] = useState(false);

  const loadRevisions = async (noteId: string) => {
    try {
      const res = await notesApi.listRevisions(noteId);
      setRevisions(res.revisions);
    } catch {
      setRevisions([]);
    }
  };

  useEffect(() => {
    if (activeNoteId && tab === 'history') {
      void loadRevisions(activeNoteId);
    }
  }, [activeNoteId, tab]);

  const handleManualSnapshot = async () => {
    if (!activeNoteId) return;
    setCreatingSnap(true);
    try {
      const label = prompt('输入快照备注（可留空）：') ?? undefined;
      await notesApi.createRevision(activeNoteId, label);
      await loadRevisions(activeNoteId);
    } finally {
      setCreatingSnap(false);
    }
  };

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? null,
    [notes, activeNoteId]
  );

  const headings = useMemo(() => {
    if (!activeNote?.content) return [];
    const lines = activeNote.content.split('\n');
    const result: { level: number; text: string }[] = [];
    for (const line of lines) {
      const m = /^(#{1,4})\s+(.+)$/.exec(line.trim());
      if (m) {
        result.push({ level: m[1].length, text: m[2].trim() });
      }
    }
    return result;
  }, [activeNote]);

  const handleConvertToLink = async (sourceNoteId: string) => {
    if (!activeNote) return;
    let sourceContent = notes.find((n) => n.id === sourceNoteId)?.content;
    if (sourceContent === undefined) {
      const detail = await notesApi.getDetail(sourceNoteId);
      sourceContent = detail.note.content ?? '';
    }

    const escaped = activeNote.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!\\[\\[)${escaped}(?!\\]\\])`, 'i');
    const newContent = sourceContent.replace(regex, `[[${activeNote.title}]]`);
    if (newContent !== sourceContent) {
      await notesApi.update(sourceNoteId, { content: newContent });
      await refreshBacklinks(activeNote.id);
    }
  };

  if (!activeNote) {
    return (
      <div className="p-4 text-xs text-[var(--muted)] text-center mt-10">
        {t.selectNoteHint}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] px-2 pt-2 gap-1">
        <button
          type="button"
          onClick={() => setTab('links')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition cursor-pointer ${
            tab === 'links'
              ? 'bg-[var(--surface-raised)] text-[var(--accent)] border-t border-x border-[var(--border)]'
              : 'text-[var(--muted)] hover:text-[var(--fg-strong)]'
          }`}
        >
          <Pin className="w-3.5 h-3.5 rotate-45" />
          {t.backlinksTab} ({backlinks.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('outline')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-t-lg transition cursor-pointer ${
            tab === 'outline'
              ? 'bg-[var(--surface-raised)] text-[var(--accent)] border-t border-x border-[var(--border)]'
              : 'text-[var(--muted)] hover:text-[var(--fg-strong)]'
          }`}
        >
          <ListTree className="w-3.5 h-3.5" />
          {t.outlineTab} ({headings.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-t-lg transition cursor-pointer ${
            tab === 'history'
              ? 'bg-[var(--surface-raised)] text-[var(--accent)] border-t border-x border-[var(--border)]'
              : 'text-[var(--muted)] hover:text-[var(--fg-strong)]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          版本
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {tab === 'links' ? (
          <>
            {/* Linked Mentions */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2 flex items-center justify-between">
                <span>{t.linkedMentions}</span>
                <span className="text-[var(--accent)]">{backlinks.length}</span>
              </div>
              {backlinks.length === 0 ? (
                <div className="text-xs text-[var(--muted)] py-2 opacity-75">
                  {t.noBacklinks}
                </div>
              ) : (
                <div className="space-y-2">
                  {backlinks.map((item) => (
                    <div
                      key={item.noteId}
                      onClick={() => void openNote(item.noteId)}
                      className="p-2.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition group"
                    >
                      <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-strong)] group-hover:text-[var(--accent)] mb-1">
                        <span className="flex items-center gap-1.5 truncate">
                          <Pin className="w-3 h-3 text-[var(--accent)] rotate-45 shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      </div>
                      <p className="text-[11px] text-[var(--muted)] line-clamp-2 leading-relaxed">
                        {item.snippet}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unlinked Mentions */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[var(--ochre)]" />
                  {t.unlinkedMentions}
                </span>
                <span>{unlinkedMentions.length}</span>
              </div>
              {unlinkedMentions.length === 0 ? (
                <div className="text-xs text-[var(--muted)] py-2 opacity-75">
                  {t.noUnlinked}
                </div>
              ) : (
                <div className="space-y-2">
                  {unlinkedMentions.map((item) => (
                    <div
                      key={item.noteId}
                      className="p-2.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => void openNote(item.noteId)}
                          className="text-xs font-medium text-[var(--fg-strong)] hover:text-[var(--accent)] truncate cursor-pointer"
                        >
                          {item.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleConvertToLink(item.noteId)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/25 transition cursor-pointer shrink-0"
                        >
                          <Pin className="w-2.5 h-2.5 rotate-45" />
                          {t.pinAsLink}
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] line-clamp-2">{item.snippet}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : tab === 'outline' ? (
          <div className="space-y-1">
            {headings.length === 0 ? (
              <div className="text-xs text-[var(--muted)] py-2">{t.noHeadings}</div>
            ) : (
              headings.map((h, i) => (
                <div
                  key={i}
                  style={{ paddingLeft: `${(h.level - 1) * 12 + 4}px` }}
                  className="text-xs text-[var(--muted-strong)] hover:text-[var(--fg-strong)] py-1 truncate"
                >
                  <span className="text-[var(--accent)] mr-1.5 font-mono text-[10px]">
                    H{h.level}
                  </span>
                  {h.text}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              disabled={creatingSnap}
              onClick={() => void handleManualSnapshot()}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/25 text-xs font-medium transition cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              {creatingSnap ? '创建中...' : '保存当前版本快照'}
            </button>

            {revisions.length === 0 ? (
              <div className="text-xs text-[var(--muted)] text-center py-4">
                暂无历史快照（编辑保存或点击上方按钮生成）
              </div>
            ) : (
              <div className="space-y-2">
                {revisions.map((rev) => (
                  <div
                    key={rev.id}
                    onClick={() => setSelectedRevision(rev)}
                    className="p-2.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition"
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-[var(--fg-strong)] mb-1">
                      <span>{rev.label || '历史快照'}</span>
                      <span className="text-[10px] text-[var(--accent)]">Diff 对比</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                      <span>{new Date(rev.createdAt).toLocaleString('zh-CN')}</span>
                      <span>{rev.wordCount} 字</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedRevision && (
        <VersionDiffModal
          noteTitle={activeNote.title}
          currentContent={activeNote.content ?? ''}
          revision={selectedRevision}
          onRestore={async (revId) => {
            await restoreNoteRevision(activeNote.id, revId);
            await loadRevisions(activeNote.id);
          }}
          onClose={() => setSelectedRevision(null)}
        />
      )}
    </div>
  );
};
