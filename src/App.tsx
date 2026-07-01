import { useState, useEffect, useCallback } from "react";
import { GameState, MonitorChannel } from "./game/types";
import { createInitialState } from "./game/state";
import { tick, buyStock, sellStock, shortStock, coverShort, openMarket, purchaseUpgrade } from "./game/engine";
import { Monitor } from "./components/Monitor";
import { TradingPanel } from "./components/TradingPanel";
import { UpgradeShop } from "./components/UpgradeShop";

function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [shopOpen, setShopOpen] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  // Game loop
  useEffect(() => {
    if (gameState.gameOver || !gameState.marketOpen) return;

    const interval = setInterval(() => {
      setGameState((prev) => tick(prev));
    }, 1000 / speed);

    return () => clearInterval(interval);
  }, [gameState.marketOpen, gameState.gameOver, speed]);

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

  const handleRestart = useCallback(() => {
    setGameState(createInitialState());
  }, []);

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
              {gameState.marketOpen ? `Market Open — ${gameState.timeOfDay}%` : "Market Closed"}
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

        return (
          <div className="end-of-day-overlay">
            <div className="end-of-day">
              <h2>📋 End of Day {gameState.day - 1}</h2>
              <div className="eod-stats">
                <p>Interest paid: <strong>${(gameState.loan * gameState.interestRate).toFixed(2)}</strong></p>
                <p>Cash remaining: <strong>${gameState.cash.toFixed(2)}</strong></p>
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
              onChangeChannel={handleChangeChannel}
              onSelectStock={handleSelectStock}
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
