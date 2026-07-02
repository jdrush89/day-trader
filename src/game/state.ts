import { GameState, Stock, Upgrade, DailyPrice } from "./types";

// Seeded random for reproducible fake history
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateFakeHistory(
  currentPrice: number,
  tradingDays: number,
  seed: number,
  volatility: number = 0.02
): DailyPrice[] {
  const rng = seededRandom(seed);
  const prices: DailyPrice[] = [];

  // Work backwards from current price
  let price = currentPrice;
  const rawPrices: number[] = [price];

  for (let i = 1; i < tradingDays; i++) {
    // Random walk with slight upward bias
    const change = (rng() - 0.48) * volatility * price;
    price = Math.max(1, price - change); // going backwards, so subtract
    rawPrices.unshift(price);
  }

  // Convert to DailyPrice entries with negative day numbers
  for (let i = 0; i < rawPrices.length; i++) {
    prices.push({
      day: i - rawPrices.length + 1, // e.g. -1259, -1258, ... , 0
      close: Math.round(rawPrices[i] * 100) / 100,
    });
  }

  return prices;
}

const INITIAL_STOCKS: Stock[] = [
  {
    symbol: "MEGA", name: "MegaCorp Industries", price: 150, openPrice: 150,
    history: [150], dailyHistory: [], tags: ["large-cap", "tech", "cloud", "enterprise"],
    ipoDay: 1260, // ~5 years
  },
  {
    symbol: "BREW", name: "BrewDog Coffee Co", price: 42, openPrice: 42,
    history: [42], dailyHistory: [], tags: ["mid-cap", "consumer", "retail", "food"],
    ipoDay: 756, // ~3 years
  },
  {
    symbol: "NOVA", name: "Nova Energy", price: 88, openPrice: 88,
    history: [88], dailyHistory: [], tags: ["mid-cap", "energy", "renewable", "green"],
    ipoDay: 504, // ~2 years
  },
  {
    symbol: "PILL", name: "PillStack Pharma", price: 210, openPrice: 210,
    history: [210], dailyHistory: [], tags: ["large-cap", "healthcare", "pharma", "biotech"],
    ipoDay: 1260, // ~5 years
  },
  {
    symbol: "BANK", name: "First National Holdings", price: 65, openPrice: 65,
    history: [65], dailyHistory: [], tags: ["large-cap", "finance", "banking"],
    ipoDay: 1260, // ~5 years
  },
  {
    symbol: "MEME", name: "MemeTech Solutions", price: 12, openPrice: 12,
    history: [12], dailyHistory: [], tags: ["small-cap", "tech", "speculative", "social-media"],
    ipoDay: 63, // ~3 months (recent IPO)
  },
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
    id: "fast_charts",
    name: "Real-Time Data Feed",
    description: "Charts update faster with more data points",
    cost: 1500,
    purchased: false,
    effect: { type: "better_charts", detail: "realtime" },
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
  // Generate fake historical data for each stock
  const stocksWithHistory = INITIAL_STOCKS.map((stock, idx) => {
    const volatility = stock.tags.includes("speculative") ? 0.04 :
                       stock.tags.includes("small-cap") ? 0.03 : 0.018;
    const dailyHistory = generateFakeHistory(
      stock.price,
      stock.ipoDay,
      (idx + 1) * 7919, // unique seed per stock
      volatility,
    );
    return { ...stock, dailyHistory };
  });

  return {
    day: 1,
    cash: 1000,
    portfolio: [],
    shorts: [],
    monitors: [{ id: 0, channel: "stock_ticker", selectedStock: "MEGA" }],
    stocks: stocksWithHistory,
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
    insiderRealizedProfit: 0,
    secFines: [],
    pendingOrders: [],
    stockDraftOptions: [],
    draftedSymbols: [],
  };
}
