import React, { useEffect, useRef, useState } from 'react';
import ForceGraph from 'force-graph';
import { graphApi } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useT } from '../stores/useI18nStore';
import type { GraphData, GraphNode } from '../types';
import { Pin, EyeOff, Eye, RefreshCw, Sparkles } from 'lucide-react';

// Kilau botanical & terracotta palette
const CLUSTER_COLORS = [
  '#d98a73', // terracotta accent
  '#a6b682', // sage
  '#78a9a1', // teal
  '#c7a769', // ochre
  '#a99bc6', // violet
  '#e0a28f', // warm clay
];

function drawPushpin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  dimmed: boolean,
  isHighlighted: boolean,
  isLight: boolean
) {
  ctx.save();
  if (dimmed) {
    ctx.globalAlpha = 0.22;
  }

  // 1. Soft board shadow
  ctx.beginPath();
  ctx.ellipse(x + radius * 0.45, y + radius * 0.55, radius * 0.9, radius * 0.45, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = isLight ? 'rgba(26, 34, 30, 0.16)' : 'rgba(0, 0, 0, 0.45)';
  ctx.fill();

  // 2. Metallic pin needle anchored at (x, y)
  const headX = x - radius * 0.24;
  const headY = y - radius * 0.68;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(headX, headY);
  ctx.strokeStyle = isLight ? '#5a635e' : '#b8c0bb';
  ctx.lineWidth = Math.max(0.75, radius * 0.18);
  ctx.lineCap = 'round';
  ctx.stroke();

  // Needle anchor dot
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.9, radius * 0.16), 0, Math.PI * 2);
  ctx.fillStyle = isLight ? '#38403c' : '#e7ece8';
  ctx.fill();

  // 3. Pushpin collar / base skirt
  ctx.beginPath();
  ctx.arc(headX + radius * 0.06, headY + radius * 0.12, radius * 0.66, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.24)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // 4. Pushpin top cap
  ctx.beginPath();
  ctx.arc(headX - radius * 0.06, headY - radius * 0.1, radius * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Highlight ring on hover / hub
  if (isHighlighted) {
    ctx.strokeStyle = isLight ? '#101411' : '#f5f7f4';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // 5. Specular gloss highlight on pinhead
  ctx.beginPath();
  ctx.arc(
    headX - radius * 0.3,
    headY - radius * 0.32,
    radius * 0.22,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fill();

  ctx.restore();
}

export const GraphView: React.FC = () => {
  const { currentVaultId, openNote } = useAppStore();
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hideIsolated, setHideIsolated] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  // Observe theme changes on <html> so canvas repaints cleanly
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((v) => v + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const fetchGraph = async () => {
    if (!currentVaultId) return;
    setLoading(true);
    try {
      const data = await graphApi.getVaultGraph(currentVaultId);
      setGraphData(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVaultId]);

  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const isLight = document.documentElement.dataset.theme === 'light';
    const bgColor = isLight ? '#f3f1ea' : '#0b0d0d';
    const textColor = isLight ? '#1b211e' : '#e7ece8';
    const mutedColor = isLight ? '#69716d' : '#939c97';
    const accentColor = isLight ? '#b75e49' : '#d98a73';

    const filteredNodes = hideIsolated
      ? graphData.nodes.filter((n) => !n.isIsolated)
      : graphData.nodes;
    const validIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks = graphData.links
      .filter((l) => validIds.has(l.source) && validIds.has(l.target))
      .map((l) => ({ ...l }));

    const neighborMap = new Map<string, Set<string>>();
    for (const l of filteredLinks) {
      if (!neighborMap.has(l.source)) neighborMap.set(l.source, new Set());
      if (!neighborMap.has(l.target)) neighborMap.set(l.target, new Set());
      neighborMap.get(l.source)!.add(l.target);
      neighborMap.get(l.target)!.add(l.source);
    }

    let highlightNodeId: string | null = null;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const fg = new ForceGraph(containerRef.current)
      .width(width)
      .height(height)
      .backgroundColor(bgColor)
      .autoPauseRedraw(false)
      .d3AlphaDecay(0.025)
      .d3VelocityDecay(0.32)
      .graphData({
        nodes: filteredNodes.map((n) => ({ ...n })),
        links: filteredLinks,
      })
      .nodeVal((node: unknown) => {
        const n = node as GraphNode;
        return Math.max(2, n.pageRank * 16 + n.degree * 0.8);
      })
      .nodePointerAreaPaint((node: unknown, paintColor: string, ctx: CanvasRenderingContext2D) => {
        const n = node as GraphNode & { x?: number; y?: number };
        if (n.x === undefined || n.y === undefined) return;
        ctx.fillStyle = paintColor;
        ctx.beginPath();
        ctx.arc(n.x - 1, n.y - 2, 11, 0, Math.PI * 2);
        ctx.fill();
      })
      .linkCanvasObject((link: unknown, ctx: CanvasRenderingContext2D) => {
        const l = link as {
          source: { id?: string; x?: number; y?: number };
          target: { id?: string; x?: number; y?: number };
        };
        if (
          l.source.x === undefined ||
          l.source.y === undefined ||
          l.target.x === undefined ||
          l.target.y === undefined
        ) {
          return;
        }
        const isRelated =
          highlightNodeId &&
          (l.source.id === highlightNodeId || l.target.id === highlightNodeId);
        const isDimmed = Boolean(highlightNodeId && !isRelated);

        ctx.save();
        ctx.beginPath();
        const mx = (l.source.x + l.target.x) / 2;
        const my = (l.source.y + l.target.y) / 2;
        const dx = l.target.x - l.source.x;
        const dy = l.target.y - l.source.y;
        const cx = mx - dy * 0.05;
        const cy = my + dx * 0.05;

        ctx.moveTo(l.source.x, l.source.y);
        ctx.quadraticCurveTo(cx, cy, l.target.x, l.target.y);

        if (isRelated) {
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 1.05;
        } else if (isDimmed) {
          ctx.strokeStyle = isLight
            ? 'rgba(26, 34, 30, 0.04)'
            : 'rgba(228, 236, 231, 0.04)';
          ctx.lineWidth = 0.45;
        } else {
          ctx.strokeStyle = isLight
            ? 'rgba(183, 94, 73, 0.24)'
            : 'rgba(217, 138, 115, 0.24)';
          ctx.lineWidth = 0.55;
          ctx.setLineDash([2.5, 3]);
        }
        ctx.stroke();
        ctx.restore();
      })
      .nodeCanvasObjectMode(() => 'replace')
      .nodeCanvasObject((node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const n = node as GraphNode & { x?: number; y?: number };
        if (n.x === undefined || n.y === undefined) return;

        const baseRadius = Math.max(3.2, Math.min(5.6, 3.0 + n.pageRank * 6 + n.degree * 0.2));
        const isSelf = highlightNodeId === n.id;
        const isNeighbor = Boolean(
          highlightNodeId && neighborMap.get(highlightNodeId)?.has(n.id)
        );
        const dimmed = Boolean(highlightNodeId && !isSelf && !isNeighbor);
        const color = n.isIsolated
          ? mutedColor
          : CLUSTER_COLORS[(n.cluster - 1) % CLUSTER_COLORS.length];

        drawPushpin(
          ctx,
          n.x,
          n.y,
          baseRadius,
          color,
          dimmed,
          isSelf || isNeighbor,
          isLight
        );

        // Draw crisp label below the pin anchor
        if (globalScale >= 0.55 || isSelf || isNeighbor) {
          const fontSize = Math.max(9, Math.min(12, 11 / globalScale));
          ctx.save();
          ctx.font = `500 ${fontSize}px "PingFang SC", Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = dimmed
            ? isLight
              ? 'rgba(27,33,30,0.18)'
              : 'rgba(231,236,232,0.18)'
            : textColor;
          ctx.fillText(n.title, n.x, n.y + 5);
          ctx.restore();
        }
      })
      .onNodeHover((node: unknown) => {
        const n = (node as GraphNode | null) ?? null;
        highlightNodeId = n?.id ?? null;
        if (containerRef.current) {
          containerRef.current.style.cursor = n ? 'pointer' : 'default';
        }
        setHoveredNode(n);
      })
      .onNodeClick((node: unknown) => {
        const n = node as GraphNode;
        void openNote(n.id);
      });

    // Increase link distance & node repulsion for a spacious, uncluttered layout
    const linkForce = fg.d3Force('link') as { distance?: (d: number) => void } | undefined;
    if (linkForce?.distance) {
      linkForce.distance(135);
    }
    const chargeForce = fg.d3Force('charge') as { strength?: (s: number) => void } | undefined;
    if (chargeForce?.strength) {
      chargeForce.strength(-280);
    }
    fg.cooldownTicks(90);
    fg.onEngineStop(() => {
      fg.zoomToFit(350, 80);
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
  }, [graphData, hideIsolated, openNote, themeVersion]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* Top Graph Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 font-serif-display font-bold text-sm text-[var(--fg-strong)]">
            <Pin className="w-4 h-4 text-[var(--accent)] rotate-45" />
            {t.graphTitle}
          </div>
          {graphData && (
            <div className="hidden md:flex items-center gap-3.5 text-[var(--muted)]">
              <span>
                {t.pinNodes}: <strong className="text-[var(--fg-strong)]">{graphData.metrics.nodeCount}</strong>
              </span>
              <span>
                {t.edges}: <strong className="text-[var(--fg-strong)]">{graphData.metrics.edgeCount}</strong>
              </span>
              <span>
                {t.clusters}: <strong className="text-[var(--fg-strong)]">{graphData.metrics.clusterCount}</strong>
              </span>
              <span>
                {t.isolatedNodes}: <strong className="text-[var(--ochre)]">{graphData.metrics.isolatedCount}</strong>
              </span>
              <span>
                {t.density}: <strong className="text-[var(--fg-strong)]">{graphData.metrics.density}</strong>
              </span>
              {graphData.metrics.hubNote && (
                <span className="flex items-center gap-1 text-[var(--accent)]">
                  <Sparkles className="w-3.5 h-3.5" />
                  {t.hubNode}: {graphData.metrics.hubNote.title} (PR: {graphData.metrics.hubNote.pageRank})
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHideIsolated((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition cursor-pointer ${
              hideIsolated
                ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]'
                : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--muted-strong)] hover:text-[var(--fg-strong)]'
            }`}
          >
            {hideIsolated ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {hideIsolated ? t.hiddenIsolated : t.hideIsolated}
          </button>
          <button
            type="button"
            onClick={() => void fetchGraph()}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--muted-strong)] hover:text-[var(--fg-strong)] transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t.refreshGraph}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
        {hoveredNode && (
          <div className="absolute bottom-4 left-4 bg-[var(--surface-raised)]/95 backdrop-blur-md border border-[var(--border-strong)] rounded-xl px-4 py-3 text-xs shadow-xl pointer-events-none">
            <div className="flex items-center gap-1.5 font-serif-display font-bold text-sm text-[var(--fg-strong)] mb-1">
              <Pin className="w-3.5 h-3.5 text-[var(--accent)] rotate-45" />
              {hoveredNode.title}
            </div>
            <div className="text-[var(--muted)] space-x-3">
              <span>{t.inDegree}: {hoveredNode.inDegree}</span>
              <span>{t.outDegree}: {hoveredNode.outDegree}</span>
              <span className="text-[var(--accent)]">PageRank: {hoveredNode.pageRank}</span>
              <span>{t.clusterLabel} #{hoveredNode.cluster}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
