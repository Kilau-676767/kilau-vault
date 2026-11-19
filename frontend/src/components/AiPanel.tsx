import React, { useEffect, useRef, useState } from 'react';
import { aiApi } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { MarkdownPreview } from './MarkdownPreview';
import { MiniPinGraph } from './MiniPinGraph';
import type { AiMessage, AiSource } from '../types';
import {
  Bot,
  Database,
  ExternalLink,
  Globe,
  Pin,
  Send,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  tavilyApiKey?: string;
}

const PRESETS = [
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
  },
  {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
  {
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
  },
  {
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
  },
];

function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem('kilau-vault-ai-config');
    if (raw) return JSON.parse(raw) as AiConfig;
  } catch {
    // ignore
  }
  return {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
  };
}

interface AiPanelProps {
  onClose: () => void;
}

export const AiPanel: React.FC<AiPanelProps> = ({ onClose }) => {
  const { vaults, currentVaultId, selectVault, openNote } = useAppStore();
  const [scope, setScope] = useState<string>('all'); // default: all vaults
  const [config, setConfig] = useState<AiConfig>(loadAiConfig);
  const [showSettings, setShowSettings] = useState<boolean>(() => !loadAiConfig().apiKey);
  const [savedNotice, setSavedNotice] = useState('');

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('kilau-vault-ai-width'));
    return saved >= 320 && saved <= 780 ? saved : 420;
  });

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const maxW = Math.min(780, Math.floor(window.innerWidth * 0.7));
      const nextW = Math.max(320, Math.min(maxW, window.innerWidth - ev.clientX));
      setPanelWidth(nextW);
    };

    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setPanelWidth((w) => {
        localStorage.setItem('kilau-vault-ai-width', String(w));
        return w;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('kilau-vault-ai-config', JSON.stringify(config));
    setSavedNotice('配置已保存');
    setTimeout(() => {
      setSavedNotice('');
      setShowSettings(false);
    }, 800);
  };

  const handleSend = async (customQuestion?: string) => {
    const question = (customQuestion ?? input).trim();
    if (!question || loading) return;

    if (!config.apiKey.trim()) {
      setShowSettings(true);
      setError('请先填写并保存 API Key');
      return;
    }

    setError('');
    if (!customQuestion) setInput('');

    const userMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setLoading(true);

    try {
      const res = await aiApi.chat({
        question,
        scope,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        webSearch,
        tavilyApiKey: config.tavilyApiKey,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const assistantMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.answer,
        sources: res.sources,
        sourceLinks: res.sourceLinks,
        webSources: res.webSources,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '问答请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSourceClick = async (src: AiSource) => {
    if (src.vaultId !== currentVaultId) {
      await selectVault(src.vaultId);
    }
    await openNote(src.noteId);
  };

  return (
    <aside
      style={{ width: `${panelWidth}px` }}
      className="relative bg-[var(--surface)] border-l border-[var(--border)] flex flex-col shrink-0 h-full"
    >
      {/* Left-edge Resize Handle */}
      <div
        onMouseDown={startResize}
        title="左右拖拽调整 AI 面板宽度"
        className="absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-[var(--accent)]/60 active:bg-[var(--accent)] transition-colors z-30"
      />
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface)]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-serif-display text-sm font-bold text-[var(--fg-strong)]">
            对话自己
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-tip="清空对话"
            onClick={() => setMessages([])}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-raised)] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-tip="配置 API Key 与模型"
            onClick={() => setShowSettings((v) => !v)}
            className={`p-1.5 rounded-lg cursor-pointer transition ${
              showSettings
                ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-raised)]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-tip="关闭 AI 面板"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--fg-strong)] hover:bg-[var(--surface-raised)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Corpus Scope & Web Search Bar */}
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)]/50 flex items-center gap-2">
        <Database className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="flex-1 min-w-0 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--fg-strong)] outline-none focus:border-[var(--accent)]"
        >
          <option value="all">全部知识库 ({vaults.length} 个库)</option>
          {vaults.map((v) => (
            <option key={v.id} value={v.id}>
              仅限：{v.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          data-tip={webSearch ? '已开启：知识库 + 实时联网搜索' : '点击开启实时联网搜索'}
          onClick={() => setWebSearch((v) => !v)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer shrink-0 ${
            webSearch
              ? 'bg-[var(--teal)]/15 border-[var(--teal)] text-[var(--teal)]'
              : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg-strong)]'
          }`}
        >
          <Globe className="w-3 h-3" />
          联网
        </button>
      </div>

      {/* API Key Settings Drawer */}
      {showSettings && (
        <form
          onSubmit={handleSaveConfig}
          className="p-4 border-b border-[var(--border)] bg-[var(--surface-raised)] space-y-3"
        >
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--fg-strong)]">
              快捷填充模型预设 (OpenAI 兼容)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const isSelected = config.baseUrl === p.baseUrl;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() =>
                      setConfig((c) => ({ ...c, baseUrl: p.baseUrl, model: p.model }))
                    }
                    className={`px-2 py-0.5 text-[10px] rounded-full border transition cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)] font-medium'
                        : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--accent)] text-[var(--muted-strong)] hover:text-[var(--accent)]'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-[10px] text-[var(--muted)] mb-0.5">API Base URL</label>
              <input
                type="url"
                required
                value={config.baseUrl}
                onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))}
                placeholder="https://api.deepseek.com/v1"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--fg-strong)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[var(--muted)] mb-0.5">
                API Key (仅保存在本地浏览器)
              </label>
              <input
                type="password"
                required
                value={config.apiKey}
                onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--fg-strong)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[var(--muted)] mb-0.5">模型名称 (Model)</label>
              <input
                type="text"
                required
                value={config.model}
                onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                placeholder="deepseek-chat"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--fg-strong)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[var(--muted)] mb-0.5">
                Tavily 搜索 Key (可选，填写后优先于模型自带联网)
              </label>
              <input
                type="password"
                value={config.tavilyApiKey ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, tavilyApiKey: e.target.value }))}
                placeholder="tvly-... (可留空)"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--fg-strong)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-emerald-400">{savedNotice}</span>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 text-white text-xs font-medium cursor-pointer"
            >
              保存配置
            </button>
          </div>
        </form>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-4">
            <div className="w-10 h-10 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] mx-auto">
              <Bot className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="font-serif-display text-sm font-semibold text-[var(--fg-strong)]">
                与你的第二大脑对话
              </div>
              <p className="text-xs text-[var(--muted)] leading-relaxed px-2">
                从过往写下的文字中检索最相关的笔记，让曾经的思考回答现在的你。
              </p>
            </div>
            <div className="space-y-1.5 pt-2">
              {[
                '总结我知识库里的核心知识点有哪些？',
                '知识图谱中的 PageRank 算法是怎么计算的？',
                '卡片盒笔记法和双链有什么关系？',
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void handleSend(q)}
                  className="w-full text-left px-3 py-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--accent)] text-xs text-[var(--fg)] transition cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1.5 ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[var(--accent)] text-white rounded-br-xs'
                  : 'bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--fg)] rounded-bl-xs'
              }`}
            >
              {msg.role === 'user' ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <div className="markdown-preview !text-xs !leading-relaxed">
                  <MarkdownPreview content={msg.content} />
                </div>
              )}
            </div>

            {msg.sources && msg.sources.length > 0 && (
              <div className="w-full space-y-2 pt-1">
                <MiniPinGraph
                  sources={msg.sources}
                  sourceLinks={msg.sourceLinks}
                  onSelectSource={(src) => void handleSourceClick(src)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {msg.sources.map((src) => (
                    <button
                      key={src.noteId}
                      type="button"
                      onClick={() => void handleSourceClick(src)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--accent)] text-[10px] text-[var(--accent)] cursor-pointer transition"
                    >
                      <Pin className="w-2.5 h-2.5 rotate-45" />
                      <span className="truncate max-w-[150px]">
                        {scope === 'all' ? `${src.vaultName} / ` : ''}
                        {src.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msg.webSources && msg.webSources.length > 0 && (
              <div className="w-full space-y-1 pt-0.5">
                <div className="text-[10px] text-[var(--teal)] flex items-center gap-1">
                  <Globe className="w-2.5 h-2.5" />
                  联网参考网页：
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {msg.webSources.map((w, idx) => (
                    <a
                      key={idx}
                      href={w.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--teal)] text-[10px] text-[var(--teal)] transition"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      <span className="truncate max-w-[160px]">{w.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] animate-pulse" />
            正在检索知识库语料并生成回答...
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="p-3 border-t border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="flex items-end gap-2 bg-[var(--bg)] border border-[var(--border)] focus-within:border-[var(--accent)] rounded-xl p-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="基于知识库提问 (Enter 发送)..."
            className="flex-1 bg-transparent text-xs text-[var(--fg-strong)] outline-none resize-none placeholder-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            data-tip="发送提问"
            className="p-2 rounded-lg bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-white cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </aside>
  );
};
