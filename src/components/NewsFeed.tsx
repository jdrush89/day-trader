import { useState, useEffect } from "react";
import { NewsItem, InsiderTip } from "../game/types";

interface NewsFeedProps {
  news: NewsItem[];
  category: "business" | "global" | "social";
  paused?: boolean;
}

interface Commercial {
  symbol: string;
  company: string;
  tagline: string;
  description: string;
  emoji: string;
  color: string;
}

const COMMERCIALS: Commercial[] = [
  { symbol: "MEGA", company: "MegaCorp Industries", tagline: "Building Tomorrow. Today.™", description: "From cloud infrastructure to quantum computing, MegaCorp is the backbone of modern enterprise. 500,000 employees. 140 countries. One vision. Whether it's autonomous logistics or AI-driven analytics — if it runs, it runs on MegaCorp.", emoji: "🏢", color: "#58a6ff" },
  { symbol: "BREW", company: "BrewDog Coffee Co", tagline: "Fuel Your Grind.™", description: "Life's too short for bad coffee. BrewDog sources single-origin beans from 23 countries, roasts them in small batches, and delivers them to 8,000 cafés worldwide. Now introducing BrewDog Energy — because sleep is for closers.", emoji: "☕", color: "#c69749" },
  { symbol: "NOVA", company: "Nova Energy", tagline: "Power Without Compromise.™", description: "Nova Energy operates the world's largest network of next-gen solar farms and offshore wind installations. Powering 40 million homes and counting. Our fusion research division is on track to deliver limitless clean energy by 2035. Probably.", emoji: "⚡", color: "#00ff88" },
  { symbol: "PILL", company: "PillStack Pharma", tagline: "A Pill For Every Ill.™", description: "PillStack Pharma has 47 drugs in its pipeline and FDA approval rates that make competitors weep. From gene therapy to anti-aging supplements, we're not just extending lives — we're upgrading them. Side effects may include optimism.", emoji: "💊", color: "#ff6b9d" },
  { symbol: "BANK", company: "First National Holdings", tagline: "Your Money. Our Expertise. Our Yachts.™", description: "For over 150 years, First National has been the name in institutional finance. Wealth management, commercial lending, algorithmic trading — we do it all. With $2.3 trillion in assets under management, your portfolio is in good hands. Ours.", emoji: "🏦", color: "#ffd700" },
  { symbol: "MEME", company: "MemeTech Solutions", tagline: "Disrupting Disruption.™", description: "What do NFT-powered smart toasters, blockchain pet insurance, and AI-generated horoscopes have in common? MemeTech built them all. Our CEO is 24 and sleeps in the office. We don't have a business model, but we DO have 12 million TikTok followers.", emoji: "🚀", color: "#ff4500" },
];

function CommercialView({ paused }: { paused?: boolean }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * COMMERCIALS.length));
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => setIndex((prev) => (prev + 1) % COMMERCIALS.length), 6000);
    return () => clearInterval(interval);
  }, [paused]);
  const ad = COMMERCIALS[index];
  return <div className="commercial"><div className="commercial-badge">AD</div><div className="commercial-emoji">{ad.emoji}</div><div className="commercial-company" style={{ color: ad.color }}>{ad.company}</div><div className="commercial-tagline">{ad.tagline}</div><div className="commercial-body">{ad.description}</div><div className="commercial-ticker">${ad.symbol}</div><div className="commercial-dots">{COMMERCIALS.map((_, i) => <span key={i} className={`commercial-dot ${i === index ? "active" : ""}`} />)}</div></div>;
}

function DebugImpact({ item }: { item: NewsItem }) {
  if (!item.impact) return null;
  const { ticksRemaining, duration } = item.impact;
  const inDelay = ticksRemaining > duration;
  const active = ticksRemaining > 0 && !inDelay;
  const expired = ticksRemaining <= 0;
  return <div className={`debug-impact ${expired ? "expired" : active ? "active" : "pending"}`}><span className="debug-label">🔍</span><span className="debug-desc">{item.impact.description}</span><span className="debug-ticks">{inDelay ? `⏳ Delayed — activates in ${ticksRemaining - duration} ticks` : active ? `⏱ Active — ${ticksRemaining} ticks remaining` : "✓ Expired"}</span></div>;
}

function getStrengthBadge(item: NewsItem) {
  const strengths = item.impact?.effects.map((effect) => effect.strength) ?? [];
  if (strengths.includes("strong")) return item.sentiment === "positive" ? "🟢 strong" : "🔴 strong";
  if (strengths.includes("moderate")) return "🟠 moderate";
  if (strengths.includes("weak")) return "🟡 weak";
  return null;
}

function BusinessNewsView({ news, paused }: { news: NewsItem[]; paused?: boolean }) {
  const stories = news.filter((n) => n.category === "business");
  const [showCommercial, setShowCommercial] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  useEffect(() => {
    if (stories.length === 0 || paused) return;
    const timer = setTimeout(() => {
      if (showCommercial) setStoryIndex((prev) => (prev + 1) % stories.length);
      setShowCommercial((s) => !s);
    }, showCommercial ? 5000 : 8000);
    return () => clearTimeout(timer);
  }, [showCommercial, stories.length, paused]);
  const story = stories[storyIndex % Math.max(stories.length, 1)];
  const shouldShowCommercial = stories.length === 0 || showCommercial;
  const strengthBadge = story ? getStrengthBadge(story) : null;
  if (shouldShowCommercial) return <div className="biz-news-view"><div className="biz-header"><span className="biz-logo">📊 MARKET WATCH</span><span className="biz-live">● LIVE</span></div><CommercialView paused={paused} /></div>;
  return <div className="biz-news-view"><div className="biz-header"><span className="biz-logo">📊 MARKET WATCH</span><span className="biz-live">● LIVE</span></div><div className={`biz-banner sentiment-${story.sentiment}`}>{story.headline}{strengthBadge && <span className="impact-strength-badge">{strengthBadge}</span>}</div><div className="biz-body">{story.body}</div>{story.earnings && <div className="biz-earnings"><div className="earnings-title">QUARTERLY RESULTS</div><div className="earnings-grid"><div className="earnings-stat"><span className="earnings-label">Revenue</span><span className="earnings-value">{story.earnings.revenue}</span></div><div className="earnings-stat"><span className="earnings-label">Net Profit</span><span className="earnings-value">{story.earnings.profit}</span></div><div className="earnings-stat"><span className="earnings-label">Growth</span><span className="earnings-value">{story.earnings.growth}</span></div><div className="earnings-stat"><span className="earnings-label">Spending</span><span className="earnings-value">{story.earnings.spending}</span></div><div className="earnings-stat full-width"><span className="earnings-label">Guidance</span><span className="earnings-value">{story.earnings.guidance}</span></div></div></div>}{story.affectedStocks && <div className="biz-ticker-tag">${story.affectedStocks[0]}</div>}<DebugImpact item={story} /></div>;
}

function GlobalNewsView({ news, paused }: { news: NewsItem[]; paused?: boolean }) {
  const headlines = news.filter((n) => n.category === "global");
  const [showCommercial, setShowCommercial] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  useEffect(() => {
    if (headlines.length === 0 || paused) return;
    const timer = setTimeout(() => {
      if (showCommercial) setStoryIndex((prev) => (prev + 1) % headlines.length);
      setShowCommercial((s) => !s);
    }, showCommercial ? 5000 : 10000);
    return () => clearTimeout(timer);
  }, [showCommercial, headlines.length, paused]);
  const latest = headlines[storyIndex % Math.max(headlines.length, 1)];
  const shouldShowCommercial = headlines.length === 0 || showCommercial;
  const strengthBadge = latest ? getStrengthBadge(latest) : null;
  return <div className="global-news-view"><div className="global-header"><span className="global-logo">🌍 WORLD NEWS NETWORK</span><span className="global-live">● LIVE</span></div>{!shouldShowCommercial && latest ? <div className="global-main"><div className={`global-breaking sentiment-${latest.sentiment}`}>BREAKING NEWS</div><div className="global-headline">{latest.headline}{strengthBadge && <span className="impact-strength-badge">{strengthBadge}</span>}</div><DebugImpact item={latest} /></div> : <div className="global-main"><CommercialView paused={paused} /></div>}<div className="global-ticker-bar"><div className="global-ticker-content">{headlines.length > 0 ? headlines.map((h) => h.headline).join("  ///  ") : "Monitoring global events..."}</div></div></div>;
}

function formatUpvotes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function SocialFeedView({ news }: { news: NewsItem[] }) {
  const now = Date.now();
  const posts = news.filter((n) => n.category === "social").sort((a, b) => {
    const aScore = (a.upvotes ?? 0) / Math.pow((now - a.timestamp) / 1000 / 60 + 2, 1.2);
    const bScore = (b.upvotes ?? 0) / Math.pow((now - b.timestamp) / 1000 / 60 + 2, 1.2);
    return bScore - aScore;
  });
  return <div className="social-feed-view"><div className="social-header"><span className="social-logo">💬 r/WallStreetYOLOs</span><div className="social-tabs"><span className="social-tab active">🔥 Hot</span><span className="social-tab">🆕 New</span><span className="social-tab">📈 Rising</span></div></div><div className="social-post-list">{posts.length === 0 && <div className="social-empty">Nothing trending yet... check back soon</div>}{posts.map((post, index) => { const isViral = (post.upvotes ?? 0) > 500; const isMega = (post.upvotes ?? 0) > 2000; return <div key={post.id} className={`social-post-row ${isMega ? "mega-viral" : isViral ? "viral" : ""}`}><div className="social-rank">#{index + 1}</div><div className="social-vote-col"><span className="vote-arrow">▲</span><span className={`vote-count ${isViral ? "vote-hot" : ""}`}>{formatUpvotes(post.upvotes ?? 0)}</span><span className="vote-arrow dim">▼</span></div><div className="social-post-content"><div className="social-post-title">{post.headline}{post.affectedStocks && <span className="ticker-tag">${post.affectedStocks[0]}</span>}{isViral && <span className="viral-badge">{isMega ? "🔥 VIRAL" : "📈 Rising"}</span>}</div><div className="social-post-body">{post.body}</div><div className="social-post-meta"><span className="social-author">u/{post.author || "anonymous"}</span><span className={`social-flair sentiment-${post.sentiment}`}>{post.sentiment === "positive" ? "🚀 Bullish" : "🐻 Bearish"}</span><span className="social-comments">💬 {post.commentCount ?? 0}</span><span className="social-share">↗ Share</span><span className="social-awards">{(post.upvotes ?? 0) > 1000 && "🏆"}{(post.upvotes ?? 0) > 500 && "💎"}{(post.upvotes ?? 0) > 100 && "🥈"}</span></div><DebugImpact item={post} /></div></div>;})}</div></div>;
}

export function NewsFeed({ news, category, paused }: NewsFeedProps) {
  if (category === "business") return <BusinessNewsView news={news} paused={paused} />;
  if (category === "global") return <GlobalNewsView news={news} paused={paused} />;
  return <SocialFeedView news={news} />;
}

interface InsiderFeedProps {
  tip: InsiderTip | null;
  tip2?: InsiderTip | null;
  viewed: boolean;
  onView: () => void;
}

function InsiderMessage({ tip }: { tip: InsiderTip }) {
  return <div className="insider-message-bubble"><div className="insider-message-header"><span className="insider-avatar">🕵️</span><span className="insider-sender">Anonymous Contact</span><span className="insider-encrypted">🔒 encrypted</span></div><div className="insider-message-body">{tip.tipText}</div><div className="insider-stock-tag"><span className={`insider-direction ${tip.direction}`}>{tip.direction === "up" ? "📈" : "📉"} ${tip.symbol}</span></div></div>;
}

export function InsiderFeed({ tip, tip2, viewed, onView }: InsiderFeedProps) {
  const tips = [tip, tip2].filter(Boolean) as InsiderTip[];
  if (tips.length === 0) return <div className="insider-feed-view"><div className="insider-header"><span className="insider-logo">🤫 INSIDER TIPS</span><span className="insider-warning">⚠️ CONFIDENTIAL</span></div><div className="insider-empty"><div className="insider-empty-icon">📱</div><div className="insider-empty-text">No tips today...</div><div className="insider-empty-sub">Check back tomorrow. Your contacts are working on something.</div></div></div>;
  return <div className="insider-feed-view"><div className="insider-header"><span className="insider-logo">🤫 INSIDER TIPS</span><span className="insider-warning">⚠️ CONFIDENTIAL</span></div>{!viewed ? <div className="insider-tip-hidden"><div className="insider-envelope">📨</div><div className="insider-hidden-text">You have {tips.length} new insider tip{tips.length > 1 ? "s" : ""} from anonymous contacts.</div><div className="insider-hidden-sub">Viewing these tips may constitute insider trading. Any profits from these stocks after viewing may attract SEC attention.</div><button className="insider-reveal-btn" onClick={onView}>🔓 View {tips.length > 1 ? "Tips" : "Tip"}</button></div> : <div className="insider-tip-container">{tips.map((entry) => <InsiderMessage key={entry.id} tip={entry} />)}<div className="insider-sec-warning">⚠️ You've viewed these tips. Trading on this information may attract SEC attention.</div><div className="debug-impact active"><span className="debug-label">🔍</span><span className="debug-desc">{tips.map((t) => `${t.symbol}: 90% chance of strong ${t.direction === "up" ? "price SURGE ↑" : "price CRASH ↓"}`).join(" | ")}. SEC fine risk scales with profits on tipped names after viewing.</span></div></div>}</div>;
}
