import { useState } from "react";
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

export function StockChart({ stock }: StockChartProps) {
  const [range, setRange] = useState<HistoryRange>("1D");

  const data = getChartData(stock, range);
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const padding = (max - min) * 0.05 || 1;
  const yMin = min - padding;
  const yMax = max + padding;
  const yRange = yMax - yMin;

  const width = 100;
  const height = 60;

  const points = data
    .map((price, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((price - yMin) / yRange) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const firstPrice = data[0];
  const lastPrice = data[data.length - 1];
  const change = lastPrice - firstPrice;
  const changePercent = (change / firstPrice) * 100;
  const isUp = change >= 0;

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
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
        <polyline
          points={points}
          fill="none"
          stroke={isUp ? "#00ff88" : "#ff4444"}
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
