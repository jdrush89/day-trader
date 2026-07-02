export interface Stock {
  symbol: string;
  name: string;
  price: number;
  openPrice: number;
  history: number[];
  tags: string[];
}

export interface EarningsData {
  revenue: string;
  profit: string;
  growth: string;
  spending: string;
  guidance: string;
}

export interface NewsImpact {
  description: string; // human-readable for debug view
  effects: { symbol?: string; tag?: string; direction: "up" | "down"; strength: "weak" | "moderate" | "strong" }[];
  probability: number; // 0-1, how likely it is to actually fire each tick
  delay: number; // ticks before the effect starts
  duration: number; // how many ticks the effect lasts once active
  ticksRemaining: number;
}

export interface NewsItem {
  id: string;
  headline: string;
  body: string;
  category: "business" | "global" | "social";
  timestamp: number;
  affectedStocks?: string[];
  affectedTags?: string[];
  sentiment: "positive" | "negative" | "neutral";
  earnings?: EarningsData;
  author?: string;
  upvotes?: number;
  commentCount?: number;
  momentum?: number;
  impact?: NewsImpact;
}

export interface Position {
  symbol: string;
  shares: number;
  avgCost: number;
}

export interface ShortPosition {
  symbol: string;
  shares: number;
  entryPrice: number;
}

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  cost: number;
  purchased: boolean;
  effect: UpgradeEffect;
}

export type UpgradeEffect =
  | { type: "extra_monitor" }
  | { type: "faster_news" }
  | { type: "better_charts"; detail: string }
  | { type: "lower_interest"; reduction: number }
  | { type: "insider_tips" };

export type MonitorChannel =
  | "business_news"
  | "global_news"
  | "social_media"
  | "stock_ticker"
  | "insider";

export interface Monitor {
  id: number;
  channel: MonitorChannel;
  selectedStock?: string;
}

export interface InsiderTip {
  id: string;
  symbol: string;
  companyName: string;
  tipText: string;
  direction: "up" | "down";
  day: number;
}

export interface SECFine {
  amount: number;
  symbol: string;
  profit: number;
  day: number;
}

export interface GameState {
  day: number;
  cash: number;
  loan: number;
  interestRate: number;
  portfolio: Position[];
  shorts: ShortPosition[];
  monitors: Monitor[];
  stocks: Stock[];
  news: NewsItem[];
  upgrades: Upgrade[];
  timeOfDay: number; // 0-100, representing market hours
  marketOpen: boolean;
  gameOver: boolean;
  totalProfit: number;
  dayStartNetWorth: number;
  insiderTip: InsiderTip | null;
  insiderViewed: boolean; // player looked at insider channel today
  insiderViewedTick: number; // tick when they first viewed it
  // snapshot of holdings at the moment they viewed insider, to calc profit AFTER viewing
  insiderSnapshotHoldings: { symbol: string; shares: number; avgCost: number }[];
  insiderSnapshotShorts: { symbol: string; shares: number; entryPrice: number }[];
  secFines: SECFine[];
}
