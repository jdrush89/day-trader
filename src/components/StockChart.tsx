import { Stock } from "../game/types";

interface StockChartProps {
  stock: Stock;
}

export function StockChart({ stock }: StockChartProps) {
  const history = stock.history;
  if (history.length < 2) return null;

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;

  const width = 100;
  const height = 60;

  const points = history
    .map((price, i) => {
      const x = (i / (history.length - 1)) * width;
      const y = height - ((price - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const lastPrice = history[history.length - 1];
  const prevPrice = history[history.length - 2];
  const change = lastPrice - prevPrice;
  const changePercent = (change / prevPrice) * 100;
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
