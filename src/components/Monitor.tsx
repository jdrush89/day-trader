import { useState, useEffect, useRef } from "react";
import { Monitor as MonitorType, MonitorChannel, GameState } from "../game/types";
import { StockChart } from "./StockChart";
import { NewsFeed, InsiderFeed } from "./NewsFeed";

interface MonitorProps {
  monitor: MonitorType;
  gameState: GameState;
  debugMode: boolean;
  onChangeChannel: (monitorId: number, channel: MonitorChannel) => void;
  onSelectStock: (monitorId: number, symbol: string) => void;
  onViewInsider: () => void;
}

const CHANNEL_LABELS: Record<MonitorChannel, string> = {
  business_news: "📊 Biz News",
  global_news: "🌍 Global",
  social_media: "💬 Social",
  stock_ticker: "📈 Stocks",
  insider: "🤫 Insider",
};

export function Monitor({ monitor, gameState, debugMode, onChangeChannel, onSelectStock, onViewInsider }: MonitorProps) {
  const channels: MonitorChannel[] = ["stock_ticker", "business_news", "global_news", "social_media", "insider"];
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus search bar when on stock ticker channel
  useEffect(() => {
    if (monitor.channel === "stock_ticker" && searchRef.current) {
      searchRef.current.focus();
    }
    if (monitor.channel !== "stock_ticker") {
      setSearchQuery("");
    }
  }, [monitor.channel]);

  // Filter stocks by prefix match
  const filteredStocks = gameState.stocks.filter((s) =>
    s.symbol.toLowerCase().startsWith(searchQuery.toLowerCase())
  );

  // If current selection is filtered out, switch to first match
  useEffect(() => {
    if (monitor.channel !== "stock_ticker" || filteredStocks.length === 0) return;
    const currentVisible = filteredStocks.some((s) => s.symbol === monitor.selectedStock);
    if (!currentVisible) {
      onSelectStock(monitor.id, filteredStocks[0].symbol);
    }
  }, [searchQuery, filteredStocks, monitor.channel, monitor.selectedStock, monitor.id, onSelectStock]);

  return (
    <div className="monitor">
      <div className="monitor-bezel">
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
                    placeholder="Search ticker..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.replace(/[0-9]/g, ""))}
                    onKeyDown={(e) => {
                      // Let number keys bubble up to the global handler for channel switching
                      if (/^[1-9]$/.test(e.key)) {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  {searchQuery && (
                    <button className="stock-search-clear" onClick={() => setSearchQuery("")}>✕</button>
                  )}
                </div>
                <div className="stock-selector">
                  {filteredStocks.map((stock) => (
                    <button
                      key={stock.symbol}
                      className={`stock-tab ${monitor.selectedStock === stock.symbol ? "active" : ""}`}
                      onClick={() => onSelectStock(monitor.id, stock.symbol)}
                    >
                      {stock.symbol}
                    </button>
                  ))}
                  {filteredStocks.length === 0 && (
                    <span className="stock-search-empty">No matches</span>
                  )}
                </div>
                {monitor.selectedStock && filteredStocks.some((s) => s.symbol === monitor.selectedStock) && (
                  <StockChart
                    stock={gameState.stocks.find((s) => s.symbol === monitor.selectedStock)!}
                  />
                )}
              </div>
            )}
            {monitor.channel === "business_news" && (
              <NewsFeed news={gameState.news} category="business" debugMode={debugMode} />
            )}
            {monitor.channel === "global_news" && (
              <NewsFeed news={gameState.news} category="global" debugMode={debugMode} />
            )}
            {monitor.channel === "social_media" && (
              <NewsFeed news={gameState.news} category="social" debugMode={debugMode} />
            )}
            {monitor.channel === "insider" && (
              <InsiderFeed
                tip={gameState.insiderTip}
                viewed={gameState.insiderViewed}
                onView={onViewInsider}
                debugMode={debugMode}
              />
            )}
          </div>
        </div>
        <div className="monitor-controls">
          {channels.map((ch) => (
            <button
              key={ch}
              className={`channel-btn ${monitor.channel === ch ? "active" : ""}`}
              onClick={() => onChangeChannel(monitor.id, ch)}
            >
              {CHANNEL_LABELS[ch]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
