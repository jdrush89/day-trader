import { useState } from "react";
import { GameState, OrderType, OrderSide, PendingOrder, OptionsContract } from "../game/types";
import { calculateOptionPremium, getOptionValue } from "../game/engine";

interface OrdersPanelProps {
  gameState: GameState;
  open: boolean;
  onClose: () => void;
  onPlaceOrder: (symbol: string, side: OrderSide, shares: number, orderType: OrderType, limitPrice?: number, stopPrice?: number) => void;
  onCancelOrder: (orderId: string) => void;
  onBuyOption: (symbol: string, type: "call" | "put", strike: number, days: number, contracts: number) => void;
  onSellOption: (symbol: string, type: "call" | "put", strike: number, days: number, contracts: number) => void;
  onCloseOption: (optionId: string) => void;
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
      {stock && parseInt(shares) > 0 && (() => {
        const qty = parseInt(shares);
        const unitPrice = orderType === "market" ? stock.price : orderType === "limit" ? (parseFloat(price) || 0) : (parseFloat(price) || 0);
        const total = qty * unitPrice;
        if (!unitPrice) return null;
        const isBuying = side === "buy" || side === "short";
        return (
          <div className="order-cost-estimate">
            <span>Est. {isBuying ? "cost" : "proceeds"}:</span>
            <span className={`order-cost-value ${isBuying && total > gameState.cash ? "over-budget" : ""}`}>
              ${total.toFixed(2)}
            </span>
          </div>
        );
      })()}
    </form>
  );
}

function OptionsForm({ gameState, onBuyOption, onSellOption }: {
  gameState: GameState;
  onBuyOption: OrdersPanelProps["onBuyOption"];
  onSellOption: OrdersPanelProps["onSellOption"];
}) {
  const [symbol, setSymbol] = useState(gameState.stocks[0]?.symbol ?? "");
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [strikeOffset, setStrikeOffset] = useState("0");
  const [daysInput, setDaysInput] = useState("1");
  const [contractsInput, setContractsInput] = useState("1");

  const stock = gameState.stocks.find((s) => s.symbol === symbol);
  const offsetPct = parseFloat(strikeOffset) || 0;
  const strikePrice = stock ? Math.round(stock.price * (1 + offsetPct / 100) * 100) / 100 : 0;
  const days = Math.max(1, Math.min(7, parseInt(daysInput) || 1));
  const contracts = Math.max(1, parseInt(contractsInput) || 1);

  const estimateVol = (s: GameState["stocks"][0]): number => {
    const prices = s.dailyHistory.length > 1
      ? s.dailyHistory.slice(-30).map((d) => d.close)
      : s.history.length > 5 ? s.history.slice(-50) : [s.price];
    if (prices.length < 2) return 0.4;
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    if (returns.length === 0) return 0.4;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    return Math.max(0.15, Math.min(1.5, Math.sqrt(variance) * Math.sqrt(252)));
  };

  const premium = stock
    ? calculateOptionPremium(stock.price, strikePrice, days, optionType, estimateVol(stock))
    : 0;
  const totalCost = premium * contracts * 100;

  const handleBuy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stock || contracts <= 0) return;
    onBuyOption(symbol, optionType, strikePrice, days, contracts);
  };

  const handleSell = () => {
    if (!stock || contracts <= 0) return;
    onSellOption(symbol, optionType, strikePrice, days, contracts);
  };

  const STRIKE_OFFSETS = [
    { value: "-15", label: "-15% (Deep ITM)", itmLabel: "call" },
    { value: "-10", label: "-10% (ITM)" },
    { value: "-5", label: "-5% (Slight ITM)" },
    { value: "0", label: "ATM (At the Money)" },
    { value: "5", label: "+5% (Slight OTM)" },
    { value: "10", label: "+10% (OTM)" },
    { value: "15", label: "+15% (Deep OTM)" },
  ];

  return (
    <form className="order-form options-form" onSubmit={handleBuy}>
      <div className="order-form-row">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="order-select">
          {gameState.stocks.map((s) => (
            <option key={s.symbol} value={s.symbol}>{s.symbol} — ${s.price.toFixed(2)}</option>
          ))}
        </select>
        <select value={optionType} onChange={(e) => setOptionType(e.target.value as "call" | "put")} className="order-select">
          <option value="call">📈 Call</option>
          <option value="put">📉 Put</option>
        </select>
      </div>
      <div className="order-form-row">
        <div className="option-field">
          <label className="option-label">Strike</label>
          <select
            value={strikeOffset}
            onChange={(e) => setStrikeOffset(e.target.value)}
            className="order-select"
          >
            {STRIKE_OFFSETS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {stock && (
          <span className="option-strike-preview">≈ ${strikePrice.toFixed(2)}</span>
        )}
      </div>
      <div className="order-form-row">
        <div className="option-field">
          <label className="option-label">Expiry</label>
          <select value={daysInput} onChange={(e) => setDaysInput(e.target.value)} className="order-select">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>
            ))}
          </select>
        </div>
        <div className="option-field">
          <label className="option-label">Contracts</label>
          <input
            type="number"
            min="1"
            value={contractsInput}
            onChange={(e) => setContractsInput(e.target.value)}
            className="order-input"
          />
        </div>
      </div>
      <div className="option-premium-display">
        <div className="option-premium-row">
          <span>Premium per share:</span>
          <span className="option-premium-value">${premium.toFixed(2)}</span>
        </div>
        <div className="option-premium-row">
          <span>Total cost ({contracts} × 100 shares):</span>
          <span className="option-premium-value">${totalCost.toFixed(2)}</span>
        </div>
      </div>
      <div className="option-action-buttons">
        <button type="submit" className="order-submit option-buy" disabled={totalCost > gameState.cash}>
          Buy {optionType === "call" ? "Call" : "Put"}
        </button>
        <button type="button" className="order-submit option-write" onClick={handleSell} disabled={totalCost > gameState.cash}>
          Write {optionType === "call" ? "Call" : "Put"}
        </button>
      </div>
    </form>
  );
}

function OptionsPositionsList({ positions, stocks, currentDay, onClose }: {
  positions: OptionsContract[];
  stocks: GameState["stocks"];
  currentDay: number;
  onClose: (id: string) => void;
}) {
  if (positions.length === 0) return <div className="empty">No options positions</div>;

  return (
    <div className="pending-orders-list">
      {positions.map((opt) => {
        const stock = stocks.find((s) => s.symbol === opt.symbol);
        const currentValue = stock ? getOptionValue(opt, stock, currentDay) : 0;
        const costBasis = opt.premium;
        const pnl = opt.side === "long"
          ? (currentValue - costBasis) * opt.contracts * 100
          : (costBasis - currentValue) * opt.contracts * 100;
        const daysLeft = opt.expirationDay - currentDay;
        const isITM = stock
          ? opt.type === "call" ? stock.price > opt.strikePrice : stock.price < opt.strikePrice
          : false;

        return (
          <div key={opt.id} className="pending-order-row option-position-row">
            <div className="option-pos-top">
              <span className={`order-side ${opt.side === "long" ? "buy" : "short"}`}>
                {opt.side === "long" ? "LONG" : "SHORT"}
              </span>
              <span className={`option-type-badge ${opt.type}`}>
                {opt.type === "call" ? "CALL" : "PUT"}
              </span>
              <span className="order-detail">{opt.contracts}× {opt.symbol}</span>
              <button className="order-cancel-btn" onClick={() => onClose(opt.id)}>
                {opt.side === "long" ? "Sell" : "Buy Back"}
              </button>
            </div>
            <div className="option-pos-details">
              <span>Strike: ${opt.strikePrice.toFixed(2)}</span>
              <span className={isITM ? "up" : "down"}>{isITM ? "ITM" : "OTM"}</span>
              <span>{daysLeft}d left</span>
              <span className={pnl >= 0 ? "up" : "down"}>
                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
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

export function OrdersPanel({ gameState, open, onClose, onPlaceOrder, onCancelOrder, onBuyOption, onSellOption, onCloseOption }: OrdersPanelProps) {
  const [tab, setTab] = useState<"orders" | "options">("orders");

  return (
    <div className={`orders-flyout ${open ? "open" : ""}`}>
      <div className="orders-flyout-header">
        <h3>📋 {tab === "orders" ? "Custom Orders" : "Options"}</h3>
        <button className="orders-flyout-close" onClick={onClose}>✕</button>
      </div>
      <div className="orders-tab-bar">
        <button className={`orders-tab-btn ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          Orders
        </button>
        <button className={`orders-tab-btn ${tab === "options" ? "active" : ""}`} onClick={() => setTab("options")}>
          Options {gameState.optionsPositions.length > 0 && <span className="tab-badge">{gameState.optionsPositions.length}</span>}
        </button>
      </div>
      <div className="orders-flyout-content">
        {tab === "orders" ? (
          <>
            <OrderForm gameState={gameState} onPlaceOrder={onPlaceOrder} />
            <div className="pending-orders">
              <h4>Pending ({gameState.pendingOrders.length})</h4>
              <PendingOrdersList
                orders={gameState.pendingOrders}
                stocks={gameState.stocks}
                onCancel={onCancelOrder}
              />
            </div>
          </>
        ) : (
          <>
            <OptionsForm gameState={gameState} onBuyOption={onBuyOption} onSellOption={onSellOption} />
            <div className="pending-orders">
              <h4>Positions ({gameState.optionsPositions.length})</h4>
              <OptionsPositionsList
                positions={gameState.optionsPositions}
                stocks={gameState.stocks}
                currentDay={gameState.day}
                onClose={onCloseOption}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
