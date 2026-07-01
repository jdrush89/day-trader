import { GameState } from "../game/types";

interface TradingPanelProps {
  gameState: GameState;
  onBuy: (symbol: string, shares: number) => void;
  onSell: (symbol: string, shares: number) => void;
}

export function TradingPanel({ gameState, onBuy, onSell }: TradingPanelProps) {
  const portfolioValue = gameState.portfolio.reduce((sum, pos) => {
    const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);

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
          <span className="stat-label">Loan</span>
          <span className="stat-value danger">${gameState.loan.toFixed(2)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Interest</span>
          <span className="stat-value danger">{(gameState.interestRate * 100).toFixed(0)}%/day</span>
        </div>
        <div className="stat">
          <span className="stat-label">Day</span>
          <span className="stat-value">{gameState.day}</span>
        </div>
      </div>

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

      <div className="quick-buy">
        <h3>Quick Buy</h3>
        <div className="buy-grid">
          {gameState.stocks.map((stock) => (
            <button
              key={stock.symbol}
              className="buy-btn"
              onClick={() => onBuy(stock.symbol, 1)}
              disabled={stock.price > gameState.cash}
            >
              {stock.symbol} @ ${stock.price.toFixed(2)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
