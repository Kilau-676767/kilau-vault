import React, { useEffect, useRef } from 'react';
import ForceGraph from 'force-graph';
import type { AiSource } from '../types';
import { Pin } from 'lucide-react';

interface MiniPinGraphProps {
  sources: AiSource[];
  sourceLinks?: { source: string; target: string }[];
  onSelectSource: (src: AiSource) => void;
}

interface MiniNode {
  id: string;
  title: string;
  isQueryHub?: boolean;
  sourceData?: AiSource;
  x?: number;
  y?: number;
}

export const MiniPinGraph: React.FC<MiniPinGraphProps> = ({
  sources,
  sourceLinks = [],
  onSelectSource,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || sources.length === 0) return;

    const isLight = document.documentElement.dataset.theme === 'light';
    const bgColor = isLight ? '#f3f1ea' : '#0b0d0d';
    const textColor = isLight ? '#1b211e' : '#f5f7f4';
    const accentColor = isLight ? '#b75e49' : '#d98a73';
    const ochreColor = isLight ? '#987a3d' : '#c7a769';

    const nodes: MiniNode[] = [
      { id: '__query_hub__', title: '本次提问', isQueryHub: true },
      ...sources.map((s) => ({
        id: s.noteId,
        title: s.title,
        sourceData: s,
      })),
    ];

    const links: { source: string; target: string; isRealLink?: boolean }[] = [
      ...sources.map((s) => ({
        source: '__query_hub__',
        target: s.noteId,
        isRealLink: false,
      })),
      ...sourceLinks.map((l) => ({
        source: l.source,
        target: l.target,
        isRealLink: true,
      })),
    ];

    let hoverId: string | null = null;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const fg = new ForceGraph(containerRef.current)
      .width(width)
      .height(height)
      .backgroundColor(bgColor)
      .autoPauseRedraw(false)
      .graphData({ nodes, links })
      .nodePointerAreaPaint((node: unknown, paintColor: string, ctx: CanvasRenderingContext2D) => {
        const n = node as MiniNode;
        if (n.x === undefined || n.y === undefined) return;
        ctx.fillStyle = paintColor;
        ctx.beginPath();
        ctx.arc(n.x, n.y - 2, 10, 0, Math.PI * 2);
        ctx.fill();
      })
      .linkCanvasObject((link: unknown, ctx: CanvasRenderingContext2D) => {
        const l = link as {
          source: { x?: number; y?: number };
          target: { x?: number; y?: number };
          isRealLink?: boolean;
        };
        if (
          l.source.x === undefined ||
          l.source.y === undefined ||
          l.target.x === undefined ||
          l.target.y === undefined
        ) {
          return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(l.source.x, l.source.y);
        ctx.lineTo(l.target.x, l.target.y);
        if (l.isRealLink) {
          ctx.strokeStyle = ochreColor;
          ctx.lineWidth = 1.0;
        } else {
          ctx.strokeStyle = isLight
            ? 'rgba(183, 94, 73, 0.28)'
            : 'rgba(217, 138, 115, 0.32)';
          ctx.lineWidth = 0.65;
          ctx.setLineDash([2.5, 2.5]);
        }
        ctx.stroke();
        ctx.restore();
      })
      .nodeCanvasObjectMode(() => 'replace')
      .nodeCanvasObject((node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const n = node as MiniNode;
        if (n.x === undefined || n.y === undefined) return;

        const isHovered = hoverId === n.id;

        if (n.isQueryHub) {
          // Central glowing query anchor
          ctx.save();
          ctx.shadowBlur = 14;
          ctx.shadowColor = accentColor;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = accentColor;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.font = `600 ${Math.max(8, 10 / globalScale)}px "PingFang SC", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = accentColor;
          ctx.fillText(n.title, n.x, n.y + 6);
          ctx.restore();
          return;
        }

        // Lit-up Pushpin with warm glow halo
        const r = isHovered ? 5.2 : 4.2;
        const headX = n.x - r * 0.24;
        const headY = n.y - r * 0.68;

        ctx.save();
        // Outer glow halo ("亮起" effect)
        const grad = ctx.createRadialGradient(headX, headY, 1, headX, headY, r * 3.2);
        grad.addColorStop(0, isLight ? 'rgba(199, 167, 105, 0.55)' : 'rgba(217, 138, 115, 0.65)');
        grad.addColorStop(1, 'rgba(217, 138, 115, 0)');
        ctx.beginPath();
        ctx.arc(headX, headY, r * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Metallic needle
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = isLight ? '#5a635e' : '#d4dbd7';
        ctx.lineWidth = 0.85;
        ctx.stroke();

        // Pushpin head with glow
        ctx.shadowBlur = isHovered ? 14 : 9;
        ctx.shadowColor = accentColor;
        ctx.beginPath();
        ctx.arc(headX, headY, r * 0.82, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? ochreColor : accentColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = isHovered ? 1.2 : 0.7;
        ctx.stroke();

        // Specular highlight
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(headX - r * 0.25, headY - r * 0.28, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fill();
        ctx.restore();

        // Label
        ctx.save();
        const fontSize = Math.max(8, Math.min(11, 10 / globalScale));
        ctx.font = `500 ${fontSize}px "PingFang SC", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = textColor;
        const shortTitle = n.title.length > 10 ? n.title.slice(0, 10) + '…' : n.title;
        ctx.fillText(shortTitle, n.x, n.y + 5);
        ctx.restore();
      })
      .onNodeHover((node: unknown) => {
        const n = (node as MiniNode | null) ?? null;
        hoverId = n?.id ?? null;
        if (containerRef.current) {
          containerRef.current.style.cursor = n && !n.isQueryHub ? 'pointer' : 'default';
        }
      })
      .onNodeClick((node: unknown) => {
        const n = node as MiniNode;
        if (n.sourceData) {
          onSelectSource(n.sourceData);
        }
      });

    const linkForce = fg.d3Force('link') as { distance?: (d: number) => void } | undefined;
    if (linkForce?.distance) linkForce.distance(65);
    const chargeForce = fg.d3Force('charge') as { strength?: (s: number) => void } | undefined;
    if (chargeForce?.strength) chargeForce.strength(-150);

    fg.cooldownTicks(60);
    fg.onEngineStop(() => {
      fg.zoomToFit(250, 26);
    });

    const handleResize = () => {
      if (!containerRef.current) return;
      fg.width(containerRef.current.clientWidth).height(containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      fg._destructor();
    };
  }, [sources, sourceLinks, onSelectSource]);

  return (
    <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between text-[10px] text-[var(--muted)]">
        <span className="flex items-center gap-1 text-[var(--accent)] font-medium">
          <Pin className="w-3 h-3 rotate-45" />
          语料图钉星图（已点亮 {sources.length} 篇）
        </span>
        <span>点击图钉跳转笔记</span>
      </div>
      <div ref={containerRef} className="w-full h-44" />
    </div>
  );
};
