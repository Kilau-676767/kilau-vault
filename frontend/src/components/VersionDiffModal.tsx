import React, { useMemo, useState } from 'react';
import { computeLineDiff } from '../utils/diff';
import type { NoteRevision } from '../types';
import { History, RotateCcw, X } from 'lucide-react';

interface VersionDiffModalProps {
  noteTitle: string;
  currentContent: string;
  revision: NoteRevision;
  onRestore: (revisionId: string) => Promise<void>;
  onClose: () => void;
}

export const VersionDiffModal: React.FC<VersionDiffModalProps> = ({
  noteTitle,
  currentContent,
  revision,
  onRestore,
  onClose,
}) => {
  const [restoring, setRestoring] = useState(false);

  const diffLines = useMemo(
    () => computeLineDiff(revision.content, currentContent),
    [revision.content, currentContent]
  );

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const d of diffLines) {
      if (d.type === 'added') added++;
      if (d.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await onRestore(revision.id);
      onClose();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-[var(--accent)]" />
            <div>
              <div className="text-sm font-semibold text-[var(--fg-strong)]">
                版本对比：{noteTitle}
              </div>
              <div className="text-[11px] text-[var(--muted)] space-x-2">
                <span>{revision.label || '历史快照'}</span>
                <span>·</span>
                <span>{new Date(revision.createdAt).toLocaleString('zh-CN')}</span>
                <span>·</span>
                <span className="text-emerald-400">+{stats.added} 新增行</span>
                <span className="text-red-400">-{stats.removed} 删减行</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={restoring}
              onClick={() => void handleRestore()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {restoring ? '恢复中...' : '回滚到此版本'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--muted)] hover:text-[var(--fg-strong)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="px-5 py-2 bg-[var(--bg)] border-b border-[var(--border)] text-[11px] text-[var(--muted)] flex items-center justify-between">
          <span>
            <span className="inline-block w-2.5 h-2.5 rounded-xs bg-red-500/30 border border-red-500/50 mr-1 align-middle" />
            红色为历史快照内容（当前已删除/修改）
          </span>
          <span>
            <span className="inline-block w-2.5 h-2.5 rounded-xs bg-emerald-500/30 border border-emerald-500/50 mr-1 align-middle" />
            绿色为当前版本新增内容
          </span>
        </div>

        {/* Diff Body */}
        <div className="flex-1 overflow-y-auto bg-[var(--bg)] font-mono text-xs leading-6 p-3">
          {diffLines.map((item, idx) => {
            const bg =
              item.type === 'added'
                ? 'bg-emerald-500/12 text-emerald-300'
                : item.type === 'removed'
                ? 'bg-red-500/12 text-red-300'
                : 'text-[var(--muted-strong)]';
            const sign = item.type === 'added' ? '+' : item.type === 'removed' ? '-' : ' ';

            return (
              <div key={idx} className={`flex px-2 rounded-xs ${bg}`}>
                <span className="w-8 shrink-0 text-right pr-2 opacity-40 select-none">
                  {item.oldNum ?? ''}
                </span>
                <span className="w-8 shrink-0 text-right pr-2 opacity-40 select-none">
                  {item.newNum ?? ''}
                </span>
                <span className="w-4 shrink-0 select-none font-bold">{sign}</span>
                <span className="whitespace-pre-wrap break-all flex-1">
                  {item.line || ' '}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
