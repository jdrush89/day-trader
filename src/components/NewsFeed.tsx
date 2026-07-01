import { NewsItem } from "../game/types";

interface NewsFeedProps {
  news: NewsItem[];
  category: "business" | "global" | "social";
}

function BusinessNewsView({ news }: { news: NewsItem[] }) {
  const latest = news.find((n) => n.category === "business");

  if (!latest) {
    return (
      <div className="biz-news-view">
        <div className="biz-header">
          <span className="biz-logo">📊 MARKET WATCH</span>
          <span className="biz-live">● LIVE</span>
        </div>
        <div className="biz-waiting">
          <div className="biz-standby">STANDING BY FOR EARNINGS REPORT...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="biz-news-view">
      <div className="biz-header">
        <span className="biz-logo">📊 MARKET WATCH</span>
        <span className="biz-live">● LIVE</span>
      </div>
      <div className={`biz-banner sentiment-${latest.sentiment}`}>
        {latest.headline}
      </div>
      <div className="biz-body">{latest.body}</div>
      {latest.earnings && (
        <div className="biz-earnings">
          <div className="earnings-title">QUARTERLY RESULTS</div>
          <div className="earnings-grid">
            <div className="earnings-stat">
              <span className="earnings-label">Revenue</span>
              <span className="earnings-value">{latest.earnings.revenue}</span>
            </div>
            <div className="earnings-stat">
              <span className="earnings-label">Net Profit</span>
              <span className="earnings-value">{latest.earnings.profit}</span>
            </div>
            <div className="earnings-stat">
              <span className="earnings-label">Growth</span>
              <span className="earnings-value">{latest.earnings.growth}</span>
            </div>
            <div className="earnings-stat">
              <span className="earnings-label">Spending</span>
              <span className="earnings-value">{latest.earnings.spending}</span>
            </div>
            <div className="earnings-stat full-width">
              <span className="earnings-label">Guidance</span>
              <span className="earnings-value">{latest.earnings.guidance}</span>
            </div>
          </div>
        </div>
      )}
      {latest.affectedStocks && (
        <div className="biz-ticker-tag">${latest.affectedStocks[0]}</div>
      )}
    </div>
  );
}

function GlobalNewsView({ news }: { news: NewsItem[] }) {
  const headlines = news.filter((n) => n.category === "global");
  const latest = headlines[0];

  return (
    <div className="global-news-view">
      <div className="global-header">
        <span className="global-logo">🌍 WORLD NEWS NETWORK</span>
        <span className="global-live">● LIVE</span>
      </div>
      {latest ? (
        <div className="global-main">
          <div className={`global-breaking sentiment-${latest.sentiment}`}>
            BREAKING NEWS
          </div>
          <div className="global-headline">{latest.headline}</div>
        </div>
      ) : (
        <div className="global-main">
          <div className="global-standby">NO ACTIVE ALERTS</div>
        </div>
      )}
      <div className="global-ticker-bar">
        <div className="global-ticker-content">
          {headlines.length > 0
            ? headlines.map((h) => h.headline).join("  ///  ")
            : "Monitoring global events..."}
        </div>
      </div>
    </div>
  );
}

function formatUpvotes(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function SocialFeedView({ news }: { news: NewsItem[] }) {
  // Sort by upvotes descending — this is the front page ranking
  const posts = news
    .filter((n) => n.category === "social")
    .sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0));

  return (
    <div className="social-feed-view">
      <div className="social-header">
        <span className="social-logo">💬 r/WallStreetYOLOs</span>
        <div className="social-tabs">
          <span className="social-tab active">🔥 Hot</span>
          <span className="social-tab">🆕 New</span>
          <span className="social-tab">📈 Rising</span>
        </div>
      </div>
      <div className="social-post-list">
        {posts.length === 0 && (
          <div className="social-empty">Nothing trending yet... check back soon</div>
        )}
        {posts.map((post, index) => {
          const isViral = (post.upvotes ?? 0) > 500;
          const isMega = (post.upvotes ?? 0) > 2000;
          return (
            <div
              key={post.id}
              className={`social-post-row ${isMega ? "mega-viral" : isViral ? "viral" : ""}`}
            >
              <div className="social-rank">#{index + 1}</div>
              <div className="social-vote-col">
                <span className="vote-arrow">▲</span>
                <span className={`vote-count ${isViral ? "vote-hot" : ""}`}>
                  {formatUpvotes(post.upvotes ?? 0)}
                </span>
                <span className="vote-arrow dim">▼</span>
              </div>
              <div className="social-post-content">
                <div className="social-post-title">
                  {post.headline}
                  {post.affectedStocks && (
                    <span className="ticker-tag">${post.affectedStocks[0]}</span>
                  )}
                  {isViral && <span className="viral-badge">{isMega ? "🔥 VIRAL" : "📈 Rising"}</span>}
                </div>
                <div className="social-post-body">{post.body}</div>
                <div className="social-post-meta">
                  <span className="social-author">u/{post.author || "anonymous"}</span>
                  <span className={`social-flair sentiment-${post.sentiment}`}>
                    {post.sentiment === "positive" ? "🚀 Bullish" : "🐻 Bearish"}
                  </span>
                  <span className="social-comments">💬 {post.commentCount ?? 0}</span>
                  <span className="social-share">↗ Share</span>
                  <span className="social-awards">
                    {(post.upvotes ?? 0) > 1000 && "🏆"}
                    {(post.upvotes ?? 0) > 500 && "💎"}
                    {(post.upvotes ?? 0) > 100 && "🥈"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NewsFeed({ news, category }: NewsFeedProps) {
  if (category === "business") return <BusinessNewsView news={news} />;
  if (category === "global") return <GlobalNewsView news={news} />;
  return <SocialFeedView news={news} />;
}
