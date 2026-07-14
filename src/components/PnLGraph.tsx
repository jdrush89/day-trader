import React from "react";
import type { PlayerPnLSeries } from "../game/trade-log";

interface PnLGraphProps {
  series: PlayerPnLSeries[];
  width?: number;
  height?: number;
}

export const PnLGraph: React.FC<PnLGraphProps> = ({ series, width = 500, height = 200 }) => {
  if (series.length === 0 || series.every((s) => s.data.length <= 1)) {
    return <div className="pnl-graph-empty">No trades this day</div>;
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Find global bounds
  let minVal = 0;
  let maxVal = 0;
  let maxTime = 100;

  for (const s of series) {
    for (const pt of s.data) {
      if (pt.value < minVal) minVal = pt.value;
      if (pt.value > maxVal) maxVal = pt.value;
      if (pt.time > maxTime) maxTime = pt.time;
    }
  }

  // Add padding to value range
  const valRange = maxVal - minVal || 1;
  minVal -= valRange * 0.1;
  maxVal += valRange * 0.1;

  const scaleX = (t: number) => padding.left + (t / maxTime) * plotW;
  const scaleY = (v: number) => padding.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

  // Y-axis grid lines
  const yTicks: number[] = [];
  const tickStep = niceStep(maxVal - minVal, 5);
  const tickStart = Math.ceil(minVal / tickStep) * tickStep;
  for (let v = tickStart; v <= maxVal; v += tickStep) {
    yTicks.push(v);
  }

  // Build paths
  const paths = series.map((s) => {
    const points = s.data.map((pt) => `${scaleX(pt.time).toFixed(1)},${scaleY(pt.value).toFixed(1)}`);
    return {
      d: "M" + points.join("L"),
      color: s.playerColor,
      name: s.playerName,
      lastValue: s.data[s.data.length - 1]?.value ?? 0,
    };
  });

  return (
    <div className="pnl-graph-container">
      <svg width={width} height={height} className="pnl-graph-svg">
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
          Open
        </text>
        <text x={width - padding.right} y={height - 5} fill="rgba(255,255,255,0.4)" fontSize={10} textAnchor="end">
          Close
        </text>

        {/* Player lines */}
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
        ))}

        {/* End dots */}
        {paths.map((p, i) => {
          const lastPt = series[i].data[series[i].data.length - 1];
          if (!lastPt) return null;
          return (
            <circle
              key={`dot-${i}`}
              cx={scaleX(lastPt.time)}
              cy={scaleY(lastPt.value)}
              r={4}
              fill={p.color}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth={1}
            />
          );
        })}
      </svg>

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
