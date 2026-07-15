import { useMemo, useState } from "react";
import { GameState } from "../game/types";
import { getMilestone, getBuyingPower, hasUpgrade, getOptionsValue } from "../game/engine";
import { UPGRADE_POOL } from "../game/upgrades";

interface TradingPanelProps {
  gameState: GameState;
  onBuy: (symbol: string, shares: number) => void;
  onSell: (symbol: string, shares: number) => void;
  onShort: (symbol: string, shares: number) => void;
  onCover: (symbol: string, shares: number) => void;
  onTogglePin: (symbol: string) => void;
  onToggleStopLoss: () => void;
}

export function TradingPanel({ gameState, onBuy, onSell, onShort, onCover, onTogglePin, onToggleStopLoss }: TradingPanelProps) {
  const [shortMode, setShortMode] = useState(false);
  const portfolioValue = gameState.portfolio.reduce((sum, pos) => {
    const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);
  const shortLiability = gameState.shorts.reduce((sum, pos) => {
    const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);
  const shortCollateral = gameState.shorts.reduce((sum, pos) => sum + pos.entryPrice * pos.shares, 0);
  const optionsValue = getOptionsValue(gameState);
  const netWorth = gameState.cash + portfolioValue + shortCollateral - shortLiability + optionsValue;
  const buyingPower = getBuyingPower(gameState);
  const marginActive = buyingPower > gameState.cash + 0.01;
  const milestone = getMilestone(gameState.day, gameState.playerCount);
  const daysUntilCheck = milestone ? milestone.checkDay - gameState.day : 0;
  const loansDue = milestone
    ? gameState.loans.filter((l) => l.dueDay <= milestone.checkDay).reduce((sum, l) => sum + l.amount * (1 + l.interestRate), 0)
    : 0;
  const effectiveTarget = milestone ? milestone.required + loansDue : 0;
  const onTrack = milestone ? netWorth >= effectiveTarget : true;
  const handleAction = shortMode ? onShort : onBuy;
  const actionLabel = shortMode ? "Short" : "Buy";
  const showStopLoss = hasUpgrade(gameState, "stop_loss_ins");
  const showBlockTrade = hasUpgrade(gameState, "block_trade");

  const ownedUpgrades = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of gameState.acquiredUpgrades) counts.set(id, (counts.get(id) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([id, count]) => ({ card: UPGRADE_POOL.find((u) => u.id === id), count }))
      .filter((entry): entry is { card: (typeof UPGRADE_POOL)[number]; count: number } => Boolean(entry.card));
  }, [gameState.acquiredUpgrades]);

  return (
    <div className="trading-panel">
      <div className="account-summary">
        <div className="stat"><span className="stat-label">Cash</span><span className="stat-value">${gameState.cash.toFixed(2)}</span></div>
        {marginActive && <div className="stat"><span className="stat-label">Buying Power</span><span className="stat-value">${buyingPower.toFixed(2)}</span></div>}
        <div className="stat"><span className="stat-label">Portfolio</span><span className="stat-value">${portfolioValue.toFixed(2)}</span></div>
        <div className="stat"><span className="stat-label">Net Worth</span><span className="stat-value">${netWorth.toFixed(2)}</span></div>
        <div className="stat"><span className="stat-label">Day</span><span className="stat-value">{gameState.day}</span></div>
        {milestone && <div className="stat milestone-stat"><span className="stat-label">Target (in {daysUntilCheck}d)</span><span className={`stat-value ${onTrack ? "milestone-ok" : "danger"}`}>${effectiveTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>}
      </div>

      {showStopLoss && (
        <div className="stop-loss-toggle-row">
          <span>🛡️ Stop Loss Insurance</span>
          <button className={`stop-loss-toggle ${gameState.stopLossEnabled ? "enabled" : "disabled"}`} onClick={onToggleStopLoss}>{gameState.stopLossEnabled ? "ON" : "OFF"}</button>
        </div>
      )}

      <div className="positions-scroll">
        <div className="positions">
          <h3>Positions</h3>
          {gameState.portfolio.length === 0 && <div className="empty">No positions</div>}
          {gameState.portfolio.map((pos) => {
            const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
            const currentValue = stock ? stock.price * pos.shares : 0;
            const costBasis = pos.avgCost * pos.shares;
            const pnl = currentValue - costBasis;
            return <div key={pos.symbol} className="position-row"><span className="pos-symbol">{pos.symbol}</span><span className="pos-shares">{pos.shares} shares</span><span className={`pos-pnl ${pnl >= 0 ? "up" : "down"}`}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</span><button className="sell-btn" onClick={() => onSell(pos.symbol, 1)}>Sell 1</button><button className="sell-btn" onClick={() => onSell(pos.symbol, pos.shares)}>Sell All</button></div>;
          })}
        </div>
        <div className="positions">
          <h3>Short Positions</h3>
          {gameState.shorts.length === 0 && <div className="empty">No shorts</div>}
          {gameState.shorts.map((pos) => {
            const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
            const pnl = (pos.entryPrice * pos.shares) - (stock ? stock.price * pos.shares : 0);
            return <div key={pos.symbol} className="position-row"><span className="pos-symbol">{pos.symbol}</span><span className="pos-shares">{pos.shares} short</span><span className={`pos-pnl ${pnl >= 0 ? "up" : "down"}`}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</span><button className="sell-btn" onClick={() => onCover(pos.symbol, 1)}>Cover 1</button><button className="sell-btn" onClick={() => onCover(pos.symbol, pos.shares)}>Cover All</button></div>;
          })}
        </div>
      </div>

      <div className="quick-buy">
        <div className="quick-buy-header">
          <h3>Quick {actionLabel}</h3>
          {gameState.freeNextStock && !shortMode && <span style={{ color: "#ffd700", fontWeight: 700, fontSize: "0.85rem" }}>🎟️ Next purchase is FREE!</span>}
          <div className="trade-mode-toggle">
            <button className={`mode-btn ${!shortMode ? "active" : ""}`} onClick={() => setShortMode(false)}>📈 Buy</button>
            <button className={`mode-btn ${shortMode ? "active" : ""}`} onClick={() => setShortMode(true)}>📉 Short</button>
          </div>
        </div>
        <div className="buy-grid">
          {(() => {
            const pinned = gameState.pinnedStocks;
            const recent = gameState.recentTrades.filter((s) => !pinned.includes(s));
            const symbols = [...pinned, ...recent].slice(0, 6);
            const quickStocks = symbols.map((sym) => gameState.stocks.find((s) => s.symbol === sym)).filter(Boolean) as typeof gameState.stocks;
            if (quickStocks.length === 0) return <div className="empty">Trade a stock to add it here</div>;
            return quickStocks.map((stock) => {
              const maxShares = Math.floor(buyingPower / stock.price);
              const isPinned = pinned.includes(stock.symbol);
              return (
                <div key={stock.symbol} className="trade-row">
                  <button className={`pin-btn ${isPinned ? "pinned" : ""}`} onClick={() => onTogglePin(stock.symbol)} title={isPinned ? "Unpin" : "Pin to quick buy"}>📌</button>
                  <button className={`buy-btn ${shortMode ? "short-mode" : ""}`} onClick={() => handleAction(stock.symbol, 1)} disabled={stock.price > buyingPower}>{actionLabel} 1 {stock.symbol} @ ${stock.price.toFixed(2)}</button>
                  <button className={`buy-btn buy-10 ${shortMode ? "short-mode" : ""}`} onClick={() => handleAction(stock.symbol, 10)} disabled={stock.price * 10 > buyingPower}>10</button>
                  <button className={`buy-btn buy-max ${shortMode ? "short-mode" : ""}`} onClick={() => handleAction(stock.symbol, maxShares)} disabled={maxShares < 1}>Max</button>
                  {showBlockTrade && <button className={`buy-btn buy-100 ${shortMode ? "short-mode" : ""}`} onClick={() => handleAction(stock.symbol, 100)} disabled={stock.price * 100 > buyingPower}>100</button>}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {ownedUpgrades.length > 0 && (
        <div className="owned-upgrades">
          <div className="owned-upgrades-title">Upgrades</div>
          <div className="owned-upgrades-list">
            {ownedUpgrades.map(({ card, count }) => <div key={card.id} className="owned-upgrade-chip" title={`${card.name}${count > 1 ? ` x${count}` : ""}`}><span>{card.icon}</span>{count > 1 && <span className="owned-upgrade-count">x{count}</span>}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
