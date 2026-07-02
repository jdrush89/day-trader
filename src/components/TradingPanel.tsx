import { useState } from "react";
import { GameState } from "../game/types";
import { getMilestone } from "../game/engine";

interface TradingPanelProps {
  gameState: GameState;
  onBuy: (symbol: string, shares: number) => void;
  onSell: (symbol: string, shares: number) => void;
  onShort: (symbol: string, shares: number) => void;
  onCover: (symbol: string, shares: number) => void;
  onTogglePin: (symbol: string) => void;
}

export function TradingPanel({ gameState, onBuy, onSell, onShort, onCover, onTogglePin }: TradingPanelProps) {
  const [shortMode, setShortMode] = useState(false);

  const portfolioValue = gameState.portfolio.reduce((sum, pos) => {
    const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);

  const shortLiability = gameState.shorts.reduce((sum, pos) => {
    const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);
  const shortCollateral = gameState.shorts.reduce(
    (sum, pos) => sum + pos.entryPrice * pos.shares, 0
  );
  const netWorth = gameState.cash + portfolioValue + shortCollateral - shortLiability;

  const milestone = getMilestone(gameState.day);
  const daysUntilCheck = milestone ? milestone.checkDay - gameState.day : 0;
  const onTrack = milestone ? netWorth >= milestone.required : true;

  const handleAction = shortMode ? onShort : onBuy;
  const actionLabel = shortMode ? "Short" : "Buy";

  return (
    <div className="trading-panel">
      <div className="account-summary">
        <div className="stat">
          <span className="stat-label">Cash</span>
          <span className="stat-value">${gameState.cash.toFixed(2)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Portfolio</span>
          <span className="stat-value">${portfolioValue.toFixed(2)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Net Worth</span>
          <span className="stat-value">${netWorth.toFixed(2)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Day</span>
          <span className="stat-value">{gameState.day}</span>
        </div>
        {milestone && (
          <div className="stat milestone-stat">
            <span className="stat-label">
              Target (in {daysUntilCheck}d)
            </span>
            <span className={`stat-value ${onTrack ? "milestone-ok" : "danger"}`}>
              ${milestone.required.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="positions-scroll">
        <div className="positions">
          <h3>Positions</h3>
        {gameState.portfolio.length === 0 && <div className="empty">No positions</div>}
        {gameState.portfolio.map((pos) => {
          const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
          const currentValue = stock ? stock.price * pos.shares : 0;
          const costBasis = pos.avgCost * pos.shares;
          const pnl = currentValue - costBasis;
          return (
            <div key={pos.symbol} className="position-row">
              <span className="pos-symbol">{pos.symbol}</span>
              <span className="pos-shares">{pos.shares} shares</span>
              <span className={`pos-pnl ${pnl >= 0 ? "up" : "down"}`}>
                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
              </span>
              <button className="sell-btn" onClick={() => onSell(pos.symbol, 1)}>
                Sell 1
              </button>
              <button className="sell-btn" onClick={() => onSell(pos.symbol, pos.shares)}>
                Sell All
              </button>
            </div>
          );
        })}
      </div>

      <div className="positions">
        <h3>Short Positions</h3>
        {gameState.shorts.length === 0 && <div className="empty">No shorts</div>}
        {gameState.shorts.map((pos) => {
          const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
          const currentCost = stock ? stock.price * pos.shares : 0;
          const entryValue = pos.entryPrice * pos.shares;
          const pnl = entryValue - currentCost;
          return (
            <div key={pos.symbol} className="position-row">
              <span className="pos-symbol">{pos.symbol}</span>
              <span className="pos-shares">{pos.shares} short</span>
              <span className={`pos-pnl ${pnl >= 0 ? "up" : "down"}`}>
                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
              </span>
              <button className="sell-btn" onClick={() => onCover(pos.symbol, 1)}>
                Cover 1
              </button>
              <button className="sell-btn" onClick={() => onCover(pos.symbol, pos.shares)}>
                Cover All
              </button>
            </div>
          );
        })}
      </div>
      </div>

      <div className="quick-buy">
        <div className="quick-buy-header">
          <h3>Quick {actionLabel}</h3>
          <div className="trade-mode-toggle">
            <button
              className={`mode-btn ${!shortMode ? "active" : ""}`}
              onClick={() => setShortMode(false)}
            >
              📈 Buy
            </button>
            <button
              className={`mode-btn ${shortMode ? "active" : ""}`}
              onClick={() => setShortMode(true)}
            >
              📉 Short
            </button>
          </div>
        </div>
        <div className="buy-grid">
          {(() => {
            // Build quick buy list: pinned first, then recent trades, up to 6
            const pinned = gameState.pinnedStocks;
            const recent = gameState.recentTrades.filter((s) => !pinned.includes(s));
            const symbols = [...pinned, ...recent].slice(0, 6);
            const quickStocks = symbols
              .map((sym) => gameState.stocks.find((s) => s.symbol === sym))
              .filter(Boolean) as typeof gameState.stocks;

            if (quickStocks.length === 0) {
              return <div className="empty">Trade a stock to add it here</div>;
            }

            return quickStocks.map((stock) => {
              const maxShares = Math.floor(gameState.cash / stock.price);
              const isPinned = pinned.includes(stock.symbol);
              return (
                <div key={stock.symbol} className="trade-row">
                  <button
                    className={`pin-btn ${isPinned ? "pinned" : ""}`}
                    onClick={() => onTogglePin(stock.symbol)}
                    title={isPinned ? "Unpin" : "Pin to quick buy"}
                  >
                    📌
                  </button>
                  <button
                    className={`buy-btn ${shortMode ? "short-mode" : ""}`}
                    onClick={() => handleAction(stock.symbol, 1)}
                    disabled={stock.price > gameState.cash}
                  >
                    {actionLabel} 1 {stock.symbol} @ ${stock.price.toFixed(2)}
                  </button>
                  <button
                    className={`buy-btn buy-10 ${shortMode ? "short-mode" : ""}`}
                    onClick={() => handleAction(stock.symbol, 10)}
                    disabled={stock.price * 10 > gameState.cash}
                  >
                    10
                  </button>
                  <button
                    className={`buy-btn buy-max ${shortMode ? "short-mode" : ""}`}
                    onClick={() => handleAction(stock.symbol, maxShares)}
                    disabled={maxShares < 1}
                  >
                    Max
                  </button>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
