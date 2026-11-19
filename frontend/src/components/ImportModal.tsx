import React, { useRef, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import type { ImportResult } from '../types';
import { CheckCircle2, FileText, FolderUp, Upload, X } from 'lucide-react';

interface ImportModalProps {
  onClose: () => void;
}

interface PendingFile {
  path: string;
  content: string;
}

export const ImportModal: React.FC<ImportModalProps> = ({ onClose }) => {
  const batchImportNotes = useAppStore((s) => s.batchImportNotes);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const processFileList = async (fileList: FileList | null) => {
    if (!fileList) return;
    setError('');
    setResult(null);
    const parsed: PendingFile[] = [];

    for (const file of Array.from(fileList)) {
      if (!file.name.toLowerCase().endsWith('.md')) continue;
      const content = await file.text();
      // Use webkitRelativePath if available (folder import), strip top-level root folder name if desired or keep structure
      const rawPath = file.webkitRelativePath || file.name;
      const parts = rawPath.split('/').filter(Boolean);
      const cleanPath = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
      parsed.push({ path: cleanPath, content });
    }

    if (parsed.length === 0) {
      setError('未检测到 .md 格式的 Markdown 文件');
      return;
    }
    setFiles(parsed);
  };

  const handleImport = async () => {
    if (files.length === 0) return;
    setImporting(true);
    setError('');
    try {
      const res = await batchImportNotes(files);
      if (res) setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-2xl shadow-2xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-base font-semibold text-[var(--fg-strong)]">
              批量导入本地 Markdown 笔记
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--fg-strong)] p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--muted)] leading-relaxed">
          支持直接导入你电脑上的 Obsidian 笔记文件夹或多个 <code className="text-[var(--accent)]">.md</code> 文件。系统会自动保留目录结构并全量解析 <code className="text-[var(--accent)]">[[双链]]</code> 关系至图钉知识图谱。
        </p>

        {/* Hidden Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".md,text/markdown"
          className="hidden"
          onChange={(e) => void processFileList(e.target.files)}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error webkitdirectory is a standard browser attribute for folder picking
          webkitdirectory=""
          className="hidden"
          onChange={(e) => void processFileList(e.target.files)}
        />

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--accent)] text-xs text-[var(--fg)] transition cursor-pointer"
          >
            <FolderUp className="w-6 h-6 text-[var(--accent)]" />
            <span className="font-medium">选择整个文件夹</span>
            <span className="text-[11px] text-[var(--muted)]">保留多级子目录</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--accent)] text-xs text-[var(--fg)] transition cursor-pointer"
          >
            <FileText className="w-6 h-6 text-[var(--sage)]" />
            <span className="font-medium">选择多个 .md 文件</span>
            <span className="text-[11px] text-[var(--muted)]">支持多选上传</span>
          </button>
        </div>

        {files.length > 0 && (
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 max-h-44 overflow-y-auto space-y-1.5">
            <div className="text-[11px] text-[var(--muted)] font-medium mb-1">
              待导入文件 ({files.length} 个)：
            </div>
            {files.map((f) => (
              <div
                key={f.path}
                className="flex items-center justify-between text-xs text-[var(--fg)] py-0.5"
              >
                <span className="truncate font-mono text-[11px]">{f.path}</span>
                <span className="text-[10px] text-[var(--muted)] shrink-0 ml-2">
                  {f.content.length} 字符
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {result && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              导入完成！新增 {result.importedCount} 篇、更新 {result.updatedCount} 篇，共解析出{' '}
              <strong>{result.linkCount}</strong> 条图钉双链。
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs text-[var(--muted-strong)] hover:text-[var(--fg-strong)] cursor-pointer"
          >
            关闭
          </button>
          <button
            type="button"
            disabled={files.length === 0 || importing}
            onClick={() => void handleImport()}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
          >
            {importing ? '导入解析中...' : `开始导入 (${files.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};
