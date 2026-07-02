import { GameState, NewsItem, Stock, EarningsData, NewsImpact, InsiderTip, PendingOrder, OrderSide, OrderType } from "./types";

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
  { headline: "BREAKING: Fed signals interest rate hike next quarter — markets brace for tightening", sentiment: "negative" as const, affectedTags: ["finance"] },
  { headline: "BREAKING: Trade deal reached between US and China — tariffs to be rolled back", sentiment: "positive" as const, affectedTags: ["tech"] },
  { headline: "ALERT: Oil prices surge 8% on Middle East conflict escalation — defense spending to skyrocket", sentiment: "negative" as const, affectedTags: ["energy"] },
  { headline: "DEVELOPING: GDP growth exceeds forecasts at 3.2% — strongest quarter in two years", sentiment: "positive" as const, affectedTags: ["large-cap"] },
  { headline: "BREAKING: New 25% tariffs announced on tech imports — semiconductor stocks in freefall", sentiment: "negative" as const, affectedTags: ["tech"] },
  { headline: "ALERT: Central bank announces emergency liquidity injection — $500B in stimulus", sentiment: "positive" as const, affectedTags: ["finance", "speculative"] },
  { headline: "DEVELOPING: Unemployment hits 50-year low at 3.1% — wage growth accelerating", sentiment: "positive" as const, affectedTags: ["consumer"] },
  { headline: "BREAKING: Global supply chain crisis deepens — shipping delays hit 6-month highs", sentiment: "negative" as const, affectedTags: ["retail"] },
  { headline: "ALERT: War unfolds in Eastern Europe — NATO activates rapid response force, defense spending to skyrocket", sentiment: "negative" as const, affectedTags: ["large-cap"] },
  { headline: "BREAKING: Inflation falls to 2.1% — Fed pivot expected, markets rally", sentiment: "positive" as const, affectedTags: ["banking"] },
  { headline: "DEVELOPING: Major bank collapse triggers contagion fears — regulators step in", sentiment: "negative" as const, affectedTags: ["banking"] },
  { headline: "ALERT: Historic climate accord signed — renewable energy subsidies tripled", sentiment: "positive" as const, affectedTags: ["renewable"] },
  { headline: "BREAKING: FDA fast-tracks approval for new drug class — pharma stocks surge", sentiment: "positive" as const, affectedTags: ["pharma"] },
  { headline: "ALERT: Social media regulation bill passes Senate — tech companies scramble", sentiment: "negative" as const, affectedTags: ["social-media"] },
  { headline: "BREAKING: Retail spending surges over holiday weekend — consumer confidence soars", sentiment: "positive" as const, affectedTags: ["retail", "consumer"] },
  { headline: "DEVELOPING: Small-cap rally as investors rotate out of mega-caps", sentiment: "positive" as const, affectedTags: ["small-cap"] },
];

const SOCIAL_TEMPLATES = [
  { headline: "🚀 {stock} to the moon!! DD inside 🚀🚀🚀", body: "I've been doing research for 3 weeks and {stock} is about to POP. Insiders are loading up, short interest is through the roof, and earnings are next week. This is not financial advice but I just put my entire portfolio in. LFG!!", author: "DiamondHands420", sentiment: "positive" as const },
  { headline: "Why {stock} is the next big short — proof inside", body: "Look at these financials. Revenue declining, debt piling up, and the CEO just sold 500k shares. This thing is going to zero. I'm loaded to the gills with puts. Screenshot your portfolios now, you'll want to remember this.", author: "BearKing99", sentiment: "negative" as const },
  { headline: "{stock} insider just mass-dumped shares 👀", body: "SEC filing just dropped. Three board members sold a combined $12M in stock last Tuesday. They know something we don't. Getting out before this thing craters.", author: "WatchTheInsiders", sentiment: "negative" as const },
  { headline: "YOLO'd my entire savings into {stock}", body: "Sold my car, cashed out my 401k, and put everything into {stock}. My wife doesn't know yet. Either I'm retiring next month or I'm sleeping in my office. No in between. Positions or ban.", author: "YOLO_or_Ramen", sentiment: "positive" as const },
  { headline: "Technical analysis shows {stock} breakout IMMINENT 📈", body: "Cup and handle forming on the daily, golden cross on the weekly, RSI bouncing off support. Every indicator I follow is screaming BUY. If this doesn't break out by Friday I'll eat my keyboard on stream.", author: "ChartWizard", sentiment: "positive" as const },
  { headline: "{stock} is a complete SCAM — here's why", body: "I used to work at {name} and let me tell you, the product doesn't work, the revenue is fake, and management is cooking the books. They're going to get delisted within 6 months. Don't say I didn't warn you.", author: "Whistleblower_X", sentiment: "negative" as const },
];

const INSIDER_TIP_TEMPLATES = [
  { text: "Overheard at the country club: {name}'s board is about to announce a massive buyback program. This thing is going to rip.", direction: "up" as const },
  { text: "My buddy on the {name} board says they're about to land a contract worth billions. Hasn't hit the press yet. You didn't hear this from me.", direction: "up" as const },
  { text: "A friend at the FDA told me {name}'s drug trial results are outstanding. Approval is basically guaranteed. This will double.", direction: "up" as const },
  { text: "Word from a {name} VP: next quarter's numbers are going to blow the doors off. They've been sandbagging guidance for months.", direction: "up" as const },
  { text: "Got a tip from my accountant friend at {name}: they're cooking the books. This is going to implode when the audit drops.", direction: "down" as const },
  { text: "Someone at {name} just told me the CEO is about to be indicted. SEC investigation has been going on for months. Get out now — or short it.", direction: "down" as const },
  { text: "Insider at {name} says their flagship product failed safety testing. Recall incoming. This stock is going to crater.", direction: "down" as const },
  { text: "My golf partner sits on {name}'s compensation committee. He says three C-suite execs just dumped all their shares. Something big is coming.", direction: "down" as const },
];

let insiderIdCounter = 0;

function generateInsiderTip(stocks: Stock[], day: number): InsiderTip {
  const stock = stocks[Math.floor(Math.random() * stocks.length)];
  const template = INSIDER_TIP_TEMPLATES[Math.floor(Math.random() * INSIDER_TIP_TEMPLATES.length)];
  return {
    id: `insider-${++insiderIdCounter}`,
    symbol: stock.symbol,
    companyName: stock.name,
    tipText: template.text.replace(/\{name\}/g, stock.name),
    direction: template.direction,
    day,
  };
}

let newsIdCounter = 0;

function generateImpact(
  category: NewsItem["category"],
  sentiment: "positive" | "negative",
  targetStock: Stock,
  _allStocks: Stock[],
  affectedTags?: string[]
): NewsImpact {
  const direction = sentiment === "positive" ? "up" : "down";
  const delay = 5; // 5 tick delay before effect kicks in
  const duration = 20; // 20 ticks of active effect

  if (category === "business") {
    const strength = Math.random() > 0.4 ? "strong" : "moderate";
    const probability = 0.7 + Math.random() * 0.2;
    const description = `${Math.round(probability * 100)}% chance of ${strength} price ${direction === "up" ? "surge" : "drop"} in ${targetStock.symbol}`;
    return {
      description,
      effects: [{ symbol: targetStock.symbol, direction, strength }],
      probability,
      delay,
      duration,
      ticksRemaining: delay + duration,
    };
  }

  if (category === "global") {
    const probability = 0.6 + Math.random() * 0.25;
    const tags = affectedTags ?? [];
    const strength = (Math.random() > 0.5 ? "moderate" : "weak") as "weak" | "moderate" | "strong";

    const effects: NewsImpact["effects"] = tags.map((t) => ({
      tag: t,
      direction: direction as "up" | "down",
      strength,
    }));

    if (effects.length === 0) {
      effects.push({ symbol: targetStock.symbol, direction, strength: "moderate" as const });
    }

    const tagList = tags.join(", ");
    const description = `${Math.round(probability * 100)}% chance: [${tagList}] stocks go ${direction}`;

    return {
      description,
      effects,
      probability,
      delay,
      duration,
      ticksRemaining: delay + duration,
    };
  }

  // Social
  const strength = "moderate";
  const probability = 0.5 + Math.random() * 0.3;
  const willSellOff = sentiment === "positive" && Math.random() > 0.6;
  let description = `${Math.round(probability * 100)}% chance of ${strength} price ${direction === "up" ? "surge" : "drop"} in ${targetStock.symbol}`;
  if (willSellOff) description += " followed by quick sell-off";

  return {
    description,
    effects: [{ symbol: targetStock.symbol, direction, strength }],
    probability,
    delay,
    duration,
    ticksRemaining: delay + duration,
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
    const impact = generateImpact(category, template.sentiment, stock, stocks, template.affectedTags);
    return {
      id: `news-${++newsIdCounter}`,
      headline: template.headline,
      body: "",
      category,
      timestamp: Date.now(),
      sentiment: template.sentiment,
      affectedTags: template.affectedTags,
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
    // Skip if still in delay period (effect hasn't kicked in yet)
    if (item.impact.ticksRemaining > item.impact.duration) continue;

    for (const effect of item.impact.effects) {
      // Match by symbol or by tag
      const matches = effect.symbol
        ? effect.symbol === stock.symbol
        : effect.tag
        ? stock.tags.includes(effect.tag)
        : false;
      if (!matches) continue;

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
  let insiderTip = state.insiderTip;

  // Generate insider tip once per day (early)
  if (newTimeOfDay <= 2 && !insiderTip) {
    insiderTip = generateInsiderTip(state.stocks, state.day);
  }

  // Inject insider tip as a hidden high-impact news event
  // This drives the stock move but doesn't appear in normal news channels
  if (insiderTip && newTimeOfDay === 3) {
    const insiderStock = state.stocks.find((s) => s.symbol === insiderTip!.symbol);
    if (insiderStock) {
      const impact: NewsImpact = {
        description: `INSIDER: 90% chance of strong price ${insiderTip.direction === "up" ? "surge" : "crash"} in ${insiderTip.symbol}`,
        effects: [{ symbol: insiderTip.symbol, direction: insiderTip.direction, strength: "strong" }],
        probability: 0.9,
        delay: 5,
        duration: 40,
        ticksRemaining: 45,
      };
      // Add as a hidden news item that drives prices but isn't shown in feeds
      newNews.push({
        id: `insider-impact-${insiderTip.id}`,
        headline: "",
        body: "",
        category: "business",
        timestamp: Date.now(),
        affectedStocks: [insiderTip.symbol],
        sentiment: insiderTip.direction === "up" ? "positive" : "negative",
        impact,
      });
    }
  }

  // Seed first stories early in the day
  if (newTimeOfDay <= 3) {
    if (!newNews.some((n) => n.category === "business")) {
      newNews = [generateNews(state.stocks, "business"), ...newNews];
    }
    if (!newNews.some((n) => n.category === "global")) {
      newNews = [generateNews(state.stocks, "global"), ...newNews];
    }
    if (!newNews.some((n) => n.category === "social")) {
      newNews = [generateNews(state.stocks, "social"), ...newNews];
    }
  }

  // Ongoing news generation
  if (Math.random() < 0.18) {
    const categories: NewsItem["category"][] = ["business", "global", "social"];
    const category = categories[Math.floor(Math.random() * categories.length)];
    newNews = [generateNews(state.stocks, category), ...newNews].slice(0, 30);
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

  // Process pending orders after price updates
  let postOrderState = processOrders({ ...state, stocks: newStocks, news: newNews });

  // End of day
  if (newTimeOfDay >= 100) {
    const interest = postOrderState.loan * postOrderState.interestRate;
    const newCash = postOrderState.cash - interest;
    const portfolioValue = postOrderState.portfolio.reduce((sum, pos) => {
      const stock = newStocks.find((s) => s.symbol === pos.symbol);
      return sum + (stock ? stock.price * pos.shares : 0);
    }, 0);

    // Short positions: liability is current market value
    const shortLiability = postOrderState.shorts.reduce((sum, pos) => {
      const stock = newStocks.find((s) => s.symbol === pos.symbol);
      return sum + (stock ? stock.price * pos.shares : 0);
    }, 0);
    const shortCollateral = postOrderState.shorts.reduce(
      (sum, pos) => sum + pos.entryPrice * pos.shares,
      0
    );

    const gameOver = newCash + portfolioValue - shortLiability < 0;

    // SEC fine check: only if player viewed the insider channel
    let secFine = null;
    let finalCash = newCash;
    if (postOrderState.insiderViewed && insiderTip) {
      const tipSymbol = insiderTip.symbol;
      const tipStock = newStocks.find((s) => s.symbol === tipSymbol);

      if (tipStock) {
        // Realized profit from sells/covers already tracked
        let totalInsiderProfit = postOrderState.insiderRealizedProfit;

        // Unrealized gains on long shares bought AFTER viewing (still held)
        const currentPos = postOrderState.portfolio.find((p) => p.symbol === tipSymbol);
        const snapPos = postOrderState.insiderSnapshotHoldings.find((p) => p.symbol === tipSymbol);
        const currentShares = currentPos?.shares ?? 0;
        const snapShares = snapPos?.shares ?? 0;
        if (currentShares > snapShares) {
          const newShares = currentShares - snapShares;
          totalInsiderProfit += (tipStock.price - currentPos!.avgCost) * newShares;
        }

        // Unrealized gains on short positions opened AFTER viewing (still open)
        const currentShort = postOrderState.shorts.find((p) => p.symbol === tipSymbol);
        const snapShort = postOrderState.insiderSnapshotShorts.find((p) => p.symbol === tipSymbol);
        const currentShortShares = currentShort?.shares ?? 0;
        const snapShortShares = snapShort?.shares ?? 0;
        if (currentShortShares > snapShortShares) {
          const newShortShares = currentShortShares - snapShortShares;
          totalInsiderProfit += (currentShort!.entryPrice - tipStock.price) * newShortShares;
        }

        if (totalInsiderProfit > 0) {
          const catchChance = Math.min(0.95, totalInsiderProfit / 3500 + 0.1);
          if (Math.random() < catchChance) {
            const fineMultiplier = 2 + Math.random();
            const fineAmount = Math.round(totalInsiderProfit * fineMultiplier * 100) / 100;
            secFine = {
              amount: fineAmount,
              symbol: tipSymbol,
              profit: Math.round(totalInsiderProfit * 100) / 100,
              day: state.day,
            };
            finalCash -= fineAmount;
          }
        }
      }
    }

    return {
      ...postOrderState,
      day: state.day + 1,
      cash: finalCash,
      stocks: newStocks,
      news: newNews,
      timeOfDay: 0,
      marketOpen: false,
      gameOver,
      totalProfit: finalCash + portfolioValue + shortCollateral - shortLiability - postOrderState.loan,
      insiderTip: null,
      insiderViewed: false,
      insiderViewedTick: 0,
      insiderSnapshotHoldings: [],
      insiderSnapshotShorts: [],
      insiderRealizedProfit: 0,
      pendingOrders: [], // clear all pending orders at end of day
      secFines: secFine ? [...postOrderState.secFines, secFine] : postOrderState.secFines,
    };
  }

  return {
    ...postOrderState,
    stocks: newStocks,
    news: newNews,
    timeOfDay: newTimeOfDay,
    insiderTip,
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

  // Track realized profit on insider stock (only shares bought after viewing)
  let insiderRealizedProfit = state.insiderRealizedProfit;
  if (state.insiderViewed && state.insiderTip && symbol === state.insiderTip.symbol) {
    const snapPos = state.insiderSnapshotHoldings.find((p) => p.symbol === symbol);
    const snapShares = snapPos?.shares ?? 0;
    // Only count shares beyond the snapshot as insider-traded
    const insiderShares = Math.max(0, Math.min(shares, position.shares - snapShares));
    if (insiderShares > 0) {
      const profit = (stock.price - position.avgCost) * insiderShares;
      insiderRealizedProfit += profit;
    }
  }

  return { ...state, cash: state.cash + revenue, portfolio: newPortfolio, insiderRealizedProfit };
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

  const netCash = state.cash + (position.entryPrice - stock.price) * shares + position.entryPrice * shares;

  const remainingShares = position.shares - shares;
  const newShorts =
    remainingShares === 0
      ? state.shorts.filter((p) => p.symbol !== symbol)
      : state.shorts.map((p) =>
          p.symbol === symbol ? { ...p, shares: remainingShares } : p
        );

  // Track realized profit on insider stock (only shorts opened after viewing)
  let insiderRealizedProfit = state.insiderRealizedProfit;
  if (state.insiderViewed && state.insiderTip && symbol === state.insiderTip.symbol) {
    const snapShort = state.insiderSnapshotShorts.find((p) => p.symbol === symbol);
    const snapShares = snapShort?.shares ?? 0;
    const insiderShares = Math.max(0, Math.min(shares, position.shares - snapShares));
    if (insiderShares > 0) {
      const profit = (position.entryPrice - stock.price) * insiderShares;
      insiderRealizedProfit += profit;
    }
  }

  return { ...state, cash: netCash, shorts: newShorts, insiderRealizedProfit };
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
    stocks: state.stocks.map((s) => ({
      ...s,
      openPrice: s.price,
      dailyHistory: [...s.dailyHistory, { day: state.day, close: s.price }],
      history: [s.price], // reset intraday history for new day
    })),
    dayStartNetWorth: netWorth,
    insiderTip: null,
    insiderViewed: false,
    insiderViewedTick: 0,
    insiderSnapshotHoldings: [],
    insiderSnapshotShorts: [],
    insiderRealizedProfit: 0,
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

let orderIdCounter = 0;

export function placeOrder(
  state: GameState,
  symbol: string,
  side: OrderSide,
  shares: number,
  orderType: OrderType,
  limitPrice?: number,
  stopPrice?: number,
): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  if (!stock || shares <= 0) return state;

  // Market orders execute immediately
  if (orderType === "market") {
    switch (side) {
      case "buy": return buyStock(state, symbol, shares);
      case "sell": return sellStock(state, symbol, shares);
      case "short": return shortStock(state, symbol, shares);
      case "cover": return coverShort(state, symbol, shares);
    }
  }

  const order: PendingOrder = {
    id: `order-${++orderIdCounter}-${Date.now()}`,
    symbol,
    side,
    shares,
    orderType,
    limitPrice,
    stopPrice,
    createdAt: state.timeOfDay,
    day: state.day,
  };

  return { ...state, pendingOrders: [...state.pendingOrders, order] };
}

export function cancelOrder(state: GameState, orderId: string): GameState {
  return {
    ...state,
    pendingOrders: state.pendingOrders.filter((o) => o.id !== orderId),
  };
}

export function processOrders(state: GameState): GameState {
  let newState = state;
  const remainingOrders: PendingOrder[] = [];

  for (const order of state.pendingOrders) {
    const stock = newState.stocks.find((s) => s.symbol === order.symbol);
    if (!stock) {
      remainingOrders.push(order);
      continue;
    }

    let shouldFill = false;

    if (order.orderType === "limit") {
      // Limit buy/short: fill when price drops to or below limit
      // Limit sell/cover: fill when price rises to or above limit
      if (order.side === "buy" || order.side === "short") {
        shouldFill = stock.price <= (order.limitPrice ?? 0);
      } else {
        shouldFill = stock.price >= (order.limitPrice ?? Infinity);
      }
    } else if (order.orderType === "stop-loss") {
      // Stop-loss sell: triggers when price drops to stop price
      // Stop-loss cover: triggers when price rises to stop price
      if (order.side === "sell") {
        shouldFill = stock.price <= (order.stopPrice ?? 0);
      } else if (order.side === "cover") {
        shouldFill = stock.price >= (order.stopPrice ?? Infinity);
      }
    }

    if (shouldFill) {
      switch (order.side) {
        case "buy": newState = buyStock(newState, order.symbol, order.shares); break;
        case "sell": newState = sellStock(newState, order.symbol, order.shares); break;
        case "short": newState = shortStock(newState, order.symbol, order.shares); break;
        case "cover": newState = coverShort(newState, order.symbol, order.shares); break;
      }
    } else {
      remainingOrders.push(order);
    }
  }

  return { ...newState, pendingOrders: remainingOrders };
}
