import React, { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import {
  Bold,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Minus,
  Palette,
  Pin,
  Plus,
  Quote,
  Strikethrough,
} from 'lucide-react';

interface CodeMirrorEditorProps {
  noteId: string;
  initialContent: string;
  noteTitles: string[];
  onChange: (value: string) => void;
}

const TEXT_COLORS = [
  { name: '赤陶', value: '#d98a73' },
  { name: '鼠尾草', value: '#a6b682' },
  { name: '青瓷', value: '#78a9a1' },
  { name: '赭石', value: '#c7a769' },
  { name: '堇紫', value: '#a99bc6' },
  { name: '朱红', value: '#ef4444' },
];

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  noteId,
  initialContent,
  noteTitles,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const titlesRef = useRef<string[]>(noteTitles);
  const onChangeRef = useRef(onChange);

  const [fontSize, setFontSize] = useState<number>(15);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);

  titlesRef.current = noteTitles;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const wikilinkCompletion = (context: CompletionContext): CompletionResult | null => {
      const match = context.matchBefore(/\[\[[^[\]\n]*$/);
      if (!match) return null;
      const query = match.text.slice(2).toLowerCase();

      const options = titlesRef.current
        .filter((t) => t.toLowerCase().includes(query))
        .map((t) => ({
          label: t,
          apply: `${t}]]`,
          type: 'text',
          detail: '图钉双链',
        }));

      return {
        from: match.from + 2,
        options,
        validFor: /^[^[\]\n]*$/,
      };
    };

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        oneDark,
        EditorView.lineWrapping,
        autocompletion({
          override: [wikilinkCompletion],
          activateOnTyping: true,
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== initialContent) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: initialContent },
      });
    }
  }, [initialContent]);

  const wrapSelection = (prefix: string, suffix: string, placeholder = '文本') => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to) || placeholder;
    const insert = `${prefix}${selected}${suffix}`;
    view.dispatch({
      changes: { from, to, insert },
      selection: {
        anchor: from + prefix.length,
        head: from + prefix.length + selected.length,
      },
    });
    view.focus();
  };

  const prefixLine = (prefix: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: prefix },
    });
    view.focus();
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] shrink-0">
        <button
          type="button"
          data-tip="一级标题 (# )"
          onClick={() => prefixLine('# ')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <Heading1 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-tip="二级标题 (## )"
          onClick={() => prefixLine('## ')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-tip="三级标题 (### )"
          onClick={() => prefixLine('### ')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <Heading3 className="w-3.5 h-3.5" />
        </button>

        <span className="w-[1px] h-4 bg-[var(--border)] mx-1" />

        <button
          type="button"
          data-tip="加粗 (**文本**)"
          onClick={() => wrapSelection('**', '**', '加粗文本')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-tip="斜体 (*文本*)"
          onClick={() => wrapSelection('*', '*', '斜体文本')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-tip="删除线 (~~文本~~)"
          onClick={() => wrapSelection('~~', '~~', '删除文本')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-tip="荧光高亮 (<mark>)"
          onClick={() => wrapSelection('<mark>', '</mark>', '重点内容')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <Highlighter className="w-3.5 h-3.5" />
        </button>

        {/* Text Color Picker */}
        <div className="relative">
          <button
            type="button"
            data-tip="文字颜色"
            onClick={() => setColorMenuOpen((v) => !v)}
            className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
          {colorMenuOpen && (
            <div className="absolute left-0 top-[calc(100%+4px)] flex items-center gap-1.5 p-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-strong)] shadow-xl z-40">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  data-tip={c.name}
                  style={{ backgroundColor: c.value }}
                  onClick={() => {
                    wrapSelection(`<span style="color: ${c.value}">`, '</span>', '彩色文字');
                    setColorMenuOpen(false);
                  }}
                  className="w-4 h-4 rounded-full hover:scale-110 transition cursor-pointer"
                />
              ))}
            </div>
          )}
        </div>

        <span className="w-[1px] h-4 bg-[var(--border)] mx-1" />

        <button
          type="button"
          data-tip="引用块 (> )"
          onClick={() => prefixLine('> ')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <Quote className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-tip="行内代码 (`code`)"
          onClick={() => wrapSelection('`', '`', 'code')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-tip="待办复选框 (- [ ] )"
          onClick={() => prefixLine('- [ ] ')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] hover:text-[var(--fg-strong)] cursor-pointer"
        >
          <CheckSquare className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-tip="插入图钉双链 ([[笔记]])"
          onClick={() => wrapSelection('[[', ']]', '笔记标题')}
          className="p-1.5 rounded-md hover:bg-[var(--surface-raised)] text-[var(--accent)] cursor-pointer"
        >
          <Pin className="w-3.5 h-3.5 rotate-45" />
        </button>

        {/* Font Size Adjuster */}
        <div className="ml-auto flex items-center gap-0.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md px-1 py-0.5">
          <button
            type="button"
            data-tip="缩小字号"
            onClick={() => setFontSize((s) => Math.max(12, s - 1))}
            className="p-0.5 hover:text-[var(--fg-strong)] cursor-pointer"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[10px] px-1 text-[var(--muted)]">{fontSize}px</span>
          <button
            type="button"
            data-tip="放大字号"
            onClick={() => setFontSize((s) => Math.min(22, s + 1))}
            className="p-0.5 hover:text-[var(--fg-strong)] cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* CodeMirror Surface */}
      <div
        ref={containerRef}
        style={{ fontSize: `${fontSize}px` }}
        className="flex-1 w-full overflow-auto [&_.cm-editor]:!text-[inherit]"
      />
    </div>
  );
};
