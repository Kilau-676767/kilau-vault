import React, { useEffect, useState } from 'react';
import { shareApi } from '../api/client';
import { MarkdownPreview } from './MarkdownPreview';
import { Lock, Sparkles, Eye } from 'lucide-react';

interface PublicShareViewProps {
  code: string;
}

export const PublicShareView: React.FC<PublicShareViewProps> = ({ code }) => {
  const [note, setNote] = useState<{
    title: string;
    content: string;
    tags: string[];
    updatedAt: number;
    wordCount: number;
  } | null>(null);
  const [viewCount, setViewCount] = useState(0);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadNote = async (pwd?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await shareApi.getPublic(code, pwd);
      setNote(res.note);
      setViewCount(res.viewCount);
      setRequiresPassword(false);
    } catch (err) {
      const e = err as Error & { status?: number; data?: { requiresPassword?: boolean } };
      if (e.status === 401 && e.data?.requiresPassword) {
        setRequiresPassword(true);
        if (pwd) setError('访问密码错误，请重试');
      } else {
        setError(e.message || '无法加载分享内容');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (loading && !requiresPassword) {
    return (
      <div className="min-h-screen bg-[#161616] flex items-center justify-center text-sm text-[#888]">
        正在加载分享笔记...
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-[#161616] flex items-center justify-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadNote(password);
          }}
          className="w-full max-w-sm bg-[#1e1e1e] border border-[#333] rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-white font-semibold">
            <Lock className="w-4 h-4 text-[#a882ff]" />
            该笔记已设置访问密码
          </div>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入访问密码..."
            className="w-full bg-[#161616] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#7f6df2]"
          />
          {error && <div className="text-xs text-red-400">{error}</div>}
          <button
            type="submit"
            className="w-full bg-[#7f6df2] hover:bg-[#8e7ef7] text-white text-sm font-medium py-2 rounded-lg cursor-pointer"
          >
            解锁阅读
          </button>
        </form>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-[#161616] flex items-center justify-center text-sm text-red-400">
        {error || '笔记不存在'}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-serif-display text-sm font-bold text-[var(--fg-strong)]">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          Kilau Vault 公开分享
        </a>
        <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
          <span>{note.wordCount} 字</span>
          <span className="flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" />
            {viewCount} 次阅读
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-serif-display text-3xl font-bold text-[var(--fg-strong)] mb-4">{note.title}</h1>
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {note.tags.map((t) => (
              <span
                key={t}
                className="px-2.5 py-0.5 text-xs rounded-full bg-[var(--surface-raised)] text-[var(--sage)] border border-[var(--border)]"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
        <MarkdownPreview content={note.content} />
      </main>
    </div>
  );
};
