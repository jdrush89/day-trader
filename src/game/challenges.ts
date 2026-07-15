import type { GameState } from "./types";

// --- Tracker types ---

export interface TradingChallengeTracker {
  profitByStock: Record<string, number>;
  soldAny: boolean;
  boughtAny: boolean;
  techProfit: number;
  tradedStocks: string[];
  buyPrices: { symbol: string; price: number; tick: number; playerName?: string }[];
  sellPrices: { symbol: string; price: number; tick: number; playerName?: string }[];
  maxSingleTradeProfit: number;
  maxSingleTradeSymbol: string;
  maxSingleTradePlayer: string;
  viewedNews: boolean;
  optionsProfit: number;
  limitOrderProfit: number;
  // Contrarian: stocks with recent bad news and buys made on them
  badNewsStocks: Record<string, number>; // symbol -> tick when bad news appeared
  contrarianBuys: { symbol: string; buyPrice: number; playerName?: string }[];
  // Player tracking for detailed results
  firstSellPlayer: string; // who sold first (for Diamond Hands fail)
  firstBuyPlayer: string; // who bought first (for Short Seller fail)
}

export interface RestaurantChallengeTracker {
  fastCompletions: number; // orders completed within 3 game-seconds
  allTipsPositive: boolean; // all completed orders had tip > 0
  clutchCompletions: number; // orders completed with < 2 sec patience left
  maxActiveOrders: number; // max simultaneous non-null, non-failed, non-served orders
  maxCookingOrders: number; // max simultaneous orders on grill/fry with prepStarted
  subSecondCompletion: boolean; // any order completed in < 1 game-second
  anyTimerBelow50: boolean; // any order's patience went below 50%
  // Detail tracking for result descriptions
  firstMissedTipOrder: string; // name of first order where tip was 0
  firstMissedTipTime: number; // shift elapsed time when tip was missed
  firstTimerBelow50Order: string; // name of first order that dropped below 50%
  firstTimerBelow50Time: number; // shift elapsed time when it happened
  fastestCompletion: number; // fastest order completion time in seconds
  fastestCompletionOrder: string; // name of fastest completed order
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
    maxSingleTradeSymbol: "",
    maxSingleTradePlayer: "",
    viewedNews: false,
    optionsProfit: 0,
    limitOrderProfit: 0,
    badNewsStocks: {},
    contrarianBuys: [],
    firstSellPlayer: "",
    firstBuyPlayer: "",
  };
}

export function createRestaurantTracker(): RestaurantChallengeTracker {
  return {
    fastCompletions: 0,
    allTipsPositive: true,
    clutchCompletions: 0,
    maxActiveOrders: 0,
    maxCookingOrders: 0,
    subSecondCompletion: false,
    anyTimerBelow50: false,
    firstMissedTipOrder: "",
    firstMissedTipTime: 0,
    firstTimerBelow50Order: "",
    firstTimerBelow50Time: 0,
    fastestCompletion: 9999,
    fastestCompletionOrder: "",
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
    evaluate: (_t, _gs, rt) => (rt?.maxCookingOrders ?? 0) >= 3,
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
  resultDetail?: string; // human-readable summary of how challenge was completed or why it failed
}

// Select random challenges for a day
export function selectDailyChallenges(
  day: number,
  isBossDay: boolean,
  isRestaurantDay: boolean,
  runSeed: number = 0,
): ActiveChallenge[] {
  // Seeded random using both day and run seed for unique per-run selection
  let seed = (day * 31337 + runSeed + 42) % 2147483647;
  if (seed <= 0) seed += 2147483646;
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
    // Boss day: 1 trading + 1 restaurant
    const trading = shuffle(TRADING_CHALLENGES).slice(0, 1);
    const restaurant = shuffle(RESTAURANT_CHALLENGES).slice(0, 1);
    for (const c of [...trading, ...restaurant]) {
      challenges.push({ id: c.id, completed: false });
    }
  } else if (isRestaurantDay) {
    // Restaurant day: 1 restaurant challenge
    const restaurant = shuffle(RESTAURANT_CHALLENGES).slice(0, 1);
    for (const c of restaurant) {
      challenges.push({ id: c.id, completed: false });
    }
  } else {
    // Trading day: 1 trading challenge
    const trading = shuffle(TRADING_CHALLENGES).slice(0, 1);
    for (const c of trading) {
      challenges.push({ id: c.id, completed: false });
    }
  }

  return challenges;
}

// Convert a timeOfDay tick (0-100) to a trading clock string like "9:30 AM"
function tickToTradingTime(tick: number): string {
  // Trading day: 9:30 AM to 4:00 PM = 6.5 hours = 390 minutes
  // 100 ticks = full day
  const minutes = Math.round((tick / 100) * 390);
  const totalMinutes = 9 * 60 + 30 + minutes; // start at 9:30
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${mins.toString().padStart(2, "0")} ${period}`;
}

// Convert elapsed restaurant seconds to a readable time
function formatShiftTime(seconds: number): string {
  const m = Math.floor(seconds);
  const s = Math.round((seconds - m) * 10) / 10;
  if (m >= 60) {
    const min = Math.floor(m / 60);
    const sec = m % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }
  return s > 0 ? `${m}.${Math.round(s * 10)}s` : `${m}s`;
}

// Generate a result detail string for a specific challenge
function getResultDetail(
  challengeId: string,
  completed: boolean,
  tradingTracker: TradingChallengeTracker,
  gameState: GameState,
  restaurantTracker?: RestaurantChallengeTracker,
): string {
  switch (challengeId) {
    case "profit_5_stocks": {
      const profitable = Object.entries(tradingTracker.profitByStock)
        .filter(([, p]) => p > 0)
        .sort((a, b) => b[1] - a[1]);
      if (completed) {
        return `Profited from ${profitable.length} stocks: ${profitable.map(([s, p]) => `${s} (+$${p.toFixed(0)})`).join(", ")}`;
      }
      return profitable.length > 0
        ? `Profited from ${profitable.length}/5 stocks: ${profitable.map(([s]) => s).join(", ")}`
        : "No profitable stocks traded";
    }
    case "no_selling": {
      if (completed) return "No stocks were sold all day";
      return tradingTracker.firstSellPlayer
        ? `${tradingTracker.firstSellPlayer} sold a stock`
        : "A stock was sold";
    }
    case "no_buying": {
      if (completed) return "No stocks were bought all day";
      return tradingTracker.firstBuyPlayer
        ? `${tradingTracker.firstBuyPlayer} bought a stock`
        : "A stock was bought";
    }
    case "tech_profit": {
      if (completed) return `Made $${tradingTracker.techProfit.toFixed(0)} from tech stocks`;
      return `Made $${tradingTracker.techProfit.toFixed(0)} / $100 from tech stocks`;
    }
    case "single_stock": {
      if (completed) return `Only traded ${tradingTracker.tradedStocks[0]}`;
      return `Traded ${tradingTracker.tradedStocks.length} stocks: ${tradingTracker.tradedStocks.join(", ")}`;
    }
    case "buy_at_low": {
      if (completed) {
        for (const buy of tradingTracker.buyPrices) {
          const stock = gameState.stocks.find((s) => s.symbol === buy.symbol);
          if (!stock) continue;
          const dayLow = Math.min(...stock.history);
          if (dayLow > 0 && buy.price <= dayLow * 1.1) {
            const playerStr = buy.playerName ? ` by ${buy.playerName}` : "";
            const timeStr = buy.tick > 0 ? ` at ${tickToTradingTime(buy.tick)}` : "";
            return `${buy.symbol} bought at $${buy.price.toFixed(2)}${playerStr}${timeStr} (daily low: $${dayLow.toFixed(2)})`;
          }
        }
      }
      // Find closest buy to daily low
      let closest = { symbol: "", pct: Infinity, price: 0, low: 0 };
      for (const buy of tradingTracker.buyPrices) {
        const stock = gameState.stocks.find((s) => s.symbol === buy.symbol);
        if (!stock) continue;
        const dayLow = Math.min(...stock.history);
        if (dayLow > 0) {
          const pct = (buy.price - dayLow) / dayLow;
          if (pct < closest.pct) closest = { symbol: buy.symbol, pct, price: buy.price, low: dayLow };
        }
      }
      if (closest.symbol) {
        return `Closest: ${closest.symbol} at $${closest.price.toFixed(2)} (${(closest.pct * 100).toFixed(0)}% above low of $${closest.low.toFixed(2)})`;
      }
      return "No stocks purchased";
    }
    case "sell_at_high": {
      if (completed) {
        for (const sell of tradingTracker.sellPrices) {
          const stock = gameState.stocks.find((s) => s.symbol === sell.symbol);
          if (!stock) continue;
          const dayHigh = Math.max(...stock.history);
          if (dayHigh > 0 && sell.price >= dayHigh * 0.9) {
            const playerStr = sell.playerName ? ` by ${sell.playerName}` : "";
            const timeStr = sell.tick > 0 ? ` at ${tickToTradingTime(sell.tick)}` : "";
            return `${sell.symbol} sold at $${sell.price.toFixed(2)}${playerStr}${timeStr} (daily high: $${dayHigh.toFixed(2)})`;
          }
        }
      }
      let closest = { symbol: "", pct: Infinity, price: 0, high: 0 };
      for (const sell of tradingTracker.sellPrices) {
        const stock = gameState.stocks.find((s) => s.symbol === sell.symbol);
        if (!stock) continue;
        const dayHigh = Math.max(...stock.history);
        if (dayHigh > 0) {
          const pct = (dayHigh - sell.price) / dayHigh;
          if (pct < closest.pct) closest = { symbol: sell.symbol, pct, price: sell.price, high: dayHigh };
        }
      }
      if (closest.symbol) {
        return `Closest: ${closest.symbol} at $${closest.price.toFixed(2)} (${(closest.pct * 100).toFixed(0)}% below high of $${closest.high.toFixed(2)})`;
      }
      return "No stocks sold";
    }
    case "big_trade": {
      if (completed) {
        const playerStr = tradingTracker.maxSingleTradePlayer ? ` by ${tradingTracker.maxSingleTradePlayer}` : "";
        return `$${tradingTracker.maxSingleTradeProfit.toFixed(0)} profit on ${tradingTracker.maxSingleTradeSymbol}${playerStr}`;
      }
      if (tradingTracker.maxSingleTradeProfit > 0) {
        return `Best trade: $${tradingTracker.maxSingleTradeProfit.toFixed(0)} / $200 on ${tradingTracker.maxSingleTradeSymbol}`;
      }
      return "No profitable trades made";
    }
    case "many_positions": {
      const count = gameState.portfolio.length;
      if (completed) return `Ended with ${count} open positions`;
      return `Ended with ${count} / 4 positions`;
    }
    case "no_news": {
      if (completed) return "Profited without viewing any news channels";
      if (tradingTracker.viewedNews) return "Viewed a news channel";
      return "Did not profit for the day";
    }
    case "big_day": {
      const portfolioValue = gameState.portfolio.reduce((sum, pos) => {
        const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
        return sum + (stock ? stock.price * pos.shares : 0);
      }, 0);
      const shortLiability = gameState.shorts.reduce((sum, pos) => {
        const stock = gameState.stocks.find((s) => s.symbol === pos.symbol);
        return sum + (stock ? stock.price * pos.shares : 0);
      }, 0);
      const shortCollateral = gameState.shorts.reduce((sum, pos) => sum + pos.entryPrice * pos.shares, 0);
      const netWorth = gameState.cash + portfolioValue + shortCollateral - shortLiability;
      const profit = netWorth - gameState.dayStartNetWorth;
      if (completed) return `Made $${profit.toFixed(0)} total profit`;
      return `Made $${profit.toFixed(0)} / $500 profit`;
    }
    case "options_profit": {
      if (completed) return `Made $${tradingTracker.optionsProfit.toFixed(0)} from options`;
      return `Made $${tradingTracker.optionsProfit.toFixed(0)} / $100 from options`;
    }
    case "limit_profit": {
      if (completed) return `Made $${tradingTracker.limitOrderProfit.toFixed(0)} from limit orders`;
      return `Made $${tradingTracker.limitOrderProfit.toFixed(0)} / $100 from limit orders`;
    }
    case "contrarian": {
      if (completed) {
        for (const buy of tradingTracker.contrarianBuys) {
          const stock = gameState.stocks.find((s) => s.symbol === buy.symbol);
          if (stock && stock.price > buy.buyPrice) {
            const playerStr = buy.playerName ? ` by ${buy.playerName}` : "";
            return `${buy.symbol} bought at $${buy.buyPrice.toFixed(2)} after bad news${playerStr}, now worth $${stock.price.toFixed(2)}`;
          }
        }
      }
      if (tradingTracker.contrarianBuys.length === 0) return "No stocks bought after bad news";
      return `Bought ${tradingTracker.contrarianBuys.length} stocks after bad news, none profited`;
    }
    // Restaurant challenges
    case "fast_3_orders": {
      const rt = restaurantTracker;
      if (!rt) return "";
      if (completed) return `Completed ${rt.fastCompletions} orders within 3 seconds`;
      return `Completed ${rt.fastCompletions} / 3 orders within 3 seconds`;
    }
    case "no_missed_tips": {
      const rt = restaurantTracker;
      if (!rt) return "";
      if (completed) return "All orders tipped — no patience ran out";
      if (rt.firstMissedTipOrder) {
        return `${rt.firstMissedTipOrder} had no tip at ${formatShiftTime(rt.firstMissedTipTime)} into the shift`;
      }
      return "A customer left no tip";
    }
    case "clutch_3": {
      const rt = restaurantTracker;
      if (!rt) return "";
      if (completed) return `Completed ${rt.clutchCompletions} orders with < 2s left`;
      return `Completed ${rt.clutchCompletions} / 3 clutch orders`;
    }
    case "multi_cook": {
      const rt = restaurantTracker;
      if (!rt) return "";
      if (completed) return `Had ${rt.maxCookingOrders} items cooking simultaneously`;
      return `Max simultaneous cooking: ${rt.maxCookingOrders} / 3`;
    }
    case "sub_second": {
      const rt = restaurantTracker;
      if (!rt) return "";
      if (completed) {
        return rt.fastestCompletionOrder
          ? `${rt.fastestCompletionOrder} completed in < 1 second`
          : "An order was completed in under 1 second";
      }
      if (rt.fastestCompletion < 9999) {
        return `Fastest order: ${rt.fastestCompletion.toFixed(1)}s (need < 1s)`;
      }
      return "No orders completed";
    }
    case "safe_timers": {
      const rt = restaurantTracker;
      if (!rt) return "";
      if (completed) return "No order timer dropped below 50%";
      if (rt.firstTimerBelow50Order) {
        return `${rt.firstTimerBelow50Order} dropped below 50% at ${formatShiftTime(rt.firstTimerBelow50Time)} into the shift`;
      }
      return "A timer dropped below 50%";
    }
    default:
      return "";
  }
}

// Evaluate all active challenges and return updated list with completion status and details
export function evaluateChallenges(
  challenges: ActiveChallenge[],
  tradingTracker: TradingChallengeTracker,
  gameState: GameState,
  restaurantTracker?: RestaurantChallengeTracker,
): ActiveChallenge[] {
  return challenges.map((ch) => {
    const def = ALL_CHALLENGES.find((d) => d.id === ch.id);
    if (!def) return ch;
    const completed = def.evaluate(tradingTracker, gameState, restaurantTracker);
    const resultDetail = getResultDetail(ch.id, completed, tradingTracker, gameState, restaurantTracker);
    return { ...ch, completed, resultDetail };
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

// Get tickets earned from completed challenges, split by type
// Trading challenges earn restaurant tickets, restaurant challenges earn trading tickets
export function getTicketsEarned(challenges: ActiveChallenge[]): { tradingTickets: number; restaurantTickets: number } {
  let tradingTickets = 0;
  let restaurantTickets = 0;
  for (const ch of challenges) {
    if (!ch.completed) continue;
    const def = ALL_CHALLENGES.find((d) => d.id === ch.id);
    if (!def) continue;
    if (def.type === "trading") {
      // Trading challenge → restaurant item tickets
      restaurantTickets += def.tickets;
    } else {
      // Restaurant challenge → trading item tickets
      tradingTickets += def.tickets;
    }
  }
  return { tradingTickets, restaurantTickets };
}
