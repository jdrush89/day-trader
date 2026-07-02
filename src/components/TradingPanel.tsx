import { useState } from "react";
import { GameState, OrderType, OrderSide, PendingOrder } from "../game/types";

interface TradingPanelProps {
  gameState: GameState;
  onBuy: (symbol: string, shares: number) => void;
  onSell: (symbol: string, shares: number) => void;
  onShort: (symbol: string, shares: number) => void;
  onCover: (symbol: string, shares: number) => void;
  onPlaceOrder: (symbol: string, side: OrderSide, shares: number, orderType: OrderType, limitPrice?: number, stopPrice?: number) => void;
  onCancelOrder: (orderId: string) => void;
}

function OrderForm({ gameState, onPlaceOrder }: { gameState: GameState; onPlaceOrder: TradingPanelProps["onPlaceOrder"] }) {
  const [symbol, setSymbol] = useState(gameState.stocks[0]?.symbol ?? "");
  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");

  const stock = gameState.stocks.find((s) => s.symbol === symbol);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(shares);
    if (!qty || qty <= 0) return;
    const p = parseFloat(price);
    if (orderType === "limit") {
      onPlaceOrder(symbol, side, qty, orderType, p, undefined);
    } else if (orderType === "stop-loss") {
      onPlaceOrder(symbol, side, qty, orderType, undefined, p);
    } else {
      onPlaceOrder(symbol, side, qty, orderType);
    }
    setShares("");
    setPrice("");
  };

  // Determine valid sides for stop-loss
  const sideOptions: { value: OrderSide; label: string }[] =
    orderType === "stop-loss"
      ? [
          { value: "sell", label: "Sell" },
          { value: "cover", label: "Cover" },
        ]
      : [
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell" },
          { value: "short", label: "Short" },
          { value: "cover", label: "Cover" },
        ];

  // Reset side if current side isn't valid for selected order type
  const validSides = sideOptions.map((s) => s.value);
  if (!validSides.includes(side)) {
    setSide(validSides[0]);
  }

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      <div className="order-form-row">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="order-select">
          {gameState.stocks.map((s) => (
            <option key={s.symbol} value={s.symbol}>{s.symbol} — ${s.price.toFixed(2)}</option>
          ))}
        </select>
        <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)} className="order-select">
          <option value="market">Market</option>
          <option value="limit">Limit</option>
          <option value="stop-loss">Stop Loss</option>
        </select>
      </div>
      <div className="order-form-row">
        <select value={side} onChange={(e) => setSide(e.target.value as OrderSide)} className="order-select">
          {sideOptions.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          placeholder="Shares"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          className="order-input"
        />
      </div>
      {orderType !== "market" && (
        <div className="order-form-row">
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder={orderType === "limit" ? `Limit price` : `Stop price`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="order-input order-price-input"
          />
          {stock && (
            <span className="order-current-price">Current: ${stock.price.toFixed(2)}</span>
          )}
        </div>
      )}
      <button type="submit" className={`order-submit ${side === "sell" || side === "cover" ? "sell" : side === "short" ? "short" : ""}`}>
        {orderType === "market" ? `${side.charAt(0).toUpperCase() + side.slice(1)} at Market` :
         orderType === "limit" ? `Place Limit ${side.charAt(0).toUpperCase() + side.slice(1)}` :
         `Set Stop Loss (${side.charAt(0).toUpperCase() + side.slice(1)})`}
      </button>
    </form>
  );
}

function PendingOrdersList({ orders, stocks, onCancel }: { orders: PendingOrder[]; stocks: GameState["stocks"]; onCancel: (id: string) => void }) {
  if (orders.length === 0) return <div className="empty">No pending orders</div>;

  return (
    <div className="pending-orders-list">
      {orders.map((order) => {
        const stock = stocks.find((s) => s.symbol === order.symbol);
        const triggerPrice = order.orderType === "limit" ? order.limitPrice : order.stopPrice;
        return (
          <div key={order.id} className="pending-order-row">
            <span className={`order-side ${order.side}`}>{order.side.toUpperCase()}</span>
            <span className="order-detail">
              {order.shares} {order.symbol}
            </span>
            <span className="order-trigger">
              {order.orderType === "limit" ? "@ $" : "stop $"}
              {triggerPrice?.toFixed(2)}
            </span>
            {stock && (
              <span className="order-distance">
                (now ${stock.price.toFixed(2)})
              </span>
            )}
            <button className="order-cancel-btn" onClick={() => onCancel(order.id)}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

export function TradingPanel({ gameState, onBuy, onSell, onShort, onCover, onPlaceOrder, onCancelOrder }: TradingPanelProps) {
  const [shortMode, setShortMode] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);

  const portfolioValue = gameState.portfolio.reduce((sum, pos) => {
    const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);

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
          {gameState.stocks.map((stock) => {
            const maxShares = Math.floor(gameState.cash / stock.price);
            return (
            <div key={stock.symbol} className="trade-row">
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
          })}
        </div>
      </div>

      <div className="custom-orders">
        <div className="custom-orders-header">
          <h3>Custom Orders</h3>
          <button
            className="order-toggle-btn"
            onClick={() => setShowOrderForm(!showOrderForm)}
          >
            {showOrderForm ? "▼ Hide" : "▶ New Order"}
          </button>
        </div>
        {showOrderForm && (
          <OrderForm gameState={gameState} onPlaceOrder={onPlaceOrder} />
        )}
        <div className="pending-orders">
          <h4>Pending ({gameState.pendingOrders.length})</h4>
          <PendingOrdersList
            orders={gameState.pendingOrders}
            stocks={gameState.stocks}
            onCancel={onCancelOrder}
          />
        </div>
      </div>
    </div>
  );
}
