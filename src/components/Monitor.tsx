import { useState, useEffect, useRef, useMemo } from "react";
import { Monitor as MonitorType, MonitorChannel, GameState, NewsItem } from "../game/types";
import { getBuyingPower } from "../game/engine";
import { StockChart } from "./StockChart";
import { NewsFeed, InsiderFeed } from "./NewsFeed";

interface MonitorProps {
  monitor: MonitorType;
  gameState: GameState;
  debugMode: boolean;
  paused: boolean;
  hasBloomberg?: boolean;
  showAnalystRating?: boolean;
  showDarkPool?: boolean;
  onChangeChannel: (monitorId: number, channel: MonitorChannel) => void;
  onSelectStock: (monitorId: number, symbol: string) => void;
  onViewInsider: () => void;
  onBuy: (symbol: string, shares: number) => void;
  onSell: (symbol: string, shares: number) => void;
  onShort: (symbol: string, shares: number) => void;
  onCover: (symbol: string, shares: number) => void;
}

const CHANNEL_LABELS: Record<MonitorChannel, string> = { business_news: "📊 Biz News", global_news: "🌍 Global", social_media: "💬 Social", stock_ticker: "📈 Stocks", insider: "🤫 Insider" };

function getAnalystRating(symbol: string, stockTags: string[], news: NewsItem[]): "bullish" | "bearish" | "neutral" { let bullish = 0; let bearish = 0; for (const item of news) { if (!item.impact || item.impact.ticksRemaining <= 0 || item.impact.ticksRemaining > item.impact.duration) continue; for (const effect of item.impact.effects) { const matches = effect.symbol ? effect.symbol === symbol : effect.tag ? stockTags.includes(effect.tag) : false; if (!matches) continue; if (effect.direction === "up") bullish += 1; else bearish += 1; } } if (bullish > bearish) return "bullish"; if (bearish > bullish) return "bearish"; return "neutral"; }

export function Monitor({ monitor, gameState, debugMode, paused, hasBloomberg, showAnalystRating, showDarkPool, onChangeChannel, onSelectStock, onViewInsider, onBuy, onSell, onShort, onCover }: MonitorProps) {
  const channels: MonitorChannel[] = ["stock_ticker", "business_news", "global_news", "social_media", "insider"];
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (monitor.channel === "stock_ticker" && searchRef.current) searchRef.current.focus(); if (monitor.channel !== "stock_ticker") setSearchQuery(""); }, [monitor.channel]);
  const filteredStocks = gameState.stocks.filter((s) => s.symbol.toLowerCase().startsWith(searchQuery.toLowerCase()));
  useEffect(() => { if (monitor.channel !== "stock_ticker" || filteredStocks.length === 0) return; const currentVisible = filteredStocks.some((s) => s.symbol === monitor.selectedStock); if (!currentVisible) onSelectStock(monitor.id, filteredStocks[0].symbol); }, [searchQuery, filteredStocks, monitor.channel, monitor.selectedStock, monitor.id, onSelectStock]);
  const selectedStock = useMemo(() => gameState.stocks.find((s) => s.symbol === monitor.selectedStock), [gameState.stocks, monitor.selectedStock]);
  const analystRating = selectedStock && showAnalystRating ? getAnalystRating(selectedStock.symbol, selectedStock.tags, gameState.news) : undefined;
  const buyingPower = getBuyingPower(gameState);

  return <div className="monitor"><div className="monitor-bezel"><div className="monitor-screen"><div className="monitor-content">{monitor.channel === "stock_ticker" && <div className="stock-ticker-view"><div className="stock-search-bar"><span className="stock-search-icon">🔍</span><input ref={searchRef} type="text" className="stock-search-input" placeholder="Search ticker..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value.replace(/[0-9]/g, ""))} onKeyDown={(e) => { if (/^[1-9]$/.test(e.key)) e.currentTarget.blur(); }} />{searchQuery && <button className="stock-search-clear" onClick={() => setSearchQuery("")}>✕</button>}</div><div className="stock-selector">{filteredStocks.map((stock) => <button key={stock.symbol} className={`stock-tab ${monitor.selectedStock === stock.symbol ? "active" : ""}`} onClick={() => onSelectStock(monitor.id, stock.symbol)}>{stock.symbol}</button>)}{filteredStocks.length === 0 && <span className="stock-search-empty">No matches</span>}</div>{showDarkPool && gameState.institutionalOrders.length > 0 && <div className="institutional-orders-overlay"><div className="institutional-orders-title">🏦 Dark Pool Tape</div>{gameState.institutionalOrders.map((order, index) => <div key={`${order.firm}-${order.symbol}-${index}`} className={`institutional-order ${order.side}`}><span>{order.firm}</span><span>{order.side === "buy" ? "BUY" : "SELL"} {order.symbol}</span><span>{order.shares.toLocaleString()}</span></div>)}</div>}{selectedStock && filteredStocks.some((s) => s.symbol === selectedStock.symbol) && <StockChart stock={selectedStock} totalTicks={100} buyingPower={buyingPower} analystRating={analystRating} position={gameState.portfolio.find((p) => p.symbol === selectedStock.symbol)} shortPosition={gameState.shorts.find((s) => s.symbol === selectedStock.symbol)} onBuy={onBuy} onSell={onSell} onShort={onShort} onCover={onCover} />}</div>}{monitor.channel === "business_news" && <NewsFeed news={gameState.news} category="business" debugMode={debugMode} paused={paused} hasBloomberg={hasBloomberg} />}{monitor.channel === "global_news" && <NewsFeed news={gameState.news} category="global" debugMode={debugMode} paused={paused} hasBloomberg={hasBloomberg} />}{monitor.channel === "social_media" && <NewsFeed news={gameState.news} category="social" debugMode={debugMode} paused={paused} />}{monitor.channel === "insider" && <InsiderFeed tip={gameState.insiderTip} tip2={gameState.insiderTip2} viewed={gameState.insiderViewed} onView={onViewInsider} debugMode={debugMode} />}</div></div><div className="monitor-controls">{channels.map((ch) => <button key={ch} className={`channel-btn ${monitor.channel === ch ? "active" : ""}`} onClick={() => onChangeChannel(monitor.id, ch)}>{CHANNEL_LABELS[ch]}</button>)}</div></div></div>;
}
