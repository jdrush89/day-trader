import type { MenuItem } from "./restaurant-types";

export type HistoryRange = "1D" | "5D" | "1M" | "6M" | "1Y" | "5Y" | "MAX";

export interface DailyPrice {
  day: number;
  close: number;
}

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  openPrice: number;
  history: number[];
  dailyHistory: DailyPrice[];
  tags: string[];
  ipoDay: number;
}

export interface EarningsData {
  revenue: string;
  profit: string;
  growth: string;
  spending: string;
  guidance: string;
}

export interface NewsImpact {
  description: string;
  effects: { symbol?: string; tag?: string; direction: "up" | "down"; strength: "weak" | "moderate" | "strong" }[];
  probability: number;
  delay: number;
  duration: number;
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
  dayAcquired: number;
}

export interface ShortPosition {
  symbol: string;
  shares: number;
  entryPrice: number;
}

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

export type OrderType = "market" | "limit" | "stop-loss";
export type OrderSide = "buy" | "short" | "sell" | "cover";

export interface PendingOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  shares: number;
  orderType: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  createdAt: number;
  day: number;
}

export interface InstitutionalOrder {
  firm: string;
  symbol: string;
  side: "buy" | "sell";
  shares: number;
}

export interface OptionsContract {
  id: string;
  symbol: string;
  type: "call" | "put";
  strikePrice: number;
  expirationDay: number;
  premium: number;
  contracts: number;
  side: "long" | "short";
  dayOpened: number;
}

export interface GameState {
  day: number;
  cash: number;
  restaurantEarnings: number;
  portfolio: Position[];
  shorts: ShortPosition[];
  monitors: Monitor[];
  stocks: Stock[];
  news: NewsItem[];
  acquiredUpgrades: string[];
  acquiredRestaurantUpgrades: string[];
  upgradeDraftOptions: string[];
  restaurantUpgradeDraftOptions: string[];
  stopLossEnabled: boolean;
  goldenParachutes: number;
  timeOfDay: number;
  marketOpen: boolean;
  gameOver: boolean;
  totalProfit: number;
  dayStartNetWorth: number;
  insiderTip: InsiderTip | null;
  insiderTip2: InsiderTip | null;
  insiderViewed: boolean;
  insiderViewedTick: number;
  insiderSnapshotHoldings: { symbol: string; shares: number; avgCost: number }[];
  insiderSnapshotShorts: { symbol: string; shares: number; entryPrice: number }[];
  insiderRealizedProfit: number;
  secFines: SECFine[];
  pendingOrders: PendingOrder[];
  stockDraftOptions: Stock[];
  menuDraftOptions: MenuItem[];
  draftedSymbols: string[];
  draftedMenuItems: string[];
  recentTrades: string[];
  pinnedStocks: string[];
  institutionalOrders: InstitutionalOrder[];
  optionsPositions: OptionsContract[];
}
