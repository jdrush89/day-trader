import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Monitor as MonitorType, MonitorChannel, GameState, NewsItem } from "../game/types";
import { getBuyingPower, getInsiderProfitInfo } from "../game/engine";
import { getConsumable, getPhaseItems } from "../game/consumables";
import { StockChart } from "./StockChart";
import { NewsFeed, InsiderFeed } from "./NewsFeed";
import { characterScale, type CharacterSelection } from "../game/characters";

interface MonitorProps {
  monitor: MonitorType;
  monitorIndex: number;
  isActive: boolean;
  totalMonitors: number;
  gameState: GameState;
  paused: boolean;
  showAnalystRating?: boolean;
  showDarkPool?: boolean;
  onChangeChannel: (monitorId: number, channel: MonitorChannel) => void;
  onSelectStock: (monitorId: number, symbol: string) => void;
  onViewInsider: () => void;
  onBuy: (symbol: string, shares: number) => void;
  onSell: (symbol: string, shares: number) => void;
  onShort: (symbol: string, shares: number) => void;
  onCover: (symbol: string, shares: number) => void;
  onUseItem?: (itemId: string) => void;
  character: CharacterSelection;
  playerId: string;
  onAddAiStrategy: (sourceId: string, symbol: string, direction: "up" | "down") => void;
  onSetAiRisk: (strategyId: string, risk: number) => void;
  onClearAiStrategy: (strategyId: string) => void;
}

const CHANNEL_LABELS: Record<MonitorChannel, string> = { business_news: "📊 Biz News", global_news: "🌍 Global", social_media: "💬 Social", stock_ticker: "📈 Stocks", insider: "🤫 Insider", items: "🎒 Items", ai: "🤖 AI" };

function getAnalystRating(symbol: string, stockTags: string[], news: NewsItem[]): "bullish" | "bearish" | "neutral" { let bullish = 0; let bearish = 0; for (const item of news) { if (!item.impact || item.impact.ticksRemaining <= 0 || item.impact.ticksRemaining > item.impact.duration) continue; for (const effect of item.impact.effects) { const matches = effect.symbol ? effect.symbol === symbol : effect.tag ? stockTags.includes(effect.tag) : false; if (!matches) continue; if (effect.direction === "up") bullish += 1; else bearish += 1; } } if (bullish > bearish) return "bullish"; if (bearish > bullish) return "bearish"; return "neutral"; }

export function Monitor({ monitor, monitorIndex, isActive, totalMonitors, gameState, paused, showAnalystRating, showDarkPool, onChangeChannel, onSelectStock, onViewInsider, onBuy, onSell, onShort, onCover, onUseItem, character, playerId, onAddAiStrategy, onSetAiRisk, onClearAiStrategy }: MonitorProps) {
  const channels: MonitorChannel[] = ["stock_ticker", "business_news", "global_news", "social_media", "insider", ...(character.id === "josh" ? ["ai" as const] : []), "items"];
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const stockTabsRef = useRef<HTMLDivElement>(null);
  const tradeButtonsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (monitor.channel === "stock_ticker" && searchRef.current) searchRef.current.focus(); if (monitor.channel !== "stock_ticker") setSearchQuery(""); }, [monitor.channel]);

  const filteredStocks = gameState.stocks.filter((s) => {
    const q = searchQuery.toLowerCase();
    return s.symbol.toLowerCase().startsWith(q) || s.tags.some((t) => t.toLowerCase().startsWith(q));
  });

  useEffect(() => { if (monitor.channel !== "stock_ticker" || filteredStocks.length === 0) return; const currentVisible = filteredStocks.some((s) => s.symbol === monitor.selectedStock); if (!currentVisible) onSelectStock(monitor.id, filteredStocks[0].symbol); }, [searchQuery, filteredStocks, monitor.channel, monitor.selectedStock, monitor.id, onSelectStock]);

  const selectedStock = useMemo(() => gameState.stocks.find((s) => s.symbol === monitor.selectedStock), [gameState.stocks, monitor.selectedStock]);
  const analystRating = selectedStock && showAnalystRating ? getAnalystRating(selectedStock.symbol, selectedStock.tags, gameState.news) : undefined;
  const buyingPower = getBuyingPower(gameState);
  const insiderProfitInfo = useMemo(() => getInsiderProfitInfo(gameState), [gameState]);
  const marketDuration = gameState.playerCharacters && Object.values(gameState.playerCharacters).some((entry) => entry.id === "zack")
    ? Math.round(100 * characterScale(Math.max(...Object.values(gameState.playerCharacters).filter((entry) => entry.id === "zack").map((entry) => entry.level)), 1.25, 0.1, 2.5))
    : character.id === "zack" ? Math.round(100 * characterScale(character.level, 1.25, 0.1, 2.5)) : 100;
  const paulLevels = Object.values(gameState.playerCharacters ?? {}).filter((entry) => entry.id === "paul").map((entry) => entry.level);
  if (character.id === "paul") paulLevels.push(character.level);
  const paulBonus = paulLevels.length > 0 ? characterScale(Math.max(...paulLevels), 0.05, 0.02, 0.25) : 0;
  const zackPenalty = character.id === "zack" ? (gameState.timeOfDay / marketDuration) * 0.35 : 0;
  const dinkyRange = selectedStock && character.id === "dinky" ? (() => {
    const history = selectedStock.history;
    const recentMove = history.length > 4 ? (history[history.length - 1] - history[history.length - 5]) / 4 : 0;
    const projected = Math.max(0.01, selectedStock.price + recentMove * Math.max(1, marketDuration - gameState.timeOfDay));
    const spread = Math.max(0.03, 0.18 - (character.level - 1) * 0.015);
    return { low: projected * (1 - spread), high: projected * (1 + spread) };
  })() : undefined;

  // Focus a stock tab button by symbol
  const focusStockTab = useCallback((symbol: string) => {
    if (!stockTabsRef.current) return;
    const btn = stockTabsRef.current.querySelector(`[data-symbol="${symbol}"]`) as HTMLButtonElement | null;
    btn?.focus();
  }, []);

  // Focus the first enabled trade button
  const focusTradeButton = useCallback((which?: string) => {
    if (!tradeButtonsRef.current) return;
    if (which) {
      const btn = tradeButtonsRef.current.querySelector(`[data-action="${which}"]`) as HTMLButtonElement | null;
      if (btn && !btn.disabled) { btn.focus(); return; }
    }
    const btns = tradeButtonsRef.current.querySelectorAll("button:not(:disabled)") as NodeListOf<HTMLButtonElement>;
    if (btns.length > 0) btns[0].focus();
  }, []);

  // Search bar keyboard handler
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (/^[1-9]$/.test(e.key)) {
      e.currentTarget.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (monitor.selectedStock) focusStockTab(monitor.selectedStock);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      focusTradeButton();
    }
  }, [monitor.selectedStock, focusStockTab, focusTradeButton]);

  // Stock tab row keyboard handler
  const handleStockTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("stock-tab")) return;
    const currentSymbol = target.getAttribute("data-symbol");
    if (!currentSymbol) return;
    const currentIdx = filteredStocks.findIndex((s) => s.symbol === currentSymbol);

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIdx = (currentIdx - 1 + filteredStocks.length) % filteredStocks.length;
      const prevSymbol = filteredStocks[prevIdx].symbol;
      onSelectStock(monitor.id, prevSymbol);
      focusStockTab(prevSymbol);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextIdx = (currentIdx + 1) % filteredStocks.length;
      const nextSymbol = filteredStocks[nextIdx].symbol;
      onSelectStock(monitor.id, nextSymbol);
      focusStockTab(nextSymbol);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusTradeButton();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }, [filteredStocks, monitor.id, onSelectStock, focusStockTab, focusTradeButton]);

  // Trade buttons keyboard handler
  const handleTradeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "BUTTON") return;

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const btns = Array.from(
        (e.currentTarget as HTMLElement).querySelectorAll("button")
      ) as HTMLButtonElement[];
      const idx = btns.indexOf(target as HTMLButtonElement);
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      const nextIdx = (idx + dir + btns.length) % btns.length;
      btns[nextIdx].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (monitor.selectedStock) focusStockTab(monitor.selectedStock);
    }

    if (!selectedStock) return;
    const key = e.key.toLowerCase();
    if (key === "b") { e.preventDefault(); onBuy(selectedStock.symbol, 1); }
    else if (key === "s") { e.preventDefault(); onSell(selectedStock.symbol, 1); }
    else if (key === "t") { e.preventDefault(); onShort(selectedStock.symbol, 1); }
    else if (key === "c") { e.preventDefault(); onCover(selectedStock.symbol, 1); }
  }, [monitor.selectedStock, selectedStock, focusStockTab, onBuy, onSell, onShort, onCover]);

  return (
    <div className={`monitor ${isActive && totalMonitors > 1 ? "monitor-active" : ""}`}>
      <div className="monitor-bezel">
        {totalMonitors > 1 && (
          <div className={`monitor-label ${isActive ? "active" : ""}`}>
            Monitor {monitorIndex + 1} {isActive ? "●" : ""} <span className="monitor-label-hint">Shift+{monitorIndex + 1}</span>
          </div>
        )}
        <div className="monitor-screen">
          <div className="monitor-content">
            {monitor.channel === "stock_ticker" && (
              <div className="stock-ticker-view">
                <div className="stock-search-bar">
                  <span className="stock-search-icon">🔍</span>
                  <input
                    ref={searchRef}
                    type="text"
                    className="stock-search-input"
                    placeholder="Search ticker... (↓ navigate, Enter → trade)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.replace(/[0-9]/g, ""))}
                    onKeyDown={handleSearchKeyDown}
                  />
                  {searchQuery && <button className="stock-search-clear" onClick={() => setSearchQuery("")}>✕</button>}
                </div>
                <div
                  className="stock-selector"
                  ref={stockTabsRef}
                  onKeyDown={handleStockTabKeyDown}
                >
                  {filteredStocks.map((stock) => (
                    <button
                      key={stock.symbol}
                      data-symbol={stock.symbol}
                      className={`stock-tab ${monitor.selectedStock === stock.symbol ? "active" : ""}`}
                      onClick={() => onSelectStock(monitor.id, stock.symbol)}
                      tabIndex={monitor.selectedStock === stock.symbol ? 0 : -1}
                    >
                      {stock.symbol}
                    </button>
                  ))}
                  {filteredStocks.length === 0 && <span className="stock-search-empty">No matches</span>}
                </div>
                {showDarkPool && gameState.institutionalOrders.length > 0 && (
                  <div className="institutional-orders-overlay">
                    <div className="institutional-orders-title">🏦 Dark Pool Tape</div>
                    {gameState.institutionalOrders.map((order, index) => (
                      <div key={`${order.firm}-${order.symbol}-${index}`} className={`institutional-order ${order.side}`}>
                        <span>{order.firm}</span>
                        <span>{order.side === "buy" ? "BUY" : "SELL"} {order.symbol}</span>
                        <span>{order.shares.toLocaleString()} shr</span>
                      </div>
                    ))}
                    {(
                      <div className="debug-impact active" style={{ marginTop: 6 }}>
                        <span className="debug-label">🔍</span>
                        <span className="debug-desc">
                          Dark pool orders are intel only — they signal institutional sentiment but don't directly move prices. Use as a leading indicator for your own trades.
                          {" "}Net flow: {(() => {
                            const bySymbol: Record<string, number> = {};
                            for (const o of gameState.institutionalOrders) {
                              bySymbol[o.symbol] = (bySymbol[o.symbol] || 0) + (o.side === "buy" ? o.shares : -o.shares);
                            }
                            return Object.entries(bySymbol).map(([sym, net]) =>
                              `${sym}: ${net > 0 ? "+" : ""}${net.toLocaleString()} (${net > 0 ? "bullish" : "bearish"})`
                            ).join(", ");
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {selectedStock && filteredStocks.some((s) => s.symbol === selectedStock.symbol) && (
                  <StockChart
                    stock={selectedStock}
                    totalTicks={marketDuration}
                    buyingPower={buyingPower}
                    analystRating={analystRating}
                    position={gameState.portfolio.find((p) => p.symbol === selectedStock.symbol)}
                    shortPosition={gameState.shorts.find((s) => s.symbol === selectedStock.symbol)}
                    onBuy={onBuy}
                    onSell={onSell}
                    onShort={onShort}
                    onCover={onCover}
                    tradeButtonsRef={tradeButtonsRef}
                    onTradeKeyDown={handleTradeKeyDown}
                    forecastRange={dinkyRange}
                    sight={character.id === "ian" ? gameState.ianSight : null}
                  />
                )}
              </div>
            )}
            {monitor.channel === "business_news" && <NewsFeed news={gameState.news} category="business" paused={paused} probabilityAdjustment={paulBonus - zackPenalty} onAddAiStrategy={character.id === "josh" ? onAddAiStrategy : undefined} aiStrategySourceIds={gameState.aiStrategies.filter((strategy) => strategy.ownerId === playerId).map((strategy) => strategy.sourceId)} />}
            {monitor.channel === "global_news" && <NewsFeed news={gameState.news} category="global" paused={paused} probabilityAdjustment={paulBonus - zackPenalty} onAddAiStrategy={character.id === "josh" ? onAddAiStrategy : undefined} aiStrategySourceIds={gameState.aiStrategies.filter((strategy) => strategy.ownerId === playerId).map((strategy) => strategy.sourceId)} />}
            {monitor.channel === "social_media" && <NewsFeed news={gameState.news} category="social" paused={paused} probabilityAdjustment={paulBonus - zackPenalty} onAddAiStrategy={character.id === "josh" ? onAddAiStrategy : undefined} aiStrategySourceIds={gameState.aiStrategies.filter((strategy) => strategy.ownerId === playerId).map((strategy) => strategy.sourceId)} />}
            {monitor.channel === "insider" && <InsiderFeed tip={gameState.insiderTip} tip2={gameState.insiderTip2} viewed={gameState.insiderViewed} profit={insiderProfitInfo.profit} catchChance={insiderProfitInfo.catchChance} onView={onViewInsider} probabilityAdjustment={paulBonus - zackPenalty} onAddAiStrategy={character.id === "josh" ? onAddAiStrategy : undefined} aiStrategySourceIds={gameState.aiStrategies.filter((strategy) => strategy.ownerId === playerId).map((strategy) => strategy.sourceId)} />}
            {monitor.channel === "items" && (() => {
              const tradingItems = getPhaseItems(gameState.consumableInventory, "trading");
              if (tradingItems.length === 0) return (
                <div className="items-channel-empty">
                  <div className="items-empty-icon">🎒</div>
                  <p>No trading items available</p>
                  <p className="items-empty-hint">Complete daily challenges to earn tickets, then visit the shop to buy consumables!</p>
                </div>
              );
              const grouped = [...new Set(tradingItems)].map((id) => ({
                id,
                item: getConsumable(id)!,
                count: tradingItems.filter((i) => i === id).length,
              }));
              return (
                <div className="items-channel">
                  <div className="items-list">
                    {grouped.map(({ id, item, count }) => (
                      <button key={id} className="item-use-btn" onClick={() => onUseItem?.(id)}>
                        <span className="item-use-icon">{item.icon}</span>
                        <div className="item-use-info">
                          <span className="item-use-name">{item.name}{count > 1 ? ` x${count}` : ""}</span>
                          <span className="item-use-desc">{item.description}</span>
                        </div>
                        <span className="item-use-action">Use</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {monitor.channel === "ai" && (
              <div className="ai-channel">
                <h3>🤖 Active Strategies</h3>
                {gameState.aiStrategies.filter((strategy) => strategy.ownerId === playerId).length === 0
                  ? <p>Add a current signal below. Strategies remain here after their source expires.</p>
                  : gameState.aiStrategies.filter((strategy) => strategy.ownerId === playerId).map((strategy) => (
                    <div key={strategy.id} className="ai-strategy-row">
                      <div><strong>{strategy.direction === "up" ? "BUY" : "SHORT"} {strategy.symbol}</strong><span>{strategy.executed ? "Position opened" : "Waiting for signal"}</span></div>
                      <label>Risk {Math.round(strategy.risk * 100)}%<input type="range" min="5" max="100" step="5" value={strategy.risk * 100} onChange={(event) => onSetAiRisk(strategy.id, Number(event.target.value) / 100)} /></label>
                      <button onClick={() => onClearAiStrategy(strategy.id)}>Clear</button>
                    </div>
                  ))}
                <h3>Available Signals</h3>
                {gameState.news.filter((item) => item.impact?.effects.some((effect) => effect.symbol)).slice(0, 10).map((item) => {
                  const effect = item.impact!.effects.find((candidate) => candidate.symbol);
                  if (!effect?.symbol) return null;
                  const added = gameState.aiStrategies.some((strategy) => strategy.ownerId === playerId && strategy.sourceId === item.id);
                  return <button key={item.id} className="ai-signal-btn" disabled={added} onClick={() => onAddAiStrategy(item.id, effect.symbol!, effect.direction)}>{added ? "✓ Added" : "Add"} {effect.direction === "up" ? "📈" : "📉"} {effect.symbol}: {item.headline || "Insider signal"}</button>;
                })}
              </div>
            )}
          </div>
        </div>
        <div className="monitor-controls">
          {channels.map((ch) => (
            <button key={ch} className={`channel-btn ${monitor.channel === ch ? "active" : ""}`} onClick={() => onChangeChannel(monitor.id, ch)}>
              {CHANNEL_LABELS[ch]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
