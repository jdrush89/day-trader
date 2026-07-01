import { NewsItem } from "../game/types";

interface NewsFeedProps {
  news: NewsItem[];
  category: "business" | "global" | "social";
}

export function NewsFeed({ news, category }: NewsFeedProps) {
  const filtered = news.filter((n) => n.category === category);

  const categoryLabels = {
    business: "📊 Business News",
    global: "🌍 Global News",
    social: "💬 Social Feed",
  };

  return (
    <div className="news-feed">
      <div className="news-feed-header">{categoryLabels[category]}</div>
      <div className="news-feed-items">
        {filtered.length === 0 && (
          <div className="news-empty">Waiting for news...</div>
        )}
        {filtered.map((item) => (
          <div key={item.id} className={`news-item sentiment-${item.sentiment}`}>
            <span className="news-headline">{item.headline}</span>
            {item.affectedStocks && (
              <span className="news-tickers">
                {item.affectedStocks.map((s) => (
                  <span key={s} className="ticker-tag">${s}</span>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
