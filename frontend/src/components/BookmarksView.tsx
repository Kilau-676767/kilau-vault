import React, { useMemo, useState } from 'react';
import { Bookmark, FileText, Hash, Search, ArrowUpRight, X } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

export const BookmarksView: React.FC = () => {
  const { notes, openNote, toggleBookmark, setActiveView } = useAppStore();
  const [query, setQuery] = useState('');

  const bookmarkedNotes = useMemo(() => {
    const list = notes.filter((n) => !n.isFolder && n.isStarred);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.path.toLowerCase().includes(q) ||
        (n.content ?? n.excerpt ?? '').toLowerCase().includes(q)
    );
  }, [notes, query]);

  const cleanSnippet = (content: string) =>
    content
      .replace(/^#+\s+/gm, '')
      .replace(/\[\[([^[\]]+)\]\]/g, '$1')
      .replace(/[*`>_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Bookmark className="w-5 h-5 text-[var(--ochre)]" fill="currentColor" />
          <h2 className="font-serif-display text-xl font-bold text-[var(--fg-strong)]">
            书签收藏
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--ochre)]/15 text-[var(--ochre)] font-medium">
            {bookmarkedNotes.length}
          </span>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="在书签中筛选..."
            className="w-full bg-[var(--surface-raised)] border border-[var(--border)] focus:border-[var(--ochre)] rounded-full pl-8 pr-3 py-1.5 text-xs text-[var(--fg-strong)] outline-none transition"
          />
        </div>
      </div>

      {/* Empty State */}
      {bookmarkedNotes.length === 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-12 text-center space-y-3 max-w-lg mx-auto mt-12">
          <Bookmark className="w-10 h-10 text-[var(--ochre)]/50 mx-auto" />
          <div className="font-serif-display text-base font-semibold text-[var(--fg-strong)]">
            {query.trim() ? '未找到匹配的书签笔记' : '还没有收藏任何书签'}
          </div>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            在笔记编辑页面点击右上角或左侧文件树的「书签」图标，即可将常用或重要的笔记摘选到这里集中查看。
          </p>
          <button
            type="button"
            onClick={() => setActiveView('editor')}
            className="px-4 py-1.5 rounded-full bg-[var(--accent)] text-white text-xs font-medium cursor-pointer hover:opacity-90"
          >
            返回笔记工作区
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bookmarkedNotes.map((note) => {
            let parsedTags: string[] = [];
            try {
              parsedTags = JSON.parse(note.tags);
            } catch {
              parsedTags = [];
            }

            return (
              <div
                key={note.id}
                onClick={() => void openNote(note.id)}
                className="group bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--ochre)] rounded-2xl p-5 flex flex-col justify-between gap-3 cursor-pointer transition shadow-xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-[var(--ochre)] shrink-0" />
                      <h3 className="font-serif-display font-bold text-base text-[var(--fg-strong)] group-hover:text-[var(--ochre)] truncate transition">
                        {note.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-tip="移出书签"
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleBookmark(note.id);
                        }}
                        className="p-1 rounded-md text-[var(--muted)] hover:text-red-400 hover:bg-[var(--surface-muted)] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <ArrowUpRight className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--ochre)] transition" />
                    </div>
                  </div>

                  <div className="text-[11px] text-[var(--muted)] font-mono truncate">
                    {note.path}
                  </div>

                  <p className="text-xs text-[var(--muted-strong)] leading-relaxed line-clamp-3">
                    {cleanSnippet(note.content ?? note.excerpt ?? '') || '暂无正文内容'}
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1 overflow-hidden">
                    {parsedTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] bg-[var(--surface)] text-[var(--sage)] border border-[var(--border)]"
                      >
                        <Hash className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] text-[var(--muted)] shrink-0">
                    {note.wordCount} 字
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
