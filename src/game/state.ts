import { GameState, Stock, DailyPrice } from "./types";
import { createTradingTracker, selectDailyChallenges } from "./challenges";
import { createEmptyInventory } from "./consumables";

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
  volatility: number = 0.02,
): DailyPrice[] {
  const rng = seededRandom(seed);
  const prices: DailyPrice[] = [];
  let price = currentPrice;
  const rawPrices: number[] = [price];

  for (let i = 1; i < tradingDays; i++) {
    const change = (rng() - 0.48) * volatility * price;
    price = Math.max(1, price - change);
    rawPrices.unshift(price);
  }

  for (let i = 0; i < rawPrices.length; i++) {
    prices.push({ day: i - rawPrices.length + 1, close: Math.round(rawPrices[i] * 100) / 100 });
  }

  return prices;
}

const INITIAL_STOCKS: Stock[] = [
  { symbol: "MEGA", name: "MegaCorp Industries", price: 150, openPrice: 150, history: [150], dailyHistory: [], tags: ["large-cap", "tech", "cloud", "enterprise"], ipoDay: 1260 },
  { symbol: "BREW", name: "BrewDog Coffee Co", price: 42, openPrice: 42, history: [42], dailyHistory: [], tags: ["mid-cap", "consumer", "retail", "food"], ipoDay: 756 },
  { symbol: "NOVA", name: "Nova Energy", price: 88, openPrice: 88, history: [88], dailyHistory: [], tags: ["mid-cap", "energy", "renewable", "green"], ipoDay: 504 },
  { symbol: "PILL", name: "PillStack Pharma", price: 210, openPrice: 210, history: [210], dailyHistory: [], tags: ["large-cap", "healthcare", "pharma", "biotech"], ipoDay: 1260 },
  { symbol: "BANK", name: "First National Holdings", price: 65, openPrice: 65, history: [65], dailyHistory: [], tags: ["large-cap", "finance", "banking"], ipoDay: 1260 },
  { symbol: "MEME", name: "MemeTech Solutions", price: 12, openPrice: 12, history: [12], dailyHistory: [], tags: ["small-cap", "tech", "speculative", "social-media"], ipoDay: 63 },
];

export function createInitialState(playerCount: number = 1): GameState {
  const stocksWithHistory = INITIAL_STOCKS.map((stock, idx) => {
    const volatility = stock.tags.includes("speculative") ? 0.04 : stock.tags.includes("small-cap") ? 0.03 : 0.018;
    const dailyHistory = generateFakeHistory(stock.price, stock.ipoDay, (idx + 1) * 7919, volatility);
    return { ...stock, dailyHistory };
  });

  return {
    day: 1,
    cash: 1000 * playerCount,
    restaurantEarnings: 0,
    portfolio: [],
    shorts: [],
    monitors: [{ id: 0, channel: "stock_ticker", selectedStock: "MEGA" }],
    stocks: stocksWithHistory,
    news: [],
    acquiredUpgrades: [],
    acquiredRestaurantUpgrades: [],
    upgradeDraftOptions: [],
    restaurantUpgradeDraftOptions: [],
    stopLossEnabled: true,
    goldenParachutes: 0,
    timeOfDay: 0,
    marketOpen: true,
    gameOver: false,
    totalProfit: 0,
    milestonePayment: null,
    dayStartNetWorth: 1000 * playerCount,
    insiderTip: null,
    insiderTip2: null,
    insiderViewed: false,
    insiderViewedTick: 0,
    insiderSnapshotHoldings: [],
    insiderSnapshotShorts: [],
    insiderRealizedProfit: 0,
    secFines: [],
    pendingSECCheck: null,
    loans: [],
    pendingOrders: [],
    stockDraftOptions: [],
    menuDraftOptions: [],
    draftedSymbols: [],
    draftedMenuItems: [],
    recentTrades: [],
    pinnedStocks: [],
    institutionalOrders: [],
    optionsPositions: [],
    challengeTracker: createTradingTracker(),
    activeChallenges: selectDailyChallenges(1, false, false, Math.floor(Math.random() * 2147483647)),
    tickets: 0,
    tradingTickets: 0,
    restaurantTickets: 0,
    runSeed: Math.floor(Math.random() * 2147483647),
    freeNextStock: false,
    consumableInventory: createEmptyInventory(),
    playerCount,
    schmoozeInsiderTip: null,
    schmoozeActiveTip: null,
  };
}
