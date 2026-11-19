import React, { useEffect, useState } from 'react';
import { graphApi } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useT } from '../stores/useI18nStore';
import type { AnalyticsData } from '../types';
import { FileText, Hash, Pin, Sparkles, Type, BarChart3 } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { currentVaultId, openNote } = useAppStore();
  const { t } = useT();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentVaultId) return;
    setLoading(true);
    graphApi
      .getAnalytics(currentVaultId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [currentVaultId]);

  if (loading || !data) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[var(--muted)] bg-[var(--bg)]">
        {t.loading}
      </div>
    );
  }

  const today = new Date();
  const days: { date: string; count: number }[] = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, count: data.activityByDay[iso] ?? 0 });
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] p-6 space-y-6">
      <div className="flex items-center gap-2 font-serif-display text-xl font-bold text-[var(--fg-strong)]">
        <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
        {t.dashboardTitle}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
            <span>{t.totalNotes}</span>
            <FileText className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div className="font-serif-display text-2xl font-bold text-[var(--fg-strong)]">
            {data.totalNotes}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1">
            {data.isolatedCount} {t.isolatedSub}
          </div>
        </div>

        <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
            <span>{t.totalWords}</span>
            <Type className="w-4 h-4 text-[var(--teal)]" />
          </div>
          <div className="font-serif-display text-2xl font-bold text-[var(--fg-strong)]">
            {data.totalWords.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1">{t.wordCountSub}</div>
        </div>

        <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
            <span>{t.totalLinks}</span>
            <Pin className="w-4 h-4 text-[var(--sage)] rotate-45" />
          </div>
          <div className="font-serif-display text-2xl font-bold text-[var(--fg-strong)]">
            {data.totalLinks}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1">
            {t.density} {data.density}
          </div>
        </div>

        <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
            <span>{t.clusters}</span>
            <Sparkles className="w-4 h-4 text-[var(--ochre)]" />
          </div>
          <div className="font-serif-display text-2xl font-bold text-[var(--fg-strong)]">
            {data.clusterCount}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1">BFS Components</div>
        </div>
      </div>

      {/* Activity Heatmap */}
      <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-5">
        <div className="font-serif-display text-sm font-semibold text-[var(--fg-strong)] mb-3">
          {t.heatmapTitle}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => {
            const opacity =
              d.count === 0
                ? 'bg-[var(--surface-muted)]'
                : d.count === 1
                ? 'bg-[var(--accent)]/40'
                : d.count === 2
                ? 'bg-[var(--accent)]/70'
                : 'bg-[var(--accent)]';
            return (
              <div
                key={d.date}
                title={`${d.date}: 更新 ${d.count} 篇笔记`}
                className={`w-4 h-4 rounded-sm ${opacity} border border-[var(--border)]`}
              />
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Hubs */}
        <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-5">
          <div className="font-serif-display text-sm font-semibold text-[var(--fg-strong)] mb-3">
            核心知识枢纽 (PageRank Top 5)
          </div>
          {data.topHubs.length === 0 ? (
            <div className="text-xs text-[var(--muted)]">暂无数据</div>
          ) : (
            <div className="space-y-2.5">
              {data.topHubs.map((hub, idx) => (
                <div
                  key={hub.id}
                  onClick={() => void openNote(hub.id)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="w-5 h-5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <span className="text-sm text-[var(--fg-strong)] truncate">{hub.title}</span>
                  </div>
                  <div className="text-xs text-[var(--muted)] shrink-0 space-x-3">
                    <span>度数 {hub.degree}</span>
                    <span className="text-[var(--accent)]">PR {hub.pageRank}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Tags */}
        <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-5">
          <div className="font-serif-display text-sm font-semibold text-[var(--fg-strong)] mb-3">
            高频标签分布
          </div>
          {data.topTags.length === 0 ? (
            <div className="text-xs text-[var(--muted)]">
              暂无标签，在笔记中使用 #标签 即可自动归档
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.topTags.map((t) => {
                const max = data.topTags[0]?.count || 1;
                const pct = Math.round((t.count / max) * 100);
                return (
                  <div key={t.tag} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--fg)] flex items-center gap-1">
                        <Hash className="w-3 h-3 text-[var(--sage)]" />
                        {t.tag}
                      </span>
                      <span className="text-[var(--muted)]">{t.count} 篇</span>
                    </div>
                    <div className="h-1.5 bg-[var(--surface-muted)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--sage)] rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
