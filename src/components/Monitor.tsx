import { Monitor as MonitorType, MonitorChannel, GameState } from "../game/types";
import { StockChart } from "./StockChart";
import { NewsFeed } from "./NewsFeed";

interface MonitorProps {
  monitor: MonitorType;
  gameState: GameState;
  debugMode: boolean;
  onChangeChannel: (monitorId: number, channel: MonitorChannel) => void;
  onSelectStock: (monitorId: number, symbol: string) => void;
}

const CHANNEL_LABELS: Record<MonitorChannel, string> = {
  business_news: "📊 Biz News",
  global_news: "🌍 Global",
  social_media: "💬 Social",
  stock_ticker: "📈 Stocks",
};

export function Monitor({ monitor, gameState, debugMode, onChangeChannel, onSelectStock }: MonitorProps) {
  const channels: MonitorChannel[] = ["stock_ticker", "business_news", "global_news", "social_media"];

  return (
    <div className="monitor">
      <div className="monitor-bezel">
        <div className="monitor-screen">
          <div className="monitor-content">
            {monitor.channel === "stock_ticker" && (
              <div className="stock-ticker-view">
                <div className="stock-selector">
                  {gameState.stocks.map((stock) => (
                    <button
                      key={stock.symbol}
                      className={`stock-tab ${monitor.selectedStock === stock.symbol ? "active" : ""}`}
                      onClick={() => onSelectStock(monitor.id, stock.symbol)}
                    >
                      {stock.symbol}
                    </button>
                  ))}
                </div>
                {monitor.selectedStock && (
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
