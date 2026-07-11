import type { GameState } from "./types";

// --- Tracker types ---

export interface TradingChallengeTracker {
  profitByStock: Record<string, number>;
  soldAny: boolean;
  boughtAny: boolean;
  techProfit: number;
  tradedStocks: string[];
  buyPrices: { symbol: string; price: number }[];
  sellPrices: { symbol: string; price: number }[];
  maxSingleTradeProfit: number;
  viewedNews: boolean;
  optionsProfit: number;
  limitOrderProfit: number;
  // Contrarian: stocks with recent bad news and buys made on them
  badNewsStocks: Record<string, number>; // symbol -> tick when bad news appeared
  contrarianBuys: { symbol: string; buyPrice: number }[];
}

export interface RestaurantChallengeTracker {
  fastCompletions: number; // orders completed within 3 game-seconds
  allTipsPositive: boolean; // all completed orders had tip > 0
  clutchCompletions: number; // orders completed with < 2 sec patience left
  maxActiveOrders: number; // max simultaneous non-null, non-failed, non-served orders
  subSecondCompletion: boolean; // any order completed in < 1 game-second
  anyTimerBelow50: boolean; // any order's patience went below 50%
}

export function createTradingTracker(): TradingChallengeTracker {
  return {
    profitByStock: {},
    soldAny: false,
    boughtAny: false,
    techProfit: 0,
    tradedStocks: [],
    buyPrices: [],
    sellPrices: [],
    maxSingleTradeProfit: 0,
    viewedNews: false,
    optionsProfit: 0,
    limitOrderProfit: 0,
    badNewsStocks: {},
    contrarianBuys: [],
  };
}

export function createRestaurantTracker(): RestaurantChallengeTracker {
  return {
    fastCompletions: 0,
    allTipsPositive: true,
    clutchCompletions: 0,
    maxActiveOrders: 0,
    subSecondCompletion: false,
    anyTimerBelow50: false,
  };
}

// --- Challenge definitions ---

export interface ChallengeDefinition {
  id: string;
  name: string;
  description: string;
  type: "trading" | "restaurant";
  tickets: number;
  icon: string;
  evaluate: (
    tracker: TradingChallengeTracker,
    gameState: GameState,
    restTracker?: RestaurantChallengeTracker,
  ) => boolean;
}

const BAD_NEWS_WINDOW_TICKS = 10;

export const TRADING_CHALLENGES: ChallengeDefinition[] = [
  {
    id: "profit_5_stocks",
    name: "Diversified Gains",
    description: "Make a profit off of 5 different stocks",
    type: "trading",
    tickets: 3,
    icon: "🌐",
    evaluate: (t) => Object.values(t.profitByStock).filter((p) => p > 0).length >= 5,
  },
  {
    id: "no_selling",
    name: "Diamond Hands",
    description: "Don't sell any stocks",
    type: "trading",
    tickets: 1,
    icon: "💎",
    evaluate: (t) => !t.soldAny,
  },
  {
    id: "no_buying",
    name: "Short Seller",
    description: "Don't buy any stocks",
    type: "trading",
    tickets: 1,
    icon: "📉",
    evaluate: (t) => !t.boughtAny,
  },
  {
    id: "tech_profit",
    name: "Tech Bro",
    description: "Make $100 off of tech stocks",
    type: "trading",
    tickets: 2,
    icon: "💻",
    evaluate: (t) => t.techProfit >= 100,
  },
  {
    id: "single_stock",
    name: "Tunnel Vision",
    description: "Trade only a single stock for the day",
    type: "trading",
    tickets: 2,
    icon: "🎯",
    evaluate: (t) => t.tradedStocks.length === 1,
  },
  {
    id: "buy_at_low",
    name: "Bottom Fisher",
    description: "Buy a stock within 10% of its daily low",
    type: "trading",
    tickets: 3,
    icon: "🎣",
    evaluate: (t, gs) => {
      for (const buy of t.buyPrices) {
        const stock = gs.stocks.find((s) => s.symbol === buy.symbol);
        if (!stock) continue;
        const dayLow = Math.min(...stock.history);
        if (dayLow > 0 && buy.price <= dayLow * 1.1) return true;
      }
      return false;
    },
  },
  {
    id: "sell_at_high",
    name: "Peak Performer",
    description: "Sell a stock within 10% of its daily high",
    type: "trading",
    tickets: 3,
    icon: "⛰️",
    evaluate: (t, gs) => {
      for (const sell of t.sellPrices) {
        const stock = gs.stocks.find((s) => s.symbol === sell.symbol);
        if (!stock) continue;
        const dayHigh = Math.max(...stock.history);
        if (dayHigh > 0 && sell.price >= dayHigh * 0.9) return true;
      }
      return false;
    },
  },
  {
    id: "big_trade",
    name: "Whale Trade",
    description: "Make $200 in a single trade",
    type: "trading",
    tickets: 2,
    icon: "🐋",
    evaluate: (t) => t.maxSingleTradeProfit >= 200,
  },
  {
    id: "many_positions",
    name: "Portfolio Builder",
    description: "End with more than 3 open positions",
    type: "trading",
    tickets: 1,
    icon: "📊",
    evaluate: (_t, gs) => gs.portfolio.length > 3,
  },
  {
    id: "no_news",
    name: "Blind Trader",
    description: "Make a profit without using any news channels",
    type: "trading",
    tickets: 3,
    icon: "🙈",
    evaluate: (t, gs) => {
      const portfolioValue = gs.portfolio.reduce((sum, pos) => {
        const stock = gs.stocks.find((s) => s.symbol === pos.symbol);
        return sum + (stock ? stock.price * pos.shares : 0);
      }, 0);
      const shortLiability = gs.shorts.reduce((sum, pos) => {
        const stock = gs.stocks.find((s) => s.symbol === pos.symbol);
        return sum + (stock ? stock.price * pos.shares : 0);
      }, 0);
      const shortCollateral = gs.shorts.reduce((sum, pos) => sum + pos.entryPrice * pos.shares, 0);
      const netWorth = gs.cash + portfolioValue + shortCollateral - shortLiability;
      return !t.viewedNews && netWorth > gs.dayStartNetWorth;
    },
  },
  {
    id: "big_day",
    name: "Big Day",
    description: "Make $500 total profit for the day",
    type: "trading",
    tickets: 2,
    icon: "💰",
    evaluate: (_t, gs) => {
      const portfolioValue = gs.portfolio.reduce((sum, pos) => {
        const stock = gs.stocks.find((s) => s.symbol === pos.symbol);
        return sum + (stock ? stock.price * pos.shares : 0);
      }, 0);
      const shortLiability = gs.shorts.reduce((sum, pos) => {
        const stock = gs.stocks.find((s) => s.symbol === pos.symbol);
        return sum + (stock ? stock.price * pos.shares : 0);
      }, 0);
      const shortCollateral = gs.shorts.reduce((sum, pos) => sum + pos.entryPrice * pos.shares, 0);
      const netWorth = gs.cash + portfolioValue + shortCollateral - shortLiability;
      return netWorth - gs.dayStartNetWorth >= 500;
    },
  },
  {
    id: "options_profit",
    name: "Options Guru",
    description: "Profit $100 from an options trade",
    type: "trading",
    tickets: 2,
    icon: "📜",
    evaluate: (t) => t.optionsProfit >= 100,
  },
  {
    id: "limit_profit",
    name: "Patient Trader",
    description: "Profit $100 from limit orders",
    type: "trading",
    tickets: 2,
    icon: "⏳",
    evaluate: (t) => t.limitOrderProfit >= 100,
  },
  {
    id: "contrarian",
    name: "Contrarian",
    description: "Buy a stock after bad news and still profit",
    type: "trading",
    tickets: 3,
    icon: "🔄",
    evaluate: (t, gs) => {
      for (const buy of t.contrarianBuys) {
        const stock = gs.stocks.find((s) => s.symbol === buy.symbol);
        if (stock && stock.price > buy.buyPrice) return true;
      }
      return false;
    },
  },
];

export const RESTAURANT_CHALLENGES: ChallengeDefinition[] = [
  {
    id: "fast_3_orders",
    name: "Speed Demon",
    description: "Complete 3 orders within 3 seconds",
    type: "restaurant",
    tickets: 2,
    icon: "⚡",
    evaluate: (_t, _gs, rt) => (rt?.fastCompletions ?? 0) >= 3,
  },
  {
    id: "no_missed_tips",
    name: "Tip Collector",
    description: "Don't miss any tips",
    type: "restaurant",
    tickets: 2,
    icon: "💵",
    evaluate: (_t, _gs, rt) => rt?.allTipsPositive ?? false,
  },
  {
    id: "clutch_3",
    name: "Clutch Chef",
    description: "Complete 3 orders with less than 2 sec left",
    type: "restaurant",
    tickets: 2,
    icon: "🔥",
    evaluate: (_t, _gs, rt) => (rt?.clutchCompletions ?? 0) >= 3,
  },
  {
    id: "multi_cook",
    name: "Multitasker",
    description: "Have 3 things cooking at the same time",
    type: "restaurant",
    tickets: 2,
    icon: "🍳",
    evaluate: (_t, _gs, rt) => (rt?.maxActiveOrders ?? 0) >= 3,
  },
  {
    id: "sub_second",
    name: "Lightning Hands",
    description: "Complete an order in under 1 second",
    type: "restaurant",
    tickets: 3,
    icon: "⚡",
    evaluate: (_t, _gs, rt) => rt?.subSecondCompletion ?? false,
  },
  {
    id: "safe_timers",
    name: "No Pressure",
    description: "Never let a timer go below 50%",
    type: "restaurant",
    tickets: 3,
    icon: "⏰",
    evaluate: (_t, _gs, rt) => !(rt?.anyTimerBelow50 ?? true),
  },
];

export const ALL_CHALLENGES = [...TRADING_CHALLENGES, ...RESTAURANT_CHALLENGES];

// --- Active challenge state ---

export interface ActiveChallenge {
  id: string;
  completed: boolean;
}

// Select random challenges for a day
export function selectDailyChallenges(
  day: number,
  isBossDay: boolean,
  isRestaurantDay: boolean,
): ActiveChallenge[] {
  // Seeded random for deterministic per-day selection
  let seed = day * 31337 + 42;
  const rng = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return seed / 2147483647;
  };

  const shuffle = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const challenges: ActiveChallenge[] = [];

  if (isBossDay) {
    // Boss day: 2 trading + 2 restaurant
    const trading = shuffle(TRADING_CHALLENGES).slice(0, 2);
    const restaurant = shuffle(RESTAURANT_CHALLENGES).slice(0, 2);
    for (const c of [...trading, ...restaurant]) {
      challenges.push({ id: c.id, completed: false });
    }
  } else if (isRestaurantDay) {
    // Restaurant day: 3 restaurant challenges
    const restaurant = shuffle(RESTAURANT_CHALLENGES).slice(0, 3);
    for (const c of restaurant) {
      challenges.push({ id: c.id, completed: false });
    }
  } else {
    // Trading day: 3 trading challenges
    const trading = shuffle(TRADING_CHALLENGES).slice(0, 3);
    for (const c of trading) {
      challenges.push({ id: c.id, completed: false });
    }
  }

  return challenges;
}

// Evaluate all active challenges and return updated list with completion status
export function evaluateChallenges(
  challenges: ActiveChallenge[],
  tradingTracker: TradingChallengeTracker,
  gameState: GameState,
  restaurantTracker?: RestaurantChallengeTracker,
): ActiveChallenge[] {
  return challenges.map((ch) => {
    const def = ALL_CHALLENGES.find((d) => d.id === ch.id);
    if (!def) return ch;
    return {
      ...ch,
      completed: def.evaluate(tradingTracker, gameState, restaurantTracker),
    };
  });
}

// Check if a stock had bad news recently (within window)
export function isInBadNewsWindow(
  tracker: TradingChallengeTracker,
  symbol: string,
  currentTick: number,
): boolean {
  const newsTick = tracker.badNewsStocks[symbol];
  if (newsTick === undefined) return false;
  return currentTick - newsTick <= BAD_NEWS_WINDOW_TICKS;
}

// Get total tickets earned from completed challenges
export function getTicketsEarned(challenges: ActiveChallenge[]): number {
  return challenges.reduce((sum, ch) => {
    if (!ch.completed) return sum;
    const def = ALL_CHALLENGES.find((d) => d.id === ch.id);
    return sum + (def?.tickets ?? 0);
  }, 0);
}
