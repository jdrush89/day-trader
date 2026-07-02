import { useState, useRef, useCallback } from "react";
import { Stock, HistoryRange } from "../game/types";

interface StockChartProps {
  stock: Stock;
}

const RANGES: HistoryRange[] = ["1D", "5D", "1M", "6M", "1Y", "5Y", "MAX"];

// Trading days per range
const RANGE_DAYS: Record<HistoryRange, number> = {
  "1D": 0, // special: use intraday
  "5D": 5,
  "1M": 21,
  "6M": 126,
  "1Y": 252,
  "5Y": 1260,
  "MAX": Infinity,
};

function getChartData(stock: Stock, range: HistoryRange): number[] {
  if (range === "1D") {
    return stock.history;
  }

  const days = RANGE_DAYS[range];
  const daily = stock.dailyHistory;

  // Include current day's price as the last point
  const allPrices = [...daily.map((d) => d.close), stock.price];

  if (days === Infinity) {
    return allPrices;
  }

  // Take the last N days worth of data (+ current)
  return allPrices.slice(-days - 1);
}

function isRangeAvailable(stock: Stock, range: HistoryRange): boolean {
  if (range === "1D") return true;
  if (range === "MAX") return true;
  const days = RANGE_DAYS[range];
  return stock.dailyHistory.length >= days;
}

function formatRangeLabel(range: HistoryRange): string {
  switch (range) {
    case "1D": return "1D";
    case "5D": return "5D";
    case "1M": return "1M";
    case "6M": return "6M";
    case "1Y": return "1Y";
    case "5Y": return "5Y";
    case "MAX": return "Max";
  }
}

// Generate nice Y-axis tick values
function getYTicks(yMin: number, yMax: number, count: number = 5): number[] {
  const range = yMax - yMin;
  const rawStep = range / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((s) => s * magnitude >= rawStep)! * magnitude;

  const start = Math.ceil(yMin / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= yMax; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

// X-axis labels based on range
function getXLabels(
  range: HistoryRange,
  dataLength: number,
  count: number = 5,
): { position: number; label: string }[] {
  const labels: { position: number; label: string }[] = [];

  if (range === "1D") {
    // Market hours 9:30 AM - 4:00 PM
    const times = ["9:30", "11:00", "12:30", "2:00", "4:00"];
    times.forEach((t, i) => {
      labels.push({ position: i / (times.length - 1), label: t });
    });
  } else {
    // Evenly spaced labels showing relative time
    const totalDays = dataLength - 1;
    const step = Math.max(1, Math.floor(totalDays / (count - 1)));
    for (let i = 0; i < count && i * step <= totalDays; i++) {
      const dayIdx = i * step;
      const daysAgo = totalDays - dayIdx;
      let label: string;
      if (daysAgo === 0) {
        label = "Now";
      } else if (daysAgo < 5) {
        label = `${daysAgo}d`;
      } else if (daysAgo < 21) {
        label = `${Math.round(daysAgo / 5)}w`;
      } else if (daysAgo < 252) {
        label = `${Math.round(daysAgo / 21)}mo`;
      } else {
        label = `${(daysAgo / 252).toFixed(1)}y`;
      }
      labels.push({ position: dayIdx / Math.max(totalDays, 1), label });
    }
  }
  return labels;
}

// Chart layout constants
const MARGIN = { top: 4, right: 8, bottom: 18, left: 42 };
const TOTAL_W = 320;
const TOTAL_H = 140;
const PLOT_W = TOTAL_W - MARGIN.left - MARGIN.right;
const PLOT_H = TOTAL_H - MARGIN.top - MARGIN.bottom;

export function StockChart({ stock }: StockChartProps) {
  const [range, setRange] = useState<HistoryRange>("1D");
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const data = getChartData(stock, range);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || data.length < 2) return;
      const rect = svg.getBoundingClientRect();
      // Use ratio of mouse position within the rendered element
      const ratioX = (e.clientX - rect.left) / rect.width;
      const plotRatio = (ratioX * TOTAL_W - MARGIN.left) / PLOT_W;
      const idx = Math.round(plotRatio * (data.length - 1));
      if (idx >= 0 && idx < data.length) {
        const px = MARGIN.left + (idx / (data.length - 1)) * PLOT_W;
        const price = data[idx];
        setHover({ idx, x: px, y: price });
      } else {
        setHover(null);
      }
    },
    [data],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  if (data.length < 2) return null;

  const dataMin = Math.min(...data);
  const dataMax = Math.max(...data);
  const padding = (dataMax - dataMin) * 0.05 || 1;
  const yMin = dataMin - padding;
  const yMax = dataMax + padding;
  const yRange = yMax - yMin;

  const toX = (i: number) => MARGIN.left + (i / (data.length - 1)) * PLOT_W;
  const toY = (price: number) => MARGIN.top + PLOT_H - ((price - yMin) / yRange) * PLOT_H;

  const points = data.map((price, i) => `${toX(i)},${toY(price)}`).join(" ");

  const firstPrice = data[0];
  const lastPrice = data[data.length - 1];
  const change = lastPrice - firstPrice;
  const changePercent = (change / firstPrice) * 100;
  const isUp = change >= 0;
  const lineColor = isUp ? "#00ff88" : "#ff4444";

  const yTicks = getYTicks(yMin, yMax, 5);
  const xLabels = getXLabels(range, data.length, 5);

  // Hover tooltip data
  const hoverPrice = hover ? data[hover.idx] : null;
  const hoverY = hoverPrice !== null ? toY(hoverPrice) : 0;
  const hoverChange = hoverPrice !== null ? hoverPrice - firstPrice : 0;
  const hoverChangePct = hoverPrice !== null ? (hoverChange / firstPrice) * 100 : 0;

  return (
    <div className="stock-chart">
      <div className="stock-chart-header">
        <span className="stock-symbol">{stock.symbol}</span>
        <span className="stock-name">{stock.name}</span>
      </div>
      <div className="stock-tags">
        {stock.tags.map((tag) => (
          <span key={tag} className="stock-tag">{tag}</span>
        ))}
      </div>
      <div className="stock-price-row">
        <span className="stock-price">${lastPrice.toFixed(2)}</span>
        <span className={`stock-change ${isUp ? "up" : "down"}`}>
          {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({Math.abs(changePercent).toFixed(1)}%)
        </span>
      </div>
      <div className="chart-range-tabs">
        {RANGES.map((r) => {
          const available = isRangeAvailable(stock, r);
          return (
            <button
              key={r}
              className={`chart-range-btn ${range === r ? "active" : ""}`}
              onClick={() => setRange(r)}
              disabled={!available}
              title={!available ? `${stock.symbol} doesn't have ${formatRangeLabel(r)} of history` : undefined}
            >
              {formatRangeLabel(r)}
            </button>
          );
        })}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
        preserveAspectRatio="none"
        className="chart-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Y-axis grid lines and labels */}
        {yTicks.map((v) => {
          const y = toY(v);
          if (y < MARGIN.top || y > MARGIN.top + PLOT_H) return null;
          return (
            <g key={v}>
              <line
                x1={MARGIN.left} y1={y} x2={MARGIN.left + PLOT_W} y2={y}
                stroke="rgba(88,166,255,0.08)" strokeWidth="0.5"
              />
              <text
                x={MARGIN.left - 4} y={y + 1}
                textAnchor="end" dominantBaseline="middle"
                fill="#8b949e" fontSize="7" fontFamily="monospace"
              >
                ${v.toFixed(v >= 100 ? 0 : 2)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map(({ position, label }, i) => {
          const x = MARGIN.left + position * PLOT_W;
          return (
            <text
              key={i}
              x={x} y={TOTAL_H - 2}
              textAnchor="middle"
              fill="#8b949e" fontSize="7" fontFamily="monospace"
            >
              {label}
            </text>
          );
        })}

        {/* Plot border */}
        <rect
          x={MARGIN.left} y={MARGIN.top}
          width={PLOT_W} height={PLOT_H}
          fill="none" stroke="rgba(88,166,255,0.15)" strokeWidth="0.5"
        />

        {/* Price line */}
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="1.5" />

        {/* Hover crosshair and dot */}
        {hover && hoverPrice !== null && (
          <>
            <line
              x1={hover.x} y1={MARGIN.top} x2={hover.x} y2={MARGIN.top + PLOT_H}
              stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" strokeDasharray="2,2"
            />
            <line
              x1={MARGIN.left} y1={hoverY} x2={MARGIN.left + PLOT_W} y2={hoverY}
              stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" strokeDasharray="2,2"
            />
            <circle cx={hover.x} cy={hoverY} r="2.5" fill={lineColor} stroke="#0d1117" strokeWidth="1" />
          </>
        )}
      </svg>

      {/* Tooltip rendered outside SVG for crisp text */}
      {hover && hoverPrice !== null && (
        <div className="chart-tooltip">
          <span className="chart-tooltip-price">${hoverPrice.toFixed(2)}</span>
          <span className={`chart-tooltip-change ${hoverChange >= 0 ? "up" : "down"}`}>
            {hoverChange >= 0 ? "+" : ""}{hoverChange.toFixed(2)} ({hoverChange >= 0 ? "+" : ""}{hoverChangePct.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  );
}
