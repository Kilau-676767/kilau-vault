import React, { useEffect, useId, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import mermaid from 'mermaid';
import { Pin } from 'lucide-react';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

const MermaidBlock: React.FC<{ chart: string }> = ({ chart }) => {
  const id = useId().replace(/:/g, '');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let active = true;
    mermaid
      .render(`mermaid-${id}`, chart)
      .then((res) => {
        if (active) {
          setSvg(res.svg);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [chart, id]);

  if (error) {
    return (
      <pre className="text-xs text-red-400 bg-red-950/30 p-3 rounded border border-red-800/40">
        Mermaid 语法错误: {error}
      </pre>
    );
  }

  return (
    <div
      className="my-4 flex justify-center bg-[#161616] p-4 rounded-lg border border-[#333] overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

interface MarkdownPreviewProps {
  content: string;
  onWikilinkClick?: (title: string) => void;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  onWikilinkClick,
}) => {
  // Convert [[Title]] or [[Title|Alias]] into special markdown links
  const processedContent = useMemo(() => {
    return content.replace(/\[\[([^[\]\n]+?)\]\]/g, (_match, inner: string) => {
      const parts = inner.split('|');
      const target = parts[0].trim();
      const label = (parts[1] ?? parts[0]).trim();
      return `[${label}](wikilink://${encodeURIComponent(target)})`;
    });
  }, [content]);

  return (
    <div className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          a: ({ href, children, ...props }) => {
            if (href?.startsWith('wikilink://')) {
              const target = decodeURIComponent(href.replace('wikilink://', ''));
              return (
                <a
                  href={`#${target}`}
                  className="wikilink"
                  onClick={(e) => {
                    e.preventDefault();
                    onWikilinkClick?.(target);
                  }}
                >
                  <Pin className="w-3 h-3 shrink-0 rotate-45 opacity-85" />
                  <span>{children}</span>
                </a>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#7f6df2] hover:underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const lang = match?.[1];
            const codeText = String(children).replace(/\n$/, '');

            if (lang === 'mermaid') {
              return <MermaidBlock chart={codeText} />;
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};
