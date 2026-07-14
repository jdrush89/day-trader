import React, { useState, useRef, useCallback, useMemo } from "react";
import type { PlayerPnLSeries, TradeAction } from "../game/trade-log";

interface PnLGraphProps {
  series: PlayerPnLSeries[];
  width?: number;
  height?: number;
  hideActionLegend?: boolean;
}

const ACTION_COLORS: Record<TradeAction, string> = {
  buy: "#4cff88",
  sell: "#ff4c6b",
  short: "#ffaa33",
  cover: "#44bbff",
  buy_option: "#bb77ff",
  sell_option: "#ff77cc",
  close_option: "#eedd44",
};

const ACTION_LABELS: Record<TradeAction, string> = {
  buy: "Buy",
  sell: "Sell",
  short: "Short",
  cover: "Cover",
  buy_option: "Buy Option",
  sell_option: "Write Option",
  close_option: "Close Option",
};

export const PnLGraph: React.FC<PnLGraphProps> = ({ series, width = 500, height = 200, hideActionLegend = false }) => {
  if (series.length === 0 || series.every((s) => s.data.length <= 1)) {
    return <div className="pnl-graph-empty">No trades this day</div>;
  }

  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; panX: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const padding = { top: 20, right: 20, bottom: 30, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Find global bounds
  const { minVal, maxVal, maxTime } = useMemo(() => {
    let mn = 0, mx = 0, mt = 100;
    for (const s of series) {
      for (const pt of s.data) {
        if (pt.value < mn) mn = pt.value;
        if (pt.value > mx) mx = pt.value;
        if (pt.time > mt) mt = pt.time;
      }
    }
    const range = mx - mn || 1;
    return { minVal: mn - range * 0.1, maxVal: mx + range * 0.1, maxTime: mt };
  }, [series]);

  // Zoom affects the X range we display
  const visibleTimeRange = maxTime / zoom;
  const clampedPan = Math.max(0, Math.min(panX, maxTime - visibleTimeRange));
  const viewStart = clampedPan;
  const viewEnd = clampedPan + visibleTimeRange;

  const scaleX = useCallback((t: number) => padding.left + ((t - viewStart) / (viewEnd - viewStart)) * plotW, [viewStart, viewEnd, plotW, padding.left]);
  const scaleY = useCallback((v: number) => padding.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH, [minVal, maxVal, plotH, padding.top]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const timeAtMouse = viewStart + ((mouseX - padding.left) / plotW) * (viewEnd - viewStart);

    const newZoom = Math.max(1, Math.min(20, zoom * (e.deltaY < 0 ? 1.3 : 1 / 1.3)));
    const newVisibleRange = maxTime / newZoom;
    // Keep the time under the mouse at the same screen position
    const newPan = timeAtMouse - ((mouseX - padding.left) / plotW) * newVisibleRange;
    setZoom(newZoom);
    setPanX(Math.max(0, Math.min(newPan, maxTime - newVisibleRange)));
  }, [zoom, viewStart, viewEnd, maxTime, plotW, padding.left]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, panX: clampedPan };
  }, [zoom, clampedPan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const timeDelta = -(dx / plotW) * visibleTimeRange;
    const newPan = dragStart.current.panX + timeDelta;
    setPanX(Math.max(0, Math.min(newPan, maxTime - visibleTimeRange)));
  }, [isDragging, plotW, visibleTimeRange, maxTime]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStart.current = null;
  }, []);

  // Y-axis grid lines
  const yTicks: number[] = useMemo(() => {
    const ticks: number[] = [];
    const tickStep = niceStep(maxVal - minVal, 5);
    const tickStart = Math.ceil(minVal / tickStep) * tickStep;
    for (let v = tickStart; v <= maxVal; v += tickStep) ticks.push(v);
    return ticks;
  }, [minVal, maxVal]);

  // Build paths (clipped to visible range)
  const paths = useMemo(() => series.map((s) => {
    const points = s.data
      .filter((pt) => pt.time >= viewStart - visibleTimeRange * 0.1 && pt.time <= viewEnd + visibleTimeRange * 0.1)
      .map((pt) => `${scaleX(pt.time).toFixed(1)},${scaleY(pt.value).toFixed(1)}`);
    return {
      d: points.length > 1 ? "M" + points.join("L") : "",
      color: s.playerColor,
      name: s.playerName,
      lastValue: s.data[s.data.length - 1]?.value ?? 0,
    };
  }), [series, viewStart, viewEnd, visibleTimeRange, scaleX, scaleY]);

  // Collect action dots in the visible range
  const actionDots = useMemo(() => {
    const dots: Array<{ x: number; y: number; color: string; label: string; playerColor: string; playerName: string }> = [];
    for (const s of series) {
      for (const pt of s.data) {
        if (!pt.entry || !pt.entry.label) continue;
        if (pt.time < viewStart || pt.time > viewEnd) continue;
        // Skip phantom entries (shares === 0 and not close_option)
        if (pt.entry.shares === 0 && pt.entry.action !== "close_option") continue;
        dots.push({
          x: scaleX(pt.time),
          y: scaleY(pt.value),
          color: ACTION_COLORS[pt.entry.action],
          label: pt.entry.label + (pt.entry.realizedPnL ? ` (${pt.entry.realizedPnL >= 0 ? "+" : ""}$${pt.entry.realizedPnL.toFixed(2)})` : ""),
          playerColor: s.playerColor,
          playerName: s.playerName,
        });
      }
    }
    return dots;
  }, [series, viewStart, viewEnd, scaleX, scaleY]);

  return (
    <div
      className="pnl-graph-container"
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
      style={{ cursor: isDragging ? "grabbing" : zoom > 1 ? "grab" : "default" }}
    >
      <svg width={width} height={height} className="pnl-graph-svg">
        <defs>
          <clipPath id="pnl-plot-area">
            <rect x={padding.left} y={padding.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={scaleY(v)}
              y2={scaleY(v)}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="3,3"
            />
            <text
              x={padding.left - 6}
              y={scaleY(v) + 4}
              textAnchor="end"
              fill="rgba(255,255,255,0.5)"
              fontSize={10}
            >
              ${v >= 0 ? "+" : ""}{formatCompact(v)}
            </text>
          </g>
        ))}

        {/* Zero line */}
        {minVal < 0 && maxVal > 0 && (
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={scaleY(0)}
            y2={scaleY(0)}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
          />
        )}

        {/* X-axis labels */}
        <text x={padding.left} y={height - 5} fill="rgba(255,255,255,0.4)" fontSize={10}>
          {zoom > 1 ? `${Math.round((viewStart / maxTime) * 100)}%` : "Open"}
        </text>
        <text x={width - padding.right} y={height - 5} fill="rgba(255,255,255,0.4)" fontSize={10} textAnchor="end">
          {zoom > 1 ? `${Math.round((viewEnd / maxTime) * 100)}%` : "Close"}
        </text>

        {/* Player lines (clipped) */}
        <g clipPath="url(#pnl-plot-area)">
          {paths.map((p, i) => p.d && (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          ))}

          {/* Action dots */}
          {actionDots.map((dot, i) => (
            <circle
              key={`action-${i}`}
              cx={dot.x}
              cy={dot.y}
              r={zoom > 3 ? 5 : 4}
              fill={dot.color}
              stroke="rgba(0,0,0,0.5)"
              strokeWidth={1.5}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                setTooltip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top - 32,
                  text: `${dot.playerName}: ${dot.label}`,
                  color: dot.color,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pnl-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            borderColor: tooltip.color,
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Zoom indicator */}
      {zoom > 1 && (
        <div className="pnl-zoom-indicator">
          {zoom.toFixed(1)}x — scroll to zoom, drag to pan
        </div>
      )}

      {/* Legend */}
      <div className="pnl-graph-legend">
        {paths.map((p, i) => (
          <div key={i} className="pnl-legend-item">
            <span className="pnl-legend-swatch" style={{ background: p.color }} />
            <span className="pnl-legend-name">{p.name}</span>
            <span className={`pnl-legend-value ${p.lastValue >= 0 ? "up" : "down"}`}>
              {p.lastValue >= 0 ? "+" : ""}{formatCompact(p.lastValue)}
            </span>
          </div>
        ))}
        {!hideActionLegend && (
          <div className="pnl-action-legend">
            {(Object.entries(ACTION_LABELS) as [TradeAction, string][]).map(([action, label]) => (
              <span key={action} className="pnl-action-chip">
                <span className="pnl-action-dot" style={{ background: ACTION_COLORS[action] }} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toFixed(0);
}

function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / pow;
  let nice: number;
  if (normalized <= 1.5) nice = 1;
  else if (normalized <= 3) nice = 2;
  else if (normalized <= 7) nice = 5;
  else nice = 10;
  return nice * pow || 1;
}
