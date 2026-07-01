export interface Stock {
  symbol: string;
  name: string;
  price: number;
  history: number[];
  sector: string;
}

export interface EarningsData {
  revenue: string;
  profit: string;
  growth: string;
  spending: string;
  guidance: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  body: string;
  category: "business" | "global" | "social";
  timestamp: number;
  affectedStocks?: string[];
  sentiment: "positive" | "negative" | "neutral";
  earnings?: EarningsData;
  author?: string;
  upvotes?: number;
  commentCount?: number;
  momentum?: number; // how fast upvotes are growing (hidden from player)
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
  | "stock_ticker";

export interface Monitor {
  id: number;
  channel: MonitorChannel;
  selectedStock?: string;
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
}
