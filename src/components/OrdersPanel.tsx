import { useState } from "react";
import { GameState, OrderType, OrderSide, PendingOrder } from "../game/types";

interface OrdersPanelProps {
  gameState: GameState;
  open: boolean;
  onClose: () => void;
  onPlaceOrder: (symbol: string, side: OrderSide, shares: number, orderType: OrderType, limitPrice?: number, stopPrice?: number) => void;
  onCancelOrder: (orderId: string) => void;
}

function OrderForm({ gameState, onPlaceOrder }: { gameState: GameState; onPlaceOrder: OrdersPanelProps["onPlaceOrder"] }) {
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
            placeholder={orderType === "limit" ? "Limit price" : "Stop price"}
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

export function OrdersPanel({ gameState, open, onClose, onPlaceOrder, onCancelOrder }: OrdersPanelProps) {
  return (
    <div className={`orders-flyout ${open ? "open" : ""}`}>
      <div className="orders-flyout-header">
        <h3>📋 Custom Orders</h3>
        <button className="orders-flyout-close" onClick={onClose}>✕</button>
      </div>
      <div className="orders-flyout-content">
        <OrderForm gameState={gameState} onPlaceOrder={onPlaceOrder} />
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
