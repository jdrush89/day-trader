import { useState, useEffect, useCallback } from "react";
import { GameState, MonitorChannel, OrderType, OrderSide } from "./game/types";
import { createInitialState } from "./game/state";
import { tick, buyStock, sellStock, shortStock, coverShort, openMarket, placeOrder, cancelOrder, getMilestone, draftStock, togglePinStock, acquireUpgrade, upgradeCount, hasUpgrade, buyOption, sellOption, closeOption, getOptionsValue } from "./game/engine";
import { UPGRADE_POOL } from "./game/upgrades";
import { Monitor } from "./components/Monitor";
import { TradingPanel } from "./components/TradingPanel";
import { OrdersPanel } from "./components/OrdersPanel";
import titleScreen from "./assets/title-screen.png";

function App() {
  const [showTitle, setShowTitle] = useState(true);
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [speed, setSpeed] = useState<number>(1);
  const [paused, setPaused] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [eodPhase, setEodPhase] = useState<"summary" | "upgrades" | "stocks">("summary");

  useEffect(() => {
    if (gameState.gameOver || !gameState.marketOpen || paused) return;
    const interval = setInterval(() => setGameState((prev) => tick(prev)), 1000 / speed);
    return () => clearInterval(interval);
  }, [gameState.marketOpen, gameState.gameOver, speed, paused]);

  const CHANNEL_KEYS: MonitorChannel[] = ["stock_ticker", "business_news", "global_news", "social_media", "insider"];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showTitle) {
        setShowTitle(false);
        return;
      }

      const num = parseInt(e.key);
      if (num >= 1 && num <= CHANNEL_KEYS.length) {
        const active = document.activeElement;
        const tag = active?.tagName.toLowerCase();
        const isStockSearch = active?.classList.contains("stock-search-input");
        if ((tag === "input" || tag === "select" || tag === "textarea") && !isStockSearch) return;
        e.preventDefault();
        setGameState((prev) => ({
          ...prev,
          monitors: prev.monitors.map((m) => (m.id === 0 ? { ...m, channel: CHANNEL_KEYS[num - 1] } : m)),
        }));
        return;
      }

      if (e.key === "Escape") setPaused((p) => !p);
      else if (e.key === "n" || e.key === "N") setDebugMode((d) => !d);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTitle]);

  useEffect(() => {
    if (gameState.marketOpen) setEodPhase("summary");
  }, [gameState.marketOpen]);

  const handleChangeChannel = useCallback((monitorId: number, channel: MonitorChannel) => {
    setGameState((prev) => ({
      ...prev,
      monitors: prev.monitors.map((m) => (m.id === monitorId ? { ...m, channel } : m)),
    }));
  }, []);

  const handleSelectStock = useCallback((monitorId: number, symbol: string) => {
    setGameState((prev) => ({
      ...prev,
      monitors: prev.monitors.map((m) => (m.id === monitorId ? { ...m, selectedStock: symbol } : m)),
    }));
  }, []);

  const handleBuy = useCallback((symbol: string, shares: number) => setGameState((prev) => buyStock(prev, symbol, shares)), []);
  const handleSell = useCallback((symbol: string, shares: number) => setGameState((prev) => sellStock(prev, symbol, shares)), []);
  const handleShort = useCallback((symbol: string, shares: number) => setGameState((prev) => shortStock(prev, symbol, shares)), []);
  const handleCover = useCallback((symbol: string, shares: number) => setGameState((prev) => coverShort(prev, symbol, shares)), []);
  const handleTogglePin = useCallback((symbol: string) => setGameState((prev) => togglePinStock(prev, symbol)), []);
  const handleToggleStopLoss = useCallback(() => setGameState((prev) => ({ ...prev, stopLossEnabled: !prev.stopLossEnabled })), []);
  const handlePlaceOrder = useCallback((symbol: string, side: OrderSide, shares: number, orderType: OrderType, limitPrice?: number, stopPrice?: number) => {
    setGameState((prev) => placeOrder(prev, symbol, side, shares, orderType, limitPrice, stopPrice));
  }, []);
  const handleCancelOrder = useCallback((orderId: string) => setGameState((prev) => cancelOrder(prev, orderId)), []);
  const handleBuyOption = useCallback((symbol: string, type: "call" | "put", strike: number, days: number, contracts: number) => {
    setGameState((prev) => buyOption(prev, symbol, type, strike, days, contracts));
  }, []);
  const handleSellOption = useCallback((symbol: string, type: "call" | "put", strike: number, days: number, contracts: number) => {
    setGameState((prev) => sellOption(prev, symbol, type, strike, days, contracts));
  }, []);
  const handleCloseOption = useCallback((optionId: string) => {
    setGameState((prev) => closeOption(prev, optionId));
  }, []);

  const handleNewDay = useCallback(() => {
    if (gameState.upgradeDraftOptions.length > 0) setEodPhase("upgrades");
    else if (gameState.stockDraftOptions.length > 0) setEodPhase("stocks");
    else setGameState((prev) => openMarket(prev));
  }, [gameState.stockDraftOptions.length, gameState.upgradeDraftOptions.length]);

  const handleAcquireUpgrade = useCallback((upgradeId: string) => {
    setGameState((prev) => acquireUpgrade(prev, upgradeId));
    if (gameState.stockDraftOptions.length > 0) setEodPhase("stocks");
    else {
      setGameState((prev) => openMarket(prev));
      setEodPhase("summary");
    }
  }, [gameState.stockDraftOptions.length]);

  const handleDraftStock = useCallback((symbol: string) => {
    setGameState((prev) => openMarket(draftStock(prev, symbol)));
    setEodPhase("summary");
  }, []);

  const handleViewInsider = useCallback(() => {
    setGameState((prev) => {
      if (prev.insiderViewed) return prev;
      return {
        ...prev,
        insiderViewed: true,
        insiderViewedTick: prev.timeOfDay,
        insiderSnapshotHoldings: prev.portfolio.map((p) => ({ symbol: p.symbol, shares: p.shares, avgCost: p.avgCost })),
        insiderSnapshotShorts: prev.shorts.map((p) => ({ symbol: p.symbol, shares: p.shares, entryPrice: p.entryPrice })),
      };
    });
  }, []);

  const handleRestart = useCallback(() => {
    setGameState(createInitialState());
    setShowTitle(true);
    setEodPhase("summary");
  }, []);

  const formatMarketTime = (pct: number): string => {
    const startMinutes = 570;
    const endMinutes = 960;
    const totalMinutes = startMinutes + (pct / 100) * (endMinutes - startMinutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.floor(totalMinutes % 60);
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHour = hours > 12 ? hours - 12 : hours;
    return `${displayHour}:${mins.toString().padStart(2, "0")} ${ampm}`;
  };

  const hasBloomberg = hasUpgrade(gameState, "bloomberg");
  const showAnalystRating = hasUpgrade(gameState, "analyst_ratings");
  const showDarkPool = hasUpgrade(gameState, "dark_pool");

  if (showTitle) {
    return (
      <div className="title-screen">
        <img src={titleScreen} alt="Day Trader" className="title-screen-bg" />
        <div className="title-screen-overlay">
          <button className="title-start-btn" onClick={() => setShowTitle(false)}>START TRADING</button>
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
            <div className="time-fill" style={{ width: `${gameState.timeOfDay}%` }} />
            <span className="time-label">{paused ? "⏸ PAUSED" : gameState.marketOpen ? `Day ${gameState.day} — ${formatMarketTime(gameState.timeOfDay)}` : "Market Closed"}</span>
          </div>
          <div className="speed-controls">
            <button className={speed === 1 ? "active" : ""} onClick={() => setSpeed(1)}>1x</button>
            <button className={speed === 2 ? "active" : ""} onClick={() => setSpeed(2)}>2x</button>
            <button className={speed === 5 ? "active" : ""} onClick={() => setSpeed(5)}>5x</button>
          </div>
        </div>
      </header>

      {paused && (
        <div className="pause-overlay">
          <div className="pause-menu">
            <h2>⏸ Paused</h2>
            <button className="pause-menu-btn resume" onClick={() => setPaused(false)}>Resume</button>
            <button className="pause-menu-btn restart" onClick={() => { setPaused(false); handleRestart(); }}>Start Over</button>
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

      {!gameState.marketOpen && !gameState.gameOver && eodPhase === "summary" && (() => {
        const ranked = [...gameState.stocks].map((s) => ({ ...s, change: s.price - s.openPrice, changePct: ((s.price - s.openPrice) / s.openPrice) * 100 })).sort((a, b) => b.changePct - a.changePct);
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
        const shortCollateral = gameState.shorts.reduce((sum, pos) => sum + pos.entryPrice * pos.shares, 0);
        const optionsVal = getOptionsValue(gameState);
        const currentNetWorth = gameState.cash + portfolioValue + shortCollateral - shortLiability + optionsVal;
        const dailyPnL = currentNetWorth - gameState.dayStartNetWorth;
        const completedDay = gameState.day - 1;
        const milestone = completedDay % 3 === 0 ? getMilestone(completedDay) : null;

        return (
          <div className="end-of-day-overlay">
            <div className="end-of-day">
              <h2>📋 End of Day {completedDay}</h2>
              <div className="eod-pnl-hero">
                <span className="eod-pnl-label">Today's P&L</span>
                <span className={`eod-pnl-value ${dailyPnL >= 0 ? "up" : "down"}`}>{dailyPnL >= 0 ? "+$" : "-$"}{Math.abs(dailyPnL).toFixed(2)}</span>
              </div>
              <div className="eod-stats">
                <div className="eod-stat-row"><span>Net worth</span><span>${currentNetWorth.toFixed(2)}</span></div>
                <div className="eod-stat-row"><span>Cash</span><span>${gameState.cash.toFixed(2)}</span></div>
                <div className="eod-stat-row"><span>Portfolio value</span><span>${portfolioValue.toFixed(2)}</span></div>
                {gameState.goldenParachutes > 0 && <div className="eod-stat-row"><span>Golden Parachutes</span><span>{gameState.goldenParachutes}</span></div>}
              </div>
              {milestone && (
                <div className={`milestone-check ${currentNetWorth >= milestone.required ? "passed" : "failed"}`}>
                  <div className="milestone-header">{currentNetWorth >= milestone.required ? "✅ Milestone Passed!" : "❌ Milestone Failed!"}</div>
                  <div className="milestone-body">Required: ${milestone.required.toLocaleString()} — Your net worth: ${currentNetWorth.toFixed(2)}</div>
                </div>
              )}
              <div className="eod-movers">
                <div className="eod-column">
                  <h3 className="eod-winners-title">📈 Winners</h3>
                  {winners.length === 0 && <span className="eod-none">None</span>}
                  {winners.map((s) => <div key={s.symbol} className="eod-mover-row"><span className="eod-symbol">{s.symbol}</span><span className="eod-price">${s.price.toFixed(2)}</span><span className="eod-change up">+${s.change.toFixed(2)} (+{s.changePct.toFixed(1)}%)</span></div>)}
                </div>
                <div className="eod-column">
                  <h3 className="eod-losers-title">📉 Losers</h3>
                  {losers.length === 0 && <span className="eod-none">None</span>}
                  {losers.map((s) => <div key={s.symbol} className="eod-mover-row"><span className="eod-symbol">{s.symbol}</span><span className="eod-price">${s.price.toFixed(2)}</span><span className="eod-change down">-${Math.abs(s.change).toFixed(2)} ({s.changePct.toFixed(1)}%)</span></div>)}
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
              <button onClick={handleNewDay}>Continue →</button>
            </div>
          </div>
        );
      })()}

      {!gameState.marketOpen && !gameState.gameOver && eodPhase === "upgrades" && (
        <div className="end-of-day-overlay">
          <div className="upgrade-draft">
            <h2>⬆️ Choose an Upgrade</h2>
            <p className="upgrade-draft-sub">Pick one upgrade to keep for the rest of the run</p>
            <div className="upgrade-draft-options">
              {gameState.upgradeDraftOptions.map((id) => {
                const card = UPGRADE_POOL.find((u) => u.id === id);
                if (!card) return null;
                const owned = upgradeCount(gameState, id);
                return (
                  <button key={id} className="upgrade-draft-card" onClick={() => handleAcquireUpgrade(id)}>
                    <div className="upgrade-card-icon">{card.icon}</div>
                    <div className="upgrade-card-name">{card.name}</div>
                    <div className="upgrade-card-desc">{card.description}</div>
                    <div className="upgrade-card-category">{card.category}</div>
                    {owned > 0 && <div className="upgrade-card-owned">Owned: {owned}/{card.maxStacks}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!gameState.marketOpen && !gameState.gameOver && eodPhase === "stocks" && (
        <div className="end-of-day-overlay">
          <div className="stock-draft">
            <h2>📊 New Stock Available</h2>
            <p className="stock-draft-sub">Choose a company to add to the market for Day {gameState.day}</p>
            <div className="stock-draft-options">
              {gameState.stockDraftOptions.map((stock) => (
                <button key={stock.symbol} className="stock-draft-card" onClick={() => handleDraftStock(stock.symbol)}>
                  <div className="draft-card-symbol">{stock.symbol}</div>
                  <div className="draft-card-name">{stock.name}</div>
                  <div className="draft-card-price">${stock.price.toFixed(2)}</div>
                  <div className="draft-card-tags">{stock.tags.map((tag) => <span key={tag} className="stock-tag">{tag}</span>)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="main-layout">
        <div className="monitors-area">
          {gameState.monitors.map((monitor) => (
            <Monitor
              key={monitor.id}
              monitor={monitor}
              gameState={gameState}
              debugMode={debugMode}
              paused={paused}
              hasBloomberg={hasBloomberg}
              showAnalystRating={showAnalystRating}
              showDarkPool={showDarkPool}
              onChangeChannel={handleChangeChannel}
              onSelectStock={handleSelectStock}
              onViewInsider={handleViewInsider}
              onBuy={handleBuy}
              onSell={handleSell}
              onShort={handleShort}
              onCover={handleCover}
            />
          ))}
        </div>
        <aside className="sidebar-area">
          <OrdersPanel gameState={gameState} open={ordersOpen} onClose={() => setOrdersOpen(false)} onPlaceOrder={handlePlaceOrder} onCancelOrder={handleCancelOrder} onBuyOption={handleBuyOption} onSellOption={handleSellOption} onCloseOption={handleCloseOption} />
          <button className={`orders-tab-strip ${ordersOpen ? "active" : ""}`} onClick={() => setOrdersOpen((o) => !o)} title="Custom Orders">
            <span className="orders-tab-icon">📋</span>
            <span className="orders-tab-label">O R D E R S</span>
            {(gameState.pendingOrders.length + gameState.optionsPositions.length) > 0 && <span className="orders-tab-badge">{gameState.pendingOrders.length + gameState.optionsPositions.length}</span>}
          </button>
          <div className="sidebar">
            <TradingPanel gameState={gameState} onBuy={handleBuy} onSell={handleSell} onShort={handleShort} onCover={handleCover} onTogglePin={handleTogglePin} onToggleStopLoss={handleToggleStopLoss} />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
