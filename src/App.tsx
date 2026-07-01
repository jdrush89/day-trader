import { useState, useEffect, useCallback } from "react";
import { GameState, MonitorChannel } from "./game/types";
import { createInitialState } from "./game/state";
import { tick, buyStock, sellStock, shortStock, coverShort, openMarket, purchaseUpgrade } from "./game/engine";
import { Monitor } from "./components/Monitor";
import { TradingPanel } from "./components/TradingPanel";
import { UpgradeShop } from "./components/UpgradeShop";
import titleScreen from "./assets/title-screen.png";

function App() {
  const [showTitle, setShowTitle] = useState(true);
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [shopOpen, setShopOpen] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [paused, setPaused] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // Game loop
  useEffect(() => {
    if (gameState.gameOver || !gameState.marketOpen || paused) return;

    const interval = setInterval(() => {
      setGameState((prev) => tick(prev));
    }, 1000 / speed);

    return () => clearInterval(interval);
  }, [gameState.marketOpen, gameState.gameOver, speed, paused]);

  // Escape key toggles pause menu, 'n' toggles debug mode, number keys switch channels
  const CHANNEL_KEYS: MonitorChannel[] = ["stock_ticker", "business_news", "global_news", "social_media", "insider"];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showTitle) {
        setShowTitle(false);
        return;
      }

      // Number keys 1-5 switch channel on the first monitor (override even focused inputs)
      const num = parseInt(e.key);
      if (num >= 1 && num <= CHANNEL_KEYS.length) {
        e.preventDefault();
        setGameState((prev) => ({
          ...prev,
          monitors: prev.monitors.map((m) =>
            m.id === 0 ? { ...m, channel: CHANNEL_KEYS[num - 1] } : m
          ),
        }));
        return;
      }

      if (e.key === "Escape") {
        setPaused((p) => !p);
      } else if (e.key === "n" || e.key === "N") {
        setDebugMode((d) => !d);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTitle]);

  const handleChangeChannel = useCallback((monitorId: number, channel: MonitorChannel) => {
    setGameState((prev) => ({
      ...prev,
      monitors: prev.monitors.map((m) =>
        m.id === monitorId ? { ...m, channel } : m
      ),
    }));
  }, []);

  const handleSelectStock = useCallback((monitorId: number, symbol: string) => {
    setGameState((prev) => ({
      ...prev,
      monitors: prev.monitors.map((m) =>
        m.id === monitorId ? { ...m, selectedStock: symbol } : m
      ),
    }));
  }, []);

  const handleBuy = useCallback((symbol: string, shares: number) => {
    setGameState((prev) => buyStock(prev, symbol, shares));
  }, []);

  const handleSell = useCallback((symbol: string, shares: number) => {
    setGameState((prev) => sellStock(prev, symbol, shares));
  }, []);

  const handleShort = useCallback((symbol: string, shares: number) => {
    setGameState((prev) => shortStock(prev, symbol, shares));
  }, []);

  const handleCover = useCallback((symbol: string, shares: number) => {
    setGameState((prev) => coverShort(prev, symbol, shares));
  }, []);

  const handlePurchase = useCallback((upgradeId: string) => {
    setGameState((prev) => purchaseUpgrade(prev, upgradeId));
  }, []);

  const handleNewDay = useCallback(() => {
    setGameState((prev) => openMarket(prev));
  }, []);

  const handleViewInsider = useCallback(() => {
    setGameState((prev) => {
      if (prev.insiderViewed) return prev;
      return {
        ...prev,
        insiderViewed: true,
        insiderViewedTick: prev.timeOfDay,
        insiderSnapshotHoldings: prev.portfolio.map((p) => ({ ...p })),
        insiderSnapshotShorts: prev.shorts.map((p) => ({ ...p })),
      };
    });
  }, []);

  const handleRestart = useCallback(() => {
    setGameState(createInitialState());
    setShowTitle(true);
  }, []);

  // Convert timeOfDay (0-100) to market time (9:30 AM - 4:00 PM)
  const formatMarketTime = (pct: number): string => {
    const startMinutes = 570; // 9:30 AM
    const endMinutes = 960;   // 4:00 PM
    const totalMinutes = startMinutes + (pct / 100) * (endMinutes - startMinutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.floor(totalMinutes % 60);
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHour = hours > 12 ? hours - 12 : hours;
    return `${displayHour}:${mins.toString().padStart(2, "0")} ${ampm}`;
  };

  if (showTitle) {
    return (
      <div className="title-screen">
        <img src={titleScreen} alt="Day Trader" className="title-screen-bg" />
        <div className="title-screen-overlay">
          <button className="title-start-btn" onClick={() => setShowTitle(false)}>
            START TRADING
          </button>
          <p className="title-hint">Press any key to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      <header className="game-header">
        <h1>📈 Day Trader</h1>
        <div className="header-controls">
          <div className="time-bar">
            <div
              className="time-fill"
              style={{ width: `${gameState.timeOfDay}%` }}
            />
            <span className="time-label">
              {paused ? "⏸ PAUSED" : gameState.marketOpen ? `Day ${gameState.day} — ${formatMarketTime(gameState.timeOfDay)}` : "Market Closed"}
            </span>
          </div>
          <div className="speed-controls">
            <button className={speed === 1 ? "active" : ""} onClick={() => setSpeed(1)}>1x</button>
            <button className={speed === 2 ? "active" : ""} onClick={() => setSpeed(2)}>2x</button>
            <button className={speed === 5 ? "active" : ""} onClick={() => setSpeed(5)}>5x</button>
          </div>
          <button className="shop-btn" onClick={() => setShopOpen(true)}>🛒 Shop</button>
        </div>
      </header>

      {paused && (
        <div className="pause-overlay">
          <div className="pause-menu">
            <h2>⏸ Paused</h2>
            <button className="pause-menu-btn resume" onClick={() => setPaused(false)}>
              Resume
            </button>
            <button className="pause-menu-btn restart" onClick={() => { setPaused(false); handleRestart(); }}>
              Start Over
            </button>
            <p className="pause-hint">Press ESC to resume</p>
          </div>
        </div>
      )}

      {gameState.gameOver && (
        <div className="game-over-overlay">
          <div className="game-over">
            <h2>💸 MARGIN CALLED</h2>
            <p>You survived {gameState.day} days</p>
            <p>Total P&L: ${gameState.totalProfit.toFixed(2)}</p>
            <button onClick={handleRestart}>Try Again</button>
          </div>
        </div>
      )}

      {!gameState.marketOpen && !gameState.gameOver && (() => {
        const ranked = [...gameState.stocks]
          .map((s) => ({
            ...s,
            change: s.price - s.openPrice,
            changePct: ((s.price - s.openPrice) / s.openPrice) * 100,
          }))
          .sort((a, b) => b.changePct - a.changePct);
        const winners = ranked.filter((s) => s.changePct > 0);
        const losers = ranked.filter((s) => s.changePct < 0).reverse();

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
        const currentNetWorth = gameState.cash + portfolioValue + shortCollateral - shortLiability;
        const dailyPnL = currentNetWorth - gameState.dayStartNetWorth;
        const interest = gameState.loan * gameState.interestRate;

        return (
          <div className="end-of-day-overlay">
            <div className="end-of-day">
              <h2>📋 End of Day {gameState.day - 1}</h2>
              <div className="eod-pnl-hero">
                <span className="eod-pnl-label">Today's P&L</span>
                <span className={`eod-pnl-value ${dailyPnL >= 0 ? "up" : "down"}`}>
                  {dailyPnL >= 0 ? "+$" : "-$"}{Math.abs(dailyPnL).toFixed(2)}
                </span>
              </div>
              <div className="eod-stats">
                <div className="eod-stat-row">
                  <span>Interest paid</span>
                  <span className="danger">-${interest.toFixed(2)}</span>
                </div>
                <div className="eod-stat-row">
                  <span>Net worth</span>
                  <span>${currentNetWorth.toFixed(2)}</span>
                </div>
                <div className="eod-stat-row">
                  <span>Cash</span>
                  <span>${gameState.cash.toFixed(2)}</span>
                </div>
                <div className="eod-stat-row">
                  <span>Portfolio value</span>
                  <span>${portfolioValue.toFixed(2)}</span>
                </div>
              </div>

              <div className="eod-movers">
                <div className="eod-column">
                  <h3 className="eod-winners-title">📈 Winners</h3>
                  {winners.length === 0 && <span className="eod-none">None</span>}
                  {winners.map((s) => (
                    <div key={s.symbol} className="eod-mover-row">
                      <span className="eod-symbol">{s.symbol}</span>
                      <span className="eod-price">${s.price.toFixed(2)}</span>
                      <span className="eod-change up">
                        +${s.change.toFixed(2)} (+{s.changePct.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
                <div className="eod-column">
                  <h3 className="eod-losers-title">📉 Losers</h3>
                  {losers.length === 0 && <span className="eod-none">None</span>}
                  {losers.map((s) => (
                    <div key={s.symbol} className="eod-mover-row">
                      <span className="eod-symbol">{s.symbol}</span>
                      <span className="eod-price">${s.price.toFixed(2)}</span>
                      <span className="eod-change down">
                        -${Math.abs(s.change).toFixed(2)} ({s.changePct.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {gameState.secFines.filter((f) => f.day === gameState.day - 1).map((fine, i) => (
                <div key={i} className="sec-fine-alert">
                  <div className="sec-fine-header">🚨 SEC ENFORCEMENT ACTION 🚨</div>
                  <div className="sec-fine-body">
                    You have been fined for insider trading on <strong>${fine.symbol}</strong>.
                    <br />Illegal profit detected: <span className="up">${fine.profit.toFixed(2)}</span>
                    <br />Fine imposed: <span className="danger">-${fine.amount.toFixed(2)}</span>
                  </div>
                </div>
              ))}

              <button onClick={handleNewDay}>Start Day {gameState.day}</button>
            </div>
          </div>
        );
      })()}

      <div className="main-layout">
        <div className="monitors-area">
          {gameState.monitors.map((monitor) => (
            <Monitor
              key={monitor.id}
              monitor={monitor}
              gameState={gameState}
              debugMode={debugMode}
              onChangeChannel={handleChangeChannel}
              onSelectStock={handleSelectStock}
              onViewInsider={handleViewInsider}
            />
          ))}
        </div>
        <aside className="sidebar">
          <TradingPanel
            gameState={gameState}
            onBuy={handleBuy}
            onSell={handleSell}
            onShort={handleShort}
            onCover={handleCover}
          />
        </aside>
      </div>

      {shopOpen && (
        <UpgradeShop
          gameState={gameState}
          onPurchase={handlePurchase}
          onClose={() => setShopOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
