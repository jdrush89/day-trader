import { GameState, NewsItem, Stock } from "./types";

const BUSINESS_HEADLINES = [
  { headline: "{stock} beats earnings expectations by 15%", sentiment: "positive" as const },
  { headline: "{stock} misses revenue targets, guidance lowered", sentiment: "negative" as const },
  { headline: "{stock} announces major acquisition", sentiment: "positive" as const },
  { headline: "{stock} CEO resigns amid controversy", sentiment: "negative" as const },
  { headline: "{stock} announces 1000 layoffs in restructuring", sentiment: "negative" as const },
  { headline: "{stock} lands massive government contract", sentiment: "positive" as const },
  { headline: "{stock} product recall affects Q3 outlook", sentiment: "negative" as const },
  { headline: "{stock} partnership with tech giant announced", sentiment: "positive" as const },
];

const GLOBAL_HEADLINES = [
  { headline: "Fed signals interest rate hike next quarter", sentiment: "negative" as const },
  { headline: "Trade tensions ease as new deal reached", sentiment: "positive" as const },
  { headline: "Oil prices surge on Middle East tensions", sentiment: "negative" as const },
  { headline: "GDP growth exceeds forecasts at 3.2%", sentiment: "positive" as const },
  { headline: "New tariffs announced on tech imports", sentiment: "negative" as const },
  { headline: "Central bank injects liquidity into markets", sentiment: "positive" as const },
  { headline: "Unemployment hits record low", sentiment: "positive" as const },
  { headline: "Supply chain disruptions worsen globally", sentiment: "negative" as const },
];

const SOCIAL_POSTS = [
  { headline: "🚀 {stock} to the moon!! DD inside 🚀🚀🚀", sentiment: "positive" as const },
  { headline: "Why {stock} is the next big short - proof inside", sentiment: "negative" as const },
  { headline: "{stock} insider just dumped shares 👀", sentiment: "negative" as const },
  { headline: "YOLO'd my life savings into {stock} calls", sentiment: "positive" as const },
  { headline: "Technical analysis shows {stock} breakout imminent", sentiment: "positive" as const },
  { headline: "{stock} is a total scam, here's why...", sentiment: "negative" as const },
];

let newsIdCounter = 0;

function generateNews(stocks: Stock[], category: NewsItem["category"]): NewsItem {
  const templates =
    category === "business"
      ? BUSINESS_HEADLINES
      : category === "global"
        ? GLOBAL_HEADLINES
        : SOCIAL_POSTS;

  const template = templates[Math.floor(Math.random() * templates.length)];
  const stock = stocks[Math.floor(Math.random() * stocks.length)];
  const headline = template.headline.replace("{stock}", stock.symbol);

  return {
    id: `news-${++newsIdCounter}`,
    headline,
    body: "",
    category,
    timestamp: Date.now(),
    affectedStocks: category !== "global" ? [stock.symbol] : undefined,
    sentiment: template.sentiment,
  };
}

function updateStockPrice(stock: Stock, news: NewsItem[]): Stock {
  const relevantNews = news.filter(
    (n) => n.affectedStocks?.includes(stock.symbol) || n.category === "global"
  );

  let momentum = (Math.random() - 0.5) * 2; // Base random walk

  for (const item of relevantNews) {
    const impact = item.category === "global" ? 0.5 : 1.5;
    momentum += item.sentiment === "positive" ? impact : -impact;
  }

  // Price changes as percentage
  const changePercent = momentum * 0.02;
  const newPrice = Math.max(0.01, stock.price * (1 + changePercent));
  const history = [...stock.history, newPrice].slice(-50);

  return { ...stock, price: Math.round(newPrice * 100) / 100, history };
}

export function tick(state: GameState): GameState {
  if (state.gameOver || !state.marketOpen) return state;

  const newTimeOfDay = state.timeOfDay + 1;

  // Generate news occasionally
  let newNews = [...state.news];
  if (Math.random() < 0.15) {
    const categories: NewsItem["category"][] = ["business", "global", "social"];
    const category = categories[Math.floor(Math.random() * categories.length)];
    newNews = [generateNews(state.stocks, category), ...newNews].slice(0, 20);
  }

  // Update stock prices
  const recentNews = newNews.filter(
    (n) => Date.now() - n.timestamp < 10000
  );
  const newStocks = state.stocks.map((s) => updateStockPrice(s, recentNews));

  // End of day
  if (newTimeOfDay >= 100) {
    const interest = state.loan * state.interestRate;
    const newCash = state.cash - interest;
    const portfolioValue = state.portfolio.reduce((sum, pos) => {
      const stock = newStocks.find((s) => s.symbol === pos.symbol);
      return sum + (stock ? stock.price * pos.shares : 0);
    }, 0);

    // Short positions: liability is current market value
    const shortLiability = state.shorts.reduce((sum, pos) => {
      const stock = newStocks.find((s) => s.symbol === pos.symbol);
      return sum + (stock ? stock.price * pos.shares : 0);
    }, 0);
    const shortCollateral = state.shorts.reduce(
      (sum, pos) => sum + pos.entryPrice * pos.shares,
      0
    );

    const gameOver = newCash + portfolioValue - shortLiability < 0;

    return {
      ...state,
      day: state.day + 1,
      cash: newCash,
      stocks: newStocks,
      news: newNews,
      timeOfDay: 0,
      marketOpen: false,
      gameOver,
      totalProfit: newCash + portfolioValue + shortCollateral - shortLiability - state.loan,
    };
  }

  return {
    ...state,
    stocks: newStocks,
    news: newNews,
    timeOfDay: newTimeOfDay,
  };
}

export function buyStock(state: GameState, symbol: string, shares: number): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  if (!stock) return state;

  const cost = stock.price * shares;
  if (cost > state.cash) return state;

  const existingPosition = state.portfolio.find((p) => p.symbol === symbol);
  let newPortfolio;

  if (existingPosition) {
    const totalShares = existingPosition.shares + shares;
    const totalCost = existingPosition.avgCost * existingPosition.shares + cost;
    newPortfolio = state.portfolio.map((p) =>
      p.symbol === symbol
        ? { ...p, shares: totalShares, avgCost: totalCost / totalShares }
        : p
    );
  } else {
    newPortfolio = [...state.portfolio, { symbol, shares, avgCost: stock.price }];
  }

  return { ...state, cash: state.cash - cost, portfolio: newPortfolio };
}

export function sellStock(state: GameState, symbol: string, shares: number): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  const position = state.portfolio.find((p) => p.symbol === symbol);
  if (!stock || !position || position.shares < shares) return state;

  const revenue = stock.price * shares;
  const remainingShares = position.shares - shares;

  const newPortfolio =
    remainingShares === 0
      ? state.portfolio.filter((p) => p.symbol !== symbol)
      : state.portfolio.map((p) =>
          p.symbol === symbol ? { ...p, shares: remainingShares } : p
        );

  return { ...state, cash: state.cash + revenue, portfolio: newPortfolio };
}

export function shortStock(state: GameState, symbol: string, shares: number): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  if (!stock) return state;

  // Require margin: must have enough cash to cover potential loss (100% collateral)
  const collateral = stock.price * shares;
  if (collateral > state.cash) return state;

  const existing = state.shorts.find((p) => p.symbol === symbol);
  let newShorts;

  if (existing) {
    const totalShares = existing.shares + shares;
    const totalEntry = existing.entryPrice * existing.shares + stock.price * shares;
    newShorts = state.shorts.map((p) =>
      p.symbol === symbol
        ? { ...p, shares: totalShares, entryPrice: totalEntry / totalShares }
        : p
    );
  } else {
    newShorts = [...state.shorts, { symbol, shares, entryPrice: stock.price }];
  }

  // Lock collateral from cash
  return { ...state, cash: state.cash - collateral, shorts: newShorts };
}

export function coverShort(state: GameState, symbol: string, shares: number): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  const position = state.shorts.find((p) => p.symbol === symbol);
  if (!stock || !position || position.shares < shares) return state;

  // Return collateral + profit (or - loss)
  // You get back your collateral, minus what it costs to buy back
  const netCash = state.cash + (position.entryPrice - stock.price) * shares + position.entryPrice * shares;

  const remainingShares = position.shares - shares;
  const newShorts =
    remainingShares === 0
      ? state.shorts.filter((p) => p.symbol !== symbol)
      : state.shorts.map((p) =>
          p.symbol === symbol ? { ...p, shares: remainingShares } : p
        );

  return { ...state, cash: netCash, shorts: newShorts };
}

export function openMarket(state: GameState): GameState {
  return { ...state, marketOpen: true };
}

export function purchaseUpgrade(state: GameState, upgradeId: string): GameState {
  const upgrade = state.upgrades.find((u) => u.id === upgradeId);
  if (!upgrade || upgrade.purchased || state.cash < upgrade.cost) return state;

  let newState = {
    ...state,
    cash: state.cash - upgrade.cost,
    upgrades: state.upgrades.map((u) =>
      u.id === upgradeId ? { ...u, purchased: true } : u
    ),
  };

  // Apply upgrade effect
  switch (upgrade.effect.type) {
    case "extra_monitor":
      newState.monitors = [
        ...newState.monitors,
        { id: newState.monitors.length, channel: "business_news" },
      ];
      break;
    case "lower_interest":
      newState.interestRate = Math.max(0.01, newState.interestRate - upgrade.effect.reduction);
      break;
  }

  return newState;
}
