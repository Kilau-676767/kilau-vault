import React, { useEffect, useState } from 'react';
import { shareApi } from '../api/client';
import type { ShareItem } from '../types';
import { Copy, Check, Link, Trash2, X, Lock } from 'lucide-react';

interface ShareModalProps {
  noteId: string;
  noteTitle: string;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ noteId, noteTitle, onClose }) => {
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [password, setPassword] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadShares = async () => {
    const res = await shareApi.listByNote(noteId);
    setShares(res.shares);
  };

  useEffect(() => {
    void loadShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await shareApi.create(noteId, password.trim() || undefined, expiresInDays);
      setPassword('');
      await loadShares();
    } finally {
      setLoading(false);
    }
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/share/${code}`;
    void navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#1e1e1e] border border-[#3a3a3a] rounded-xl shadow-2xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">公开分享笔记</h3>
            <p className="text-xs text-[#888] truncate max-w-xs">{noteTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#888] hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-3 bg-[#161616] p-4 rounded-lg border border-[#333]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#999] mb-1">访问密码 (可选)</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="留空则公开访问"
                className="w-full bg-[#1e1e1e] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#7f6df2]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#999] mb-1">有效期</label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="w-full bg-[#1e1e1e] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#7f6df2]"
              >
                <option value={1}>1 天</option>
                <option value={7}>7 天</option>
                <option value={30}>30 天</option>
                <option value={0}>永久有效</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7f6df2] hover:bg-[#8e7ef7] text-white text-xs font-medium py-2 rounded-lg transition cursor-pointer"
          >
            {loading ? '生成中...' : '生成分享短链'}
          </button>
        </form>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          <div className="text-xs font-medium text-[#888]">已创建的分享链接 ({shares.length})</div>
          {shares.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-[#262626] border border-[#333] text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                <Link className="w-3.5 h-3.5 text-[#a882ff] shrink-0" />
                <span className="text-white font-mono">/share/{s.code}</span>
                {s.hasPassword && (
                  <span title="已加密">
                    <Lock className="w-3 h-3 text-amber-400" />
                  </span>
                )}
                <span className="text-[#777] text-[11px]">浏览 {s.viewCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => copyLink(s.code)}
                  className="p-1 text-[#aaa] hover:text-white cursor-pointer"
                  title="复制链接"
                >
                  {copiedCode === s.code ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await shareApi.remove(s.id);
                    await loadShares();
                  }}
                  className="p-1 text-[#aaa] hover:text-red-400 cursor-pointer"
                  title="撤销分享"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
