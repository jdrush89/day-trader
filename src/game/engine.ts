import { GameState, NewsItem, Stock, EarningsData, NewsImpact } from "./types";

interface BusinessTemplate {
  headline: string;
  body: string;
  sentiment: "positive" | "negative";
  earningsGen: (stock: Stock) => EarningsData;
}

const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    headline: "{stock} BEATS EARNINGS — Stock surges in after-hours",
    body: "{name} reported quarterly results that exceeded analyst expectations across all key metrics. The company cited strong consumer demand and operational efficiency.",
    sentiment: "positive",
    earningsGen: (s) => ({
      revenue: `$${(s.price * 12 + Math.random() * s.price * 5).toFixed(1)}M`,
      profit: `$${(s.price * 3 + Math.random() * s.price * 2).toFixed(1)}M`,
      growth: `+${(8 + Math.random() * 20).toFixed(1)}% YoY`,
      spending: `$${(s.price * 5 + Math.random() * s.price * 3).toFixed(1)}M`,
      guidance: "Raised full-year outlook",
    }),
  },
  {
    headline: "{stock} MISSES ON REVENUE — Guidance slashed",
    body: "{name} fell short of Wall Street estimates, reporting weaker-than-expected revenue. Management lowered forward guidance citing macroeconomic headwinds.",
    sentiment: "negative",
    earningsGen: (s) => ({
      revenue: `$${(s.price * 6 + Math.random() * s.price * 3).toFixed(1)}M`,
      profit: `-$${(Math.random() * s.price * 2).toFixed(1)}M`,
      growth: `-${(3 + Math.random() * 15).toFixed(1)}% YoY`,
      spending: `$${(s.price * 8 + Math.random() * s.price * 4).toFixed(1)}M`,
      guidance: "Lowered full-year outlook",
    }),
  },
  {
    headline: "{stock} ANNOUNCES MAJOR ACQUISITION",
    body: "{name} will acquire a competitor in an all-cash deal, expected to close next quarter. The move aims to consolidate market share and expand into new verticals.",
    sentiment: "positive",
    earningsGen: (s) => ({
      revenue: `$${(s.price * 10 + Math.random() * s.price * 4).toFixed(1)}M`,
      profit: `$${(s.price * 2 + Math.random() * s.price).toFixed(1)}M`,
      growth: `+${(5 + Math.random() * 12).toFixed(1)}% YoY`,
      spending: `$${(s.price * 15 + Math.random() * s.price * 8).toFixed(1)}M (incl. acquisition)`,
      guidance: "Accretive within 12 months",
    }),
  },
  {
    headline: "{stock} CEO RESIGNS — Board scrambles for replacement",
    body: "{name}'s CEO stepped down effective immediately amid an internal investigation. The board has appointed the CFO as interim leader while conducting an executive search.",
    sentiment: "negative",
    earningsGen: (s) => ({
      revenue: `$${(s.price * 9 + Math.random() * s.price * 3).toFixed(1)}M`,
      profit: `$${(s.price * 1.5 + Math.random() * s.price).toFixed(1)}M`,
      growth: `+${(1 + Math.random() * 5).toFixed(1)}% YoY`,
      spending: `$${(s.price * 7 + Math.random() * s.price * 3).toFixed(1)}M`,
      guidance: "Under review pending transition",
    }),
  },
  {
    headline: "{stock} CUTS 1,200 JOBS — Restructuring plan unveiled",
    body: "{name} announced a sweeping restructuring that will eliminate roughly 15% of its workforce. The company expects to save $200M annually but will take a one-time charge.",
    sentiment: "negative",
    earningsGen: (s) => ({
      revenue: `$${(s.price * 8 + Math.random() * s.price * 2).toFixed(1)}M`,
      profit: `-$${(s.price + Math.random() * s.price * 2).toFixed(1)}M (restructuring charge)`,
      growth: `-${(2 + Math.random() * 8).toFixed(1)}% YoY`,
      spending: `$${(s.price * 6 + Math.random() * s.price * 2).toFixed(1)}M`,
      guidance: "Cost savings expected next fiscal year",
    }),
  },
  {
    headline: "{stock} LANDS $2B GOVERNMENT CONTRACT",
    body: "{name} was awarded a multi-year contract with the Department of Defense, beating out three other finalists. Revenue from the deal will ramp over the next 18 months.",
    sentiment: "positive",
    earningsGen: (s) => ({
      revenue: `$${(s.price * 14 + Math.random() * s.price * 6).toFixed(1)}M`,
      profit: `$${(s.price * 4 + Math.random() * s.price * 2).toFixed(1)}M`,
      growth: `+${(12 + Math.random() * 25).toFixed(1)}% YoY`,
      spending: `$${(s.price * 6 + Math.random() * s.price * 2).toFixed(1)}M`,
      guidance: "Raised outlook on contract backlog",
    }),
  },
];

const GLOBAL_TEMPLATES = [
  { headline: "BREAKING: Fed signals interest rate hike next quarter — markets brace for tightening", sentiment: "negative" as const },
  { headline: "BREAKING: Trade deal reached between US and China — tariffs to be rolled back", sentiment: "positive" as const },
  { headline: "ALERT: Oil prices surge 8% on Middle East conflict escalation — defense spending to skyrocket", sentiment: "negative" as const },
  { headline: "DEVELOPING: GDP growth exceeds forecasts at 3.2% — strongest quarter in two years", sentiment: "positive" as const },
  { headline: "BREAKING: New 25% tariffs announced on tech imports — semiconductor stocks in freefall", sentiment: "negative" as const },
  { headline: "ALERT: Central bank announces emergency liquidity injection — $500B in stimulus", sentiment: "positive" as const },
  { headline: "DEVELOPING: Unemployment hits 50-year low at 3.1% — wage growth accelerating", sentiment: "positive" as const },
  { headline: "BREAKING: Global supply chain crisis deepens — shipping delays hit 6-month highs", sentiment: "negative" as const },
  { headline: "ALERT: War unfolds in Eastern Europe — NATO activates rapid response force, defense spending to skyrocket", sentiment: "negative" as const },
  { headline: "BREAKING: Inflation falls to 2.1% — Fed pivot expected, markets rally", sentiment: "positive" as const },
  { headline: "DEVELOPING: Major bank collapse triggers contagion fears — regulators step in", sentiment: "negative" as const },
  { headline: "ALERT: Historic climate accord signed — renewable energy subsidies tripled", sentiment: "positive" as const },
];

const SOCIAL_TEMPLATES = [
  { headline: "🚀 {stock} to the moon!! DD inside 🚀🚀🚀", body: "I've been doing research for 3 weeks and {stock} is about to POP. Insiders are loading up, short interest is through the roof, and earnings are next week. This is not financial advice but I just put my entire portfolio in. LFG!!", author: "DiamondHands420", sentiment: "positive" as const },
  { headline: "Why {stock} is the next big short — proof inside", body: "Look at these financials. Revenue declining, debt piling up, and the CEO just sold 500k shares. This thing is going to zero. I'm loaded to the gills with puts. Screenshot your portfolios now, you'll want to remember this.", author: "BearKing99", sentiment: "negative" as const },
  { headline: "{stock} insider just mass-dumped shares 👀", body: "SEC filing just dropped. Three board members sold a combined $12M in stock last Tuesday. They know something we don't. Getting out before this thing craters.", author: "WatchTheInsiders", sentiment: "negative" as const },
  { headline: "YOLO'd my entire savings into {stock}", body: "Sold my car, cashed out my 401k, and put everything into {stock}. My wife doesn't know yet. Either I'm retiring next month or I'm sleeping in my office. No in between. Positions or ban.", author: "YOLO_or_Ramen", sentiment: "positive" as const },
  { headline: "Technical analysis shows {stock} breakout IMMINENT 📈", body: "Cup and handle forming on the daily, golden cross on the weekly, RSI bouncing off support. Every indicator I follow is screaming BUY. If this doesn't break out by Friday I'll eat my keyboard on stream.", author: "ChartWizard", sentiment: "positive" as const },
  { headline: "{stock} is a complete SCAM — here's why", body: "I used to work at {name} and let me tell you, the product doesn't work, the revenue is fake, and management is cooking the books. They're going to get delisted within 6 months. Don't say I didn't warn you.", author: "Whistleblower_X", sentiment: "negative" as const },
];

let newsIdCounter = 0;

function generateImpact(
  category: NewsItem["category"],
  sentiment: "positive" | "negative",
  targetStock: Stock,
  allStocks: Stock[]
): NewsImpact {
  const direction = sentiment === "positive" ? "up" : "down";
  const oppositeDir = sentiment === "positive" ? "down" : "up";

  if (category === "business") {
    // Direct impact on the target stock
    const strength = Math.random() > 0.4 ? "strong" : "moderate";
    const probability = 0.7 + Math.random() * 0.2; // 70-90%
    const description = `${Math.round(probability * 100)}% chance of ${strength} price ${direction === "up" ? "surge" : "drop"} in ${targetStock.symbol}`;
    return {
      description,
      effects: [{ symbol: targetStock.symbol, direction, strength }],
      probability,
      duration: 8 + Math.floor(Math.random() * 7),
      ticksRemaining: 8 + Math.floor(Math.random() * 7),
    };
  }

  if (category === "global") {
    // Affects multiple or all stocks
    const probability = 0.6 + Math.random() * 0.25; // 60-85%
    const affectedCount = 3 + Math.floor(Math.random() * (allStocks.length - 2));
    const shuffled = [...allStocks].sort(() => Math.random() - 0.5).slice(0, affectedCount);

    // Some go with sentiment, some against (sector rotation)
    const effects = shuffled.map((s, i) => {
      const goesWithSentiment = i < Math.ceil(shuffled.length * 0.7);
      return {
        symbol: s.symbol,
        direction: (goesWithSentiment ? direction : oppositeDir) as "up" | "down",
        strength: (Math.random() > 0.5 ? "moderate" : "weak") as "weak" | "moderate" | "strong",
      };
    });

    const upCount = effects.filter((e) => e.direction === "up").length;
    const downCount = effects.filter((e) => e.direction === "down").length;
    let description = `${Math.round(probability * 100)}% chance: `;
    if (upCount > 0) description += `${effects.filter(e => e.direction === "up").map(e => e.symbol).join(", ")} go up`;
    if (upCount > 0 && downCount > 0) description += "; ";
    if (downCount > 0) description += `${effects.filter(e => e.direction === "down").map(e => e.symbol).join(", ")} go down`;

    return {
      description,
      effects,
      probability,
      duration: 10 + Math.floor(Math.random() * 10),
      ticksRemaining: 10 + Math.floor(Math.random() * 10),
    };
  }

  // Social: impact depends on virality; starts weak, strengthens if upvotes grow
  const strength = "moderate";
  const probability = 0.5 + Math.random() * 0.3; // 50-80%
  const willSellOff = sentiment === "positive" && Math.random() > 0.6;
  let description = `${Math.round(probability * 100)}% chance of ${strength} price ${direction === "up" ? "surge" : "drop"} in ${targetStock.symbol}`;
  if (willSellOff) description += " followed by quick sell-off";

  return {
    description,
    effects: [{ symbol: targetStock.symbol, direction, strength }],
    probability,
    duration: 12 + Math.floor(Math.random() * 8),
    ticksRemaining: 12 + Math.floor(Math.random() * 8),
  };
}

function generateNews(stocks: Stock[], category: NewsItem["category"]): NewsItem {
  const stock = stocks[Math.floor(Math.random() * stocks.length)];

  if (category === "business") {
    const template = BUSINESS_TEMPLATES[Math.floor(Math.random() * BUSINESS_TEMPLATES.length)];
    const impact = generateImpact(category, template.sentiment, stock, stocks);
    return {
      id: `news-${++newsIdCounter}`,
      headline: template.headline.replace("{stock}", stock.symbol),
      body: template.body.replace("{name}", stock.name),
      category,
      timestamp: Date.now(),
      affectedStocks: [stock.symbol],
      sentiment: template.sentiment,
      earnings: template.earningsGen(stock),
      impact,
    };
  }

  if (category === "global") {
    const template = GLOBAL_TEMPLATES[Math.floor(Math.random() * GLOBAL_TEMPLATES.length)];
    const impact = generateImpact(category, template.sentiment, stock, stocks);
    return {
      id: `news-${++newsIdCounter}`,
      headline: template.headline,
      body: "",
      category,
      timestamp: Date.now(),
      sentiment: template.sentiment,
      impact,
    };
  }

  // social
  const template = SOCIAL_TEMPLATES[Math.floor(Math.random() * SOCIAL_TEMPLATES.length)];
  const initialMomentum = Math.random() * 3 + 0.5;
  const impact = generateImpact(category, template.sentiment, stock, stocks);
  return {
    id: `news-${++newsIdCounter}`,
    headline: template.headline.replace(/\{stock\}/g, stock.symbol),
    body: template.body.replace(/\{stock\}/g, stock.symbol).replace(/\{name\}/g, stock.name),
    category,
    timestamp: Date.now(),
    affectedStocks: [stock.symbol],
    sentiment: template.sentiment,
    author: template.author,
    upvotes: Math.floor(Math.random() * 20 + 1),
    commentCount: Math.floor(Math.random() * 5),
    momentum: initialMomentum,
    impact,
  };
}

function updateStockPrice(stock: Stock, news: NewsItem[]): Stock {
  let momentum = (Math.random() - 0.5) * 1.5; // Base random walk (slightly reduced)

  // Apply impacts from active news
  for (const item of news) {
    if (!item.impact || item.impact.ticksRemaining <= 0) continue;

    for (const effect of item.impact.effects) {
      if (effect.symbol !== stock.symbol) continue;

      // Only fire with the given probability
      if (Math.random() > item.impact.probability) continue;

      let magnitude = effect.strength === "strong" ? 2.0 : effect.strength === "moderate" ? 1.2 : 0.5;

      // Social posts scale with upvotes
      if (item.category === "social" && item.upvotes != null) {
        const virality = Math.min(item.upvotes / 500, 4);
        magnitude *= 0.4 + virality * 0.4;
      }

      momentum += effect.direction === "up" ? magnitude : -magnitude;
    }
  }

  const changePercent = momentum * 0.015;
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

  // Simulate social post upvote growth each tick
  newNews = newNews.map((item) => {
    // Decrement impact ticks
    const updatedImpact = item.impact && item.impact.ticksRemaining > 0
      ? { ...item.impact, ticksRemaining: item.impact.ticksRemaining - 1 }
      : item.impact;

    if (item.category !== "social" || item.upvotes == null || item.momentum == null) {
      return updatedImpact !== item.impact ? { ...item, impact: updatedImpact } : item;
    }

    // Momentum decays over time but viral posts sustain longer
    const age = (Date.now() - item.timestamp) / 1000;
    const decayFactor = Math.max(0, 1 - age / 120); // fade over ~2 minutes
    const jitter = (Math.random() - 0.3) * item.momentum; // biased upward
    const newUpvotes = Math.max(
      item.upvotes,
      item.upvotes + Math.floor(jitter * decayFactor * 15)
    );
    const newComments = item.commentCount! + (Math.random() < 0.3 ? Math.floor(Math.random() * 3) : 0);

    // Small chance momentum spikes (post goes viral)
    let newMomentum = item.momentum * (0.98 + Math.random() * 0.04);
    if (Math.random() < 0.02) {
      newMomentum = item.momentum * (1.5 + Math.random());
    }

    return {
      ...item,
      upvotes: newUpvotes,
      commentCount: newComments,
      momentum: newMomentum,
      impact: updatedImpact,
    };
  });

  // Update stock prices using impact system
  const newStocks = state.stocks.map((s) => updateStockPrice(s, newNews));

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
  const portfolioValue = state.portfolio.reduce((sum, pos) => {
    const stock = state.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);
  const shortLiability = state.shorts.reduce((sum, pos) => {
    const stock = state.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);
  const shortCollateral = state.shorts.reduce(
    (sum, pos) => sum + pos.entryPrice * pos.shares, 0
  );
  const netWorth = state.cash + portfolioValue + shortCollateral - shortLiability;

  return {
    ...state,
    marketOpen: true,
    stocks: state.stocks.map((s) => ({ ...s, openPrice: s.price })),
    dayStartNetWorth: netWorth,
  };
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
