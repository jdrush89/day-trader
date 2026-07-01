import { GameState, Stock, Upgrade } from "./types";

const INITIAL_STOCKS: Stock[] = [
  { symbol: "MEGA", name: "MegaCorp Industries", price: 150, openPrice: 150, history: [150], sector: "tech" },
  { symbol: "BREW", name: "BrewDog Coffee Co", price: 42, openPrice: 42, history: [42], sector: "consumer" },
  { symbol: "NOVA", name: "Nova Energy", price: 88, openPrice: 88, history: [88], sector: "energy" },
  { symbol: "PILL", name: "PillStack Pharma", price: 210, openPrice: 210, history: [210], sector: "healthcare" },
  { symbol: "BANK", name: "First National Holdings", price: 65, openPrice: 65, history: [65], sector: "finance" },
  { symbol: "MEME", name: "MemeTech Solutions", price: 12, openPrice: 12, history: [12], sector: "tech" },
];

const INITIAL_UPGRADES: Upgrade[] = [
  {
    id: "monitor_2",
    name: "Second Monitor",
    description: "View two channels simultaneously",
    cost: 500,
    purchased: false,
    effect: { type: "extra_monitor" },
  },
  {
    id: "monitor_3",
    name: "Third Monitor",
    description: "View three channels simultaneously",
    cost: 2000,
    purchased: false,
    effect: { type: "extra_monitor" },
  },
  {
    id: "fast_news",
    name: "News Wire Subscription",
    description: "Get news 30 seconds earlier",
    cost: 750,
    purchased: false,
    effect: { type: "faster_news" },
  },
  {
    id: "candlestick",
    name: "Candlestick Charts",
    description: "See OHLC data instead of just line charts",
    cost: 300,
    purchased: false,
    effect: { type: "better_charts", detail: "candlestick" },
  },
  {
    id: "low_interest",
    name: "Credit Score Boost",
    description: "Reduce daily interest by 2%",
    cost: 1500,
    purchased: false,
    effect: { type: "lower_interest", reduction: 0.02 },
  },
  {
    id: "insider",
    name: "Golf Club Membership",
    description: "Occasionally get early hints about upcoming news",
    cost: 3000,
    purchased: false,
    effect: { type: "insider_tips" },
  },
];

export function createInitialState(): GameState {
  return {
    day: 1,
    cash: 1000,
    loan: 1000,
    interestRate: 0.1,
    portfolio: [],
    shorts: [],
    monitors: [{ id: 0, channel: "stock_ticker", selectedStock: "MEGA" }],
    stocks: INITIAL_STOCKS,
    news: [],
    upgrades: INITIAL_UPGRADES,
    timeOfDay: 0,
    marketOpen: true,
    gameOver: false,
    totalProfit: 0,
    dayStartNetWorth: 1000,
    insiderTip: null,
    insiderViewed: false,
    insiderViewedTick: 0,
    insiderSnapshotHoldings: [],
    insiderSnapshotShorts: [],
    secFines: [],
  };
}
