import { useState } from "react";
import { GameState } from "../game/types";
import { UPGRADE_POOL } from "../game/upgrades";
import { RESTAURANT_UPGRADE_POOL } from "../game/restaurant-upgrades";
import { STOCK_POOL, StockCandidate } from "../game/stock-pool";
import { MENU_POOL } from "../game/restaurant-engine";
import { openMarket, isBossDayCheck } from "../game/engine";

interface DebugPanelProps {
  gameState: GameState;
  setGameState: (updater: (prev: GameState) => GameState) => void;
  onClose: () => void;
  onSkipToDay?: (day: number, cash: number, tradingTickets: number, restaurantTickets: number) => void;
}

function generateStockFromCandidate(candidate: StockCandidate, day: number) {
  const price = candidate.priceRange[0] + Math.random() * (candidate.priceRange[1] - candidate.priceRange[0]);
  const roundedPrice = Math.round(price * 100) / 100;
  const history: number[] = [roundedPrice];
  for (let i = 1; i < Math.min(candidate.historyDays, 60); i++) {
    const prev = history[history.length - 1];
    const change = prev * candidate.volatility * (Math.random() * 2 - 1);
    history.push(Math.max(1, Math.round((prev + change) * 100) / 100));
  }
  history.reverse();
  return {
    symbol: candidate.symbol,
    name: candidate.name,
    price: roundedPrice,
    openPrice: roundedPrice,
    history,
    dailyHistory: [],
    tags: candidate.tags,
    ipoDay: day,
  };
}

export function DebugPanel({ gameState, setGameState, onClose, onSkipToDay }: DebugPanelProps) {
  const [skipDay, setSkipDay] = useState(gameState.day + 1);
  const [skipCash, setSkipCash] = useState(gameState.cash);
  const [skipTradingTickets, setSkipTradingTickets] = useState(gameState.tradingTickets);
  const [skipRestaurantTickets, setSkipRestaurantTickets] = useState(gameState.restaurantTickets);
  const [tab, setTab] = useState<"skip" | "upgrades" | "stocks" | "recipes">("skip");

  const handleSkipToDay = () => {
    if (onSkipToDay) {
      onSkipToDay(skipDay, skipCash, skipTradingTickets, skipRestaurantTickets);
    } else {
      setGameState((prev) => {
        const updated = { ...prev, day: skipDay, cash: skipCash, tradingTickets: skipTradingTickets, restaurantTickets: skipRestaurantTickets, tickets: skipTradingTickets + skipRestaurantTickets, marketOpen: false, loans: [] };
        return openMarket(updated);
      });
    }
    onClose();
  };

  const toggleUpgrade = (id: string) => {
    setGameState((prev) => {
      const has = prev.acquiredUpgrades.includes(id);
      return {
        ...prev,
        acquiredUpgrades: has
          ? prev.acquiredUpgrades.filter((u) => u !== id)
          : [...prev.acquiredUpgrades, id],
      };
    });
  };

  const toggleRestaurantUpgrade = (id: string) => {
    setGameState((prev) => {
      const has = prev.acquiredRestaurantUpgrades.includes(id);
      return {
        ...prev,
        acquiredRestaurantUpgrades: has
          ? prev.acquiredRestaurantUpgrades.filter((u) => u !== id)
          : [...prev.acquiredRestaurantUpgrades, id],
      };
    });
  };

  const toggleStock = (symbol: string) => {
    setGameState((prev) => {
      const has = prev.stocks.find((s) => s.symbol === symbol);
      if (has) {
        return {
          ...prev,
          stocks: prev.stocks.filter((s) => s.symbol !== symbol),
          draftedSymbols: prev.draftedSymbols.filter((s) => s !== symbol),
        };
      }
      const candidate = STOCK_POOL.find((s) => s.symbol === symbol);
      if (!candidate) return prev;
      const stock = generateStockFromCandidate(candidate, prev.day);
      return {
        ...prev,
        stocks: [...prev.stocks, stock],
        draftedSymbols: [...prev.draftedSymbols, symbol],
      };
    });
  };

  const toggleRecipe = (name: string) => {
    setGameState((prev) => {
      const has = prev.draftedMenuItems.includes(name);
      return {
        ...prev,
        draftedMenuItems: has
          ? prev.draftedMenuItems.filter((n) => n !== name)
          : [...prev.draftedMenuItems, name],
      };
    });
  };

  return (
    <div className="debug-panel">
      <h2>🐛 Debug Menu</h2>
      <div className="debug-tabs">
        <button className={tab === "skip" ? "active" : ""} onClick={() => setTab("skip")}>Skip Day</button>
        <button className={tab === "upgrades" ? "active" : ""} onClick={() => setTab("upgrades")}>Upgrades</button>
        <button className={tab === "stocks" ? "active" : ""} onClick={() => setTab("stocks")}>Stocks</button>
        <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}>Recipes</button>
      </div>

      {tab === "skip" && (
        <div className="debug-section">
          <div className="debug-field">
            <label>Skip to Day:</label>
            <input type="number" min={1} value={skipDay} onChange={(e) => setSkipDay(Number(e.target.value))} />
          </div>
          <div className="debug-field">
            <label>Cash Amount:</label>
            <input type="number" step={100} value={skipCash} onChange={(e) => setSkipCash(Number(e.target.value))} />
          </div>
          <div className="debug-field">
            <label>📈 Trading Tickets:</label>
            <input type="number" min={0} value={skipTradingTickets} onChange={(e) => setSkipTradingTickets(Number(e.target.value))} />
          </div>
          <div className="debug-field">
            <label>🍔 Restaurant Tickets:</label>
            <input type="number" min={0} value={skipRestaurantTickets} onChange={(e) => setSkipRestaurantTickets(Number(e.target.value))} />
          </div>
          <p className="debug-hint">
            Day {skipDay}: {isBossDayCheck(skipDay) ? "⚠️ Boss Day (trading + kitchen)" : "📈 Trading Day"}
          </p>
          <button className="debug-apply-btn" onClick={handleSkipToDay}>Apply & Resume</button>
        </div>
      )}

      {tab === "upgrades" && (
        <div className="debug-section debug-scroll">
          <h3>Trading Upgrades</h3>
          <div className="debug-grid">
            {UPGRADE_POOL.map((u) => (
              <button
                key={u.id}
                className={`debug-toggle ${gameState.acquiredUpgrades.includes(u.id) ? "active" : ""}`}
                onClick={() => toggleUpgrade(u.id)}
              >
                <span className="debug-icon">{u.icon}</span>
                <span className="debug-name">{u.name}</span>
              </button>
            ))}
          </div>
          <h3>Restaurant Upgrades</h3>
          <div className="debug-grid">
            {RESTAURANT_UPGRADE_POOL.map((u) => (
              <button
                key={u.id}
                className={`debug-toggle ${gameState.acquiredRestaurantUpgrades.includes(u.id) ? "active" : ""}`}
                onClick={() => toggleRestaurantUpgrade(u.id)}
              >
                <span className="debug-icon">{u.icon}</span>
                <span className="debug-name">{u.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "stocks" && (
        <div className="debug-section debug-scroll">
          <div className="debug-grid">
            {STOCK_POOL.map((s) => (
              <button
                key={s.symbol}
                className={`debug-toggle ${gameState.stocks.find((st) => st.symbol === s.symbol) ? "active" : ""}`}
                onClick={() => toggleStock(s.symbol)}
              >
                <span className="debug-icon">📈</span>
                <span className="debug-name">{s.symbol} — {s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "recipes" && (
        <div className="debug-section debug-scroll">
          <div className="debug-grid">
            {MENU_POOL.map((m) => (
              <button
                key={m.name}
                className={`debug-toggle ${gameState.draftedMenuItems.includes(m.name) ? "active" : ""}`}
                onClick={() => toggleRecipe(m.name)}
              >
                <span className="debug-icon">{m.icon}</span>
                <span className="debug-name">{m.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="pause-menu-btn" onClick={onClose}>← Back</button>
    </div>
  );
}
