import { GameState, NewsItem, Stock, EarningsData, NewsImpact, InsiderTip, PendingOrder, OrderSide, OrderType, DailyPrice, InstitutionalOrder, Position, OptionsContract } from "./types";
import { STOCK_POOL, StockCandidate } from "./stock-pool";
import { UPGRADE_POOL } from "./upgrades";

// Milestone: every 3 days, player must reach this net worth or lose
// Day 3: $1500, Day 6: $2500, Day 9: $4000, etc.
export function getMilestone(day: number): { checkDay: number; required: number } | null {
  const nextCheck = Math.ceil(day / 3) * 3;
  const milestoneNum = nextCheck / 3;
  return {
    checkDay: nextCheck,
    required: 1000 + 250 * milestoneNum * (milestoneNum + 1),
  };
}

export function upgradeCount(state: GameState, id: string): number {
  return state.acquiredUpgrades.filter((u) => u === id).length;
}

export function hasUpgrade(state: GameState, id: string): boolean {
  return state.acquiredUpgrades.includes(id);
}

function getPortfolioValue(state: GameState): number {
  return state.portfolio.reduce((sum, pos) => {
    const stock = state.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);
}

function getShortCollateral(state: GameState): number {
  return state.shorts.reduce((sum, pos) => sum + pos.entryPrice * pos.shares, 0);
}

function getShortLiability(state: GameState): number {
  return state.shorts.reduce((sum, pos) => {
    const stock = state.stocks.find((s) => s.symbol === pos.symbol);
    return sum + (stock ? stock.price * pos.shares : 0);
  }, 0);
}

function getNetWorth(state: GameState): number {
  return state.cash + getPortfolioValue(state) + getShortCollateral(state) - getShortLiability(state) + getOptionsValue(state);
}

export function getBuyingPower(state: GameState): number {
  const marginStacks = upgradeCount(state, "margin");
  if (marginStacks === 0) return state.cash;
  const portfolioValue = getPortfolioValue(state);
  const shortCollateral = getShortCollateral(state);
  return state.cash + (portfolioValue + shortCollateral) * 0.5 * marginStacks;
}

// --- Options Pricing (simplified Black-Scholes) ---

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + sign * y);
}

/** Estimate volatility from a stock's recent price history */
function estimateVolatility(stock: Stock): number {
  const prices = stock.dailyHistory.length > 1
    ? stock.dailyHistory.slice(-30).map((d) => d.close)
    : stock.history.length > 5
    ? stock.history.slice(-50)
    : [stock.price];
  if (prices.length < 2) return 0.4; // default medium volatility
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  if (returns.length === 0) return 0.4;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  // Annualize: multiply by sqrt(252 trading days)
  return Math.max(0.15, Math.min(1.5, Math.sqrt(variance) * Math.sqrt(252)));
}

/** Calculate option premium using Black-Scholes model */
export function calculateOptionPremium(
  spotPrice: number,
  strikePrice: number,
  daysToExpiry: number,
  type: "call" | "put",
  volatility: number,
): number {
  const r = 0.05; // risk-free rate
  const T = Math.max(daysToExpiry / 252, 0.004); // time in years (min ~1 day)
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spotPrice / strikePrice) + (r + volatility * volatility / 2) * T) / (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;

  let premium: number;
  if (type === "call") {
    premium = spotPrice * normalCDF(d1) - strikePrice * Math.exp(-r * T) * normalCDF(d2);
  } else {
    premium = strikePrice * Math.exp(-r * T) * normalCDF(-d2) - spotPrice * normalCDF(-d1);
  }

  // Floor at intrinsic value
  const intrinsic = type === "call"
    ? Math.max(0, spotPrice - strikePrice)
    : Math.max(0, strikePrice - spotPrice);
  premium = Math.max(premium, intrinsic + 0.01);

  return Math.round(premium * 100) / 100;
}

/** Get the current market value of an options contract */
export function getOptionValue(contract: OptionsContract, stock: Stock, currentDay: number): number {
  const daysLeft = Math.max(0, contract.expirationDay - currentDay);
  if (daysLeft === 0) {
    // At expiration, value is intrinsic only
    const intrinsic = contract.type === "call"
      ? Math.max(0, stock.price - contract.strikePrice)
      : Math.max(0, contract.strikePrice - stock.price);
    return intrinsic;
  }
  const vol = estimateVolatility(stock);
  return calculateOptionPremium(stock.price, contract.strikePrice, daysLeft, contract.type, vol);
}

let optionIdCounter = 0;

export function buyOption(
  state: GameState,
  symbol: string,
  type: "call" | "put",
  strikePrice: number,
  expirationDays: number,
  contracts: number,
): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  if (!stock || contracts <= 0 || expirationDays < 1 || expirationDays > 7) return state;
  const vol = estimateVolatility(stock);
  const premiumPerShare = calculateOptionPremium(stock.price, strikePrice, expirationDays, type, vol);
  const totalCost = premiumPerShare * contracts * 100; // each contract = 100 shares
  if (totalCost > getBuyingPower(state)) return state;

  const option: OptionsContract = {
    id: `opt-${++optionIdCounter}-${Date.now()}`,
    symbol,
    type,
    strikePrice: Math.round(strikePrice * 100) / 100,
    expirationDay: state.day + expirationDays,
    premium: premiumPerShare,
    contracts,
    side: "long",
    dayOpened: state.day,
  };

  return {
    ...state,
    cash: state.cash - totalCost,
    optionsPositions: [...state.optionsPositions, option],
    recentTrades: pushRecent(state.recentTrades, symbol),
  };
}

export function sellOption(
  state: GameState,
  symbol: string,
  type: "call" | "put",
  strikePrice: number,
  expirationDays: number,
  contracts: number,
): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  if (!stock || contracts <= 0 || expirationDays < 1 || expirationDays > 7) return state;
  const vol = estimateVolatility(stock);
  const premiumPerShare = calculateOptionPremium(stock.price, strikePrice, expirationDays, type, vol);
  const totalPremium = premiumPerShare * contracts * 100;
  // Writing options requires collateral equal to the premium collected
  const collateralRequired = totalPremium;
  if (collateralRequired > getBuyingPower(state)) return state;

  const option: OptionsContract = {
    id: `opt-${++optionIdCounter}-${Date.now()}`,
    symbol,
    type,
    strikePrice: Math.round(strikePrice * 100) / 100,
    expirationDay: state.day + expirationDays,
    premium: premiumPerShare,
    contracts,
    side: "short",
    dayOpened: state.day,
  };

  return {
    ...state,
    cash: state.cash + totalPremium,
    optionsPositions: [...state.optionsPositions, option],
    recentTrades: pushRecent(state.recentTrades, symbol),
  };
}

export function closeOption(state: GameState, optionId: string): GameState {
  const option = state.optionsPositions.find((o) => o.id === optionId);
  if (!option) return state;
  const stock = state.stocks.find((s) => s.symbol === option.symbol);
  if (!stock) return state;

  const currentValue = getOptionValue(option, stock, state.day);
  const valuePerContract = currentValue * 100;

  let cashDelta: number;
  if (option.side === "long") {
    // Selling back a long option: receive current value
    cashDelta = valuePerContract * option.contracts;
  } else {
    // Buying back a short option: pay current value
    cashDelta = -valuePerContract * option.contracts;
    if (state.cash + cashDelta < 0 && cashDelta < 0) return state; // can't afford buyback
  }

  return {
    ...state,
    cash: state.cash + cashDelta,
    optionsPositions: state.optionsPositions.filter((o) => o.id !== optionId),
  };
}

/** Process options at end of day — expire or exercise ITM options */
function processOptionsExpiration(state: GameState): GameState {
  const expiring = state.optionsPositions.filter((o) => o.expirationDay <= state.day);
  const remaining = state.optionsPositions.filter((o) => o.expirationDay > state.day);

  let cash = state.cash;
  for (const option of expiring) {
    const stock = state.stocks.find((s) => s.symbol === option.symbol);
    if (!stock) continue;

    const intrinsic = option.type === "call"
      ? Math.max(0, stock.price - option.strikePrice)
      : Math.max(0, option.strikePrice - stock.price);

    const payout = intrinsic * option.contracts * 100;

    if (option.side === "long") {
      // Long options: receive intrinsic value (auto-exercise if ITM)
      cash += payout;
    } else {
      // Short options: pay intrinsic value if ITM
      cash -= payout;
    }
  }

  return { ...state, cash, optionsPositions: remaining };
}

/** Get total options exposure for net worth calculation */
export function getOptionsValue(state: GameState): number {
  return state.optionsPositions.reduce((sum, option) => {
    const stock = state.stocks.find((s) => s.symbol === option.symbol);
    if (!stock) return sum;
    const value = getOptionValue(option, stock, state.day) * option.contracts * 100;
    return sum + (option.side === "long" ? value : -value);
  }, 0);
}

function isTipSymbol(state: GameState, symbol: string): boolean {
  return [state.insiderTip?.symbol, state.insiderTip2?.symbol].filter(Boolean).includes(symbol);
}

function getViewedTipSymbols(state: GameState): string[] {
  return Array.from(new Set([state.insiderTip?.symbol, state.insiderTip2?.symbol].filter(Boolean) as string[]));
}

function applyProfitModifiers(state: GameState, stock: Stock, position: Position, profit: number): number {
  let adjusted = profit;
  if (profit > 0) {
    if (hasUpgrade(state, "super_chip") && stock.tags.includes("tech")) adjusted *= 1.15;
    if (hasUpgrade(state, "penny_picker") && stock.tags.includes("speculative")) adjusted *= 1.2;
    if (hasUpgrade(state, "green_thumb") && (stock.tags.includes("green") || stock.tags.includes("renewable"))) adjusted *= 1.15;
    if (hasUpgrade(state, "pharma_bro") && stock.tags.includes("healthcare")) adjusted *= 1.15;
    if (hasUpgrade(state, "war_profiteer") && stock.tags.includes("defense")) adjusted *= 1.15;
    if (hasUpgrade(state, "day_trader") && position.dayAcquired === state.day) adjusted *= 1.05;
  } else if (profit < 0) {
    if (hasUpgrade(state, "small_biz_medal") && stock.tags.includes("small-cap")) adjusted *= 0.8;
  }
  return adjusted;
}

function generateInstitutionalOrders(stocks: Stock[]): InstitutionalOrder[] {
  const firms = ["Goldman Sachs", "BlackRock", "Citadel", "Bridgewater", "Vanguard"];
  const pool = [...stocks];
  const orders: InstitutionalOrder[] = [];
  const count = Math.min(3, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const stock = pool.splice(idx, 1)[0];
    orders.push({ firm: firms[Math.floor(Math.random() * firms.length)], symbol: stock.symbol, side: Math.random() > 0.45 ? "buy" : "sell", shares: (Math.floor(Math.random() * 8) + 2) * 2500 });
  }
  return orders;
}

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
  // Finance
  { headline: "BREAKING: Fed signals interest rate hike next quarter — markets brace for tightening", sentiment: "negative" as const, affectedTags: ["finance"] },
  { headline: "ALERT: Central bank announces emergency liquidity injection — $500B in stimulus", sentiment: "positive" as const, affectedTags: ["finance", "speculative"] },
  { headline: "BREAKING: Inflation falls to 2.1% — Fed pivot expected, markets rally", sentiment: "positive" as const, affectedTags: ["banking"] },
  { headline: "DEVELOPING: Major bank collapse triggers contagion fears — regulators step in", sentiment: "negative" as const, affectedTags: ["banking"] },
  { headline: "BREAKING: Fintech disruption accelerates — digital payments volume doubles", sentiment: "positive" as const, affectedTags: ["fintech"] },
  { headline: "ALERT: Crypto exchange scandal sparks fintech regulatory crackdown", sentiment: "negative" as const, affectedTags: ["fintech"] },

  // Tech
  { headline: "BREAKING: Trade deal reached between US and China — tariffs to be rolled back", sentiment: "positive" as const, affectedTags: ["tech"] },
  { headline: "BREAKING: New 25% tariffs announced on tech imports — semiconductor stocks in freefall", sentiment: "negative" as const, affectedTags: ["semiconductor"] },
  { headline: "ALERT: AI regulation bill passes committee — new compliance requirements for AI companies", sentiment: "negative" as const, affectedTags: ["ai"] },
  { headline: "DEVELOPING: Breakthrough in AI capabilities drives enterprise adoption surge", sentiment: "positive" as const, affectedTags: ["ai", "enterprise"] },
  { headline: "BREAKING: Major cloud outage disrupts services worldwide — infrastructure stocks slide", sentiment: "negative" as const, affectedTags: ["cloud"] },
  { headline: "DEVELOPING: Cloud spending hits record $150B — hyperscalers can't keep up with demand", sentiment: "positive" as const, affectedTags: ["cloud"] },
  { headline: "ALERT: Critical zero-day exploit hits Fortune 500 — cybersecurity spending to surge", sentiment: "positive" as const, affectedTags: ["cybersecurity"] },
  { headline: "BREAKING: 5G rollout reaches 80% coverage nationwide — telecom revenues surge", sentiment: "positive" as const, affectedTags: ["telecom"] },
  { headline: "DEVELOPING: Telecom price war intensifies — margins under pressure", sentiment: "negative" as const, affectedTags: ["telecom"] },

  // Energy
  { headline: "ALERT: Oil prices surge 8% on Middle East conflict escalation", sentiment: "positive" as const, affectedTags: ["oil"] },
  { headline: "BREAKING: Oil glut sends crude prices to 3-year low — OPEC emergency meeting called", sentiment: "negative" as const, affectedTags: ["oil"] },
  { headline: "ALERT: Historic climate accord signed — renewable energy subsidies tripled", sentiment: "positive" as const, affectedTags: ["renewable", "green"] },
  { headline: "DEVELOPING: Green energy mandate passed — all new construction must be carbon neutral", sentiment: "positive" as const, affectedTags: ["green"] },
  { headline: "ALERT: Energy crisis deepens — rolling blackouts across major cities", sentiment: "negative" as const, affectedTags: ["energy"] },
  { headline: "BREAKING: Mining boom as rare earth demand outpaces supply — prices skyrocket", sentiment: "positive" as const, affectedTags: ["mining"] },
  { headline: "DEVELOPING: Environmental protests shut down mining operations in three states", sentiment: "negative" as const, affectedTags: ["mining"] },

  // Healthcare
  { headline: "BREAKING: FDA fast-tracks approval for new drug class — pharma stocks surge", sentiment: "positive" as const, affectedTags: ["pharma"] },
  { headline: "ALERT: Generic drug ruling slashes pharma revenues — patent protections weakened", sentiment: "negative" as const, affectedTags: ["pharma"] },
  { headline: "DEVELOPING: Breakthrough gene therapy shows 95% efficacy — biotech revolution begins", sentiment: "positive" as const, affectedTags: ["biotech"] },
  { headline: "ALERT: Clinical trial failures rock biotech sector — two major drugs pulled", sentiment: "negative" as const, affectedTags: ["biotech"] },
  { headline: "BREAKING: Universal healthcare bill advances — hospital and insurance stocks react", sentiment: "negative" as const, affectedTags: ["healthcare"] },
  { headline: "DEVELOPING: Aging population drives healthcare spending to new highs", sentiment: "positive" as const, affectedTags: ["healthcare"] },

  // Consumer / Retail
  { headline: "DEVELOPING: Unemployment hits 50-year low at 3.1% — wage growth accelerating", sentiment: "positive" as const, affectedTags: ["consumer"] },
  { headline: "BREAKING: Retail spending surges over holiday weekend — consumer confidence soars", sentiment: "positive" as const, affectedTags: ["retail", "consumer"] },
  { headline: "BREAKING: Global supply chain crisis deepens — shipping delays hit 6-month highs", sentiment: "negative" as const, affectedTags: ["retail", "logistics"] },
  { headline: "ALERT: Food prices spike 12% on drought — agricultural commodities at decade high", sentiment: "negative" as const, affectedTags: ["food"] },
  { headline: "DEVELOPING: Plant-based food market doubles — major chains adopt alt-protein menus", sentiment: "positive" as const, affectedTags: ["food"] },
  { headline: "BREAKING: Gaming industry hits $200B — streaming and esports drive growth", sentiment: "positive" as const, affectedTags: ["gaming", "entertainment"] },
  { headline: "ALERT: Streaming wars escalate — entertainment stocks volatile as subscribers shift", sentiment: "negative" as const, affectedTags: ["entertainment"] },
  { headline: "DEVELOPING: Box office records shattered — entertainment spending at all-time high", sentiment: "positive" as const, affectedTags: ["entertainment"] },

  // Social Media
  { headline: "ALERT: Social media regulation bill passes Senate — tech companies scramble", sentiment: "negative" as const, affectedTags: ["social-media"] },
  { headline: "DEVELOPING: Social media ad revenue surges 30% — digital advertising boom continues", sentiment: "positive" as const, affectedTags: ["social-media"] },

  // Defense / Manufacturing
  { headline: "BREAKING: Pentagon announces $800B defense budget — largest in history", sentiment: "positive" as const, affectedTags: ["defense"] },
  { headline: "DEVELOPING: Peace accord reduces defense spending outlook — military contractors slide", sentiment: "negative" as const, affectedTags: ["defense"] },
  { headline: "ALERT: Manufacturing renaissance — reshoring initiative brings factories back to US", sentiment: "positive" as const, affectedTags: ["manufacturing"] },
  { headline: "BREAKING: Steel tariffs imposed — manufacturing costs surge across sectors", sentiment: "negative" as const, affectedTags: ["manufacturing"] },
  { headline: "DEVELOPING: Logistics boom as e-commerce doubles — shipping and freight capacity maxed", sentiment: "positive" as const, affectedTags: ["logistics"] },
  { headline: "ALERT: Port strike cripples global logistics — container shipping rates triple", sentiment: "negative" as const, affectedTags: ["logistics"] },

  // Real Estate
  { headline: "BREAKING: Housing market crash fears grow — mortgage rates hit 8%", sentiment: "negative" as const, affectedTags: ["real-estate"] },
  { headline: "DEVELOPING: Commercial real estate boom — office vacancy rates plummet", sentiment: "positive" as const, affectedTags: ["real-estate"] },

  // Market-wide
  { headline: "DEVELOPING: GDP growth exceeds forecasts at 3.2% — strongest quarter in two years", sentiment: "positive" as const, affectedTags: ["large-cap"] },
  { headline: "ALERT: War unfolds in Eastern Europe — NATO activates rapid response force", sentiment: "negative" as const, affectedTags: ["large-cap", "defense"] },
  { headline: "DEVELOPING: Small-cap rally as investors rotate out of mega-caps", sentiment: "positive" as const, affectedTags: ["small-cap"] },
  { headline: "ALERT: Mid-cap stocks surge on earnings season surprises — sector rotation underway", sentiment: "positive" as const, affectedTags: ["mid-cap"] },
  { headline: "DEVELOPING: Speculative bubble warnings from economists — meme stocks under scrutiny", sentiment: "negative" as const, affectedTags: ["speculative"] },
  { headline: "BREAKING: Enterprise software spending surges — digital transformation accelerates", sentiment: "positive" as const, affectedTags: ["enterprise"] },
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

function generateInsiderTip(stocks: Stock[], day: number, excludedSymbols: string[] = []): InsiderTip {
  const available = stocks.filter((stock) => !excludedSymbols.includes(stock.symbol));
  const pool = available.length > 0 ? available : stocks;
  const stock = pool[Math.floor(Math.random() * pool.length)];
  const template = INSIDER_TIP_TEMPLATES[Math.floor(Math.random() * INSIDER_TIP_TEMPLATES.length)];
  return { id: `insider-${++insiderIdCounter}`, symbol: stock.symbol, companyName: stock.name, tipText: template.text.replace(/\{name\}/g, stock.name), direction: template.direction, day };
}

let newsIdCounter = 0;

function generateImpact(
  category: NewsItem["category"],
  sentiment: "positive" | "negative",
  targetStock: Stock,
  _allStocks: Stock[],
  affectedTags?: string[],
  rumorMill: boolean = false,
): NewsImpact {
  const direction = sentiment === "positive" ? "up" : "down";
  const delay = category === "social" && rumorMill ? 0 : 5;
  const duration = 20;
  if (category === "business") {
    const strength = Math.random() > 0.4 ? "strong" : "moderate";
    const probability = 0.7 + Math.random() * 0.2;
    const description = `${Math.round(probability * 100)}% chance of ${strength} price ${direction === "up" ? "surge" : "drop"} in ${targetStock.symbol}`;
    return { description, effects: [{ symbol: targetStock.symbol, direction, strength }], probability, delay, duration, ticksRemaining: delay + duration };
  }
  if (category === "global") {
    const probability = 0.6 + Math.random() * 0.25;
    const tags = affectedTags ?? [];
    const strength = (Math.random() > 0.5 ? "moderate" : "weak") as "weak" | "moderate" | "strong";
    const effects: NewsImpact["effects"] = tags.map((t) => ({ tag: t, direction, strength }));
    if (effects.length === 0) effects.push({ symbol: targetStock.symbol, direction, strength: "moderate" });
    const description = `${Math.round(probability * 100)}% chance: [${tags.join(", ")}] stocks go ${direction}`;
    return { description, effects, probability, delay, duration, ticksRemaining: delay + duration };
  }
  const strength = "moderate";
  const probability = 0.5 + Math.random() * 0.3;
  const willSellOff = sentiment === "positive" && Math.random() > 0.6;
  let description = `${Math.round(probability * 100)}% chance of ${strength} price ${direction === "up" ? "surge" : "drop"} in ${targetStock.symbol}`;
  if (willSellOff) description += " followed by quick sell-off";
  return { description, effects: [{ symbol: targetStock.symbol, direction, strength }], probability, delay, duration, ticksRemaining: delay + duration };
}

function generateNews(stocks: Stock[], category: NewsItem["category"], rumorMill: boolean = false): NewsItem {
  const stock = stocks[Math.floor(Math.random() * stocks.length)];
  if (category === "business") {
    const template = BUSINESS_TEMPLATES[Math.floor(Math.random() * BUSINESS_TEMPLATES.length)];
    const impact = generateImpact(category, template.sentiment, stock, stocks, undefined, rumorMill);
    return { id: `news-${++newsIdCounter}`, headline: template.headline.replace("{stock}", stock.symbol), body: template.body.replace("{name}", stock.name), category, timestamp: Date.now(), affectedStocks: [stock.symbol], sentiment: template.sentiment, earnings: template.earningsGen(stock), impact };
  }
  if (category === "global") {
    // Only pick templates whose tags match at least one stock in the market
    const allTags = new Set(stocks.flatMap((s) => s.tags));
    const relevant = GLOBAL_TEMPLATES.filter((t) => t.affectedTags.some((tag) => allTags.has(tag)));
    const pool = relevant.length > 0 ? relevant : GLOBAL_TEMPLATES;
    const template = pool[Math.floor(Math.random() * pool.length)];
    const impact = generateImpact(category, template.sentiment, stock, stocks, template.affectedTags, rumorMill);
    return { id: `news-${++newsIdCounter}`, headline: template.headline, body: "", category, timestamp: Date.now(), sentiment: template.sentiment, affectedTags: template.affectedTags, impact };
  }
  const template = SOCIAL_TEMPLATES[Math.floor(Math.random() * SOCIAL_TEMPLATES.length)];
  const initialMomentum = Math.random() * 3 + 0.5;
  const impact = generateImpact(category, template.sentiment, stock, stocks, undefined, rumorMill);
  return { id: `news-${++newsIdCounter}`, headline: template.headline.replace(/\{stock\}/g, stock.symbol), body: template.body.replace(/\{stock\}/g, stock.symbol).replace(/\{name\}/g, stock.name), category, timestamp: Date.now(), affectedStocks: [stock.symbol], sentiment: template.sentiment, author: template.author, upvotes: Math.floor(Math.random() * 20 + 1), commentCount: Math.floor(Math.random() * 5), momentum: initialMomentum, impact };
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
  let workingState = state;
  const newTimeOfDay = workingState.timeOfDay + 1;

  if (hasUpgrade(workingState, "stop_loss_ins") && workingState.stopLossEnabled) {
    for (const position of [...workingState.portfolio]) {
      const stock = workingState.stocks.find((s) => s.symbol === position.symbol);
      if (stock && stock.price <= position.avgCost * 0.85) workingState = sellStock(workingState, position.symbol, position.shares);
    }
  }

  if (hasUpgrade(workingState, "royalties")) {
    const royalties = workingState.portfolio.reduce((sum, pos) => {
      const stock = workingState.stocks.find((s) => s.symbol === pos.symbol);
      return stock && stock.tags.includes("entertainment") ? sum + pos.shares * 5 : sum;
    }, 0);
    if (royalties > 0) workingState = { ...workingState, cash: workingState.cash + royalties };
  }

  const rumorMill = hasUpgrade(workingState, "rumor_mill");
  let newNews = [...workingState.news];
  let insiderTip = workingState.insiderTip;
  let insiderTip2 = workingState.insiderTip2;
  let institutionalOrders = hasUpgrade(workingState, "dark_pool") ? [...workingState.institutionalOrders] : [];

  if (newTimeOfDay <= 2 && !insiderTip) insiderTip = generateInsiderTip(workingState.stocks, workingState.day);
  if (newTimeOfDay <= 2 && hasUpgrade(workingState, "insider_rolodex") && !insiderTip2) insiderTip2 = generateInsiderTip(workingState.stocks, workingState.day, insiderTip ? [insiderTip.symbol] : []);

  if (newTimeOfDay === 3) {
    for (const tip of [insiderTip, insiderTip2].filter(Boolean) as InsiderTip[]) {
      const impact: NewsImpact = { description: `INSIDER: 90% chance of strong price ${tip.direction === "up" ? "surge" : "crash"} in ${tip.symbol}`, effects: [{ symbol: tip.symbol, direction: tip.direction, strength: "strong" }], probability: 0.9, delay: 5, duration: 40, ticksRemaining: 45 };
      newNews.push({ id: `insider-impact-${tip.id}`, headline: "", body: "", category: "business", timestamp: Date.now(), affectedStocks: [tip.symbol], sentiment: tip.direction === "up" ? "positive" : "negative", impact });
    }
  }

  if (hasUpgrade(workingState, "dark_pool") && (institutionalOrders.length === 0 || newTimeOfDay % 25 === 0)) institutionalOrders = generateInstitutionalOrders(workingState.stocks);

  if (newTimeOfDay <= 3) {
    if (!newNews.some((n) => n.category === "business")) newNews = [generateNews(workingState.stocks, "business", rumorMill), ...newNews];
    if (!newNews.some((n) => n.category === "global")) newNews = [generateNews(workingState.stocks, "global", rumorMill), ...newNews];
    if (!newNews.some((n) => n.category === "social")) newNews = [generateNews(workingState.stocks, "social", rumorMill), ...newNews];
  }

  if (Math.random() < 0.18) {
    const categories: NewsItem["category"][] = ["business", "global", "social"];
    const category = categories[Math.floor(Math.random() * categories.length)];
    newNews = [generateNews(workingState.stocks, category, rumorMill), ...newNews].slice(0, 30);
  }

  newNews = newNews.map((item) => {
    const updatedImpact = item.impact && item.impact.ticksRemaining > 0 ? { ...item.impact, ticksRemaining: item.impact.ticksRemaining - 1 } : item.impact;
    if (item.category !== "social" || item.upvotes == null || item.momentum == null) return updatedImpact !== item.impact ? { ...item, impact: updatedImpact } : item;
    const age = (Date.now() - item.timestamp) / 1000;
    const upvoteBoost = Math.min(item.upvotes / 200, 5);
    const decayTime = 120 + upvoteBoost * 120;
    const decayFactor = Math.max(0, 1 - age / decayTime);
    const jitter = (Math.random() - 0.3) * item.momentum;
    const newUpvotes = Math.max(item.upvotes, item.upvotes + Math.floor(jitter * decayFactor * 15));
    const newComments = item.commentCount! + (Math.random() < 0.3 ? Math.floor(Math.random() * 3) : 0);
    let newMomentum = item.momentum * (0.98 + Math.random() * 0.04);
    if (Math.random() < 0.02) newMomentum = item.momentum * (1.5 + Math.random());
    let socialImpact = updatedImpact;
    if (socialImpact && newUpvotes > 100) { const bonusTicks = Math.floor(Math.min(newUpvotes / 50, 40)); if (socialImpact.ticksRemaining > 0 && socialImpact.ticksRemaining < bonusTicks) socialImpact = { ...socialImpact, ticksRemaining: bonusTicks }; }
    return { ...item, upvotes: newUpvotes, commentCount: newComments, momentum: newMomentum, impact: socialImpact };
  });

  const newStocks = workingState.stocks.map((s) => updateStockPrice(s, newNews));
  const postOrderState = processOrders({ ...workingState, stocks: newStocks, news: newNews, institutionalOrders });

  if (newTimeOfDay >= 100) {
    // Process options expiration first
    const postOptionsState = processOptionsExpiration(postOrderState);
    const portfolioValue = postOptionsState.portfolio.reduce((sum, pos) => { const stock = newStocks.find((s) => s.symbol === pos.symbol); return sum + (stock ? stock.price * pos.shares : 0); }, 0);
    const shortLiability = postOptionsState.shorts.reduce((sum, pos) => { const stock = newStocks.find((s) => s.symbol === pos.symbol); return sum + (stock ? stock.price * pos.shares : 0); }, 0);
    const shortCollateral = postOptionsState.shorts.reduce((sum, pos) => sum + pos.entryPrice * pos.shares, 0);
    const optionsValue = getOptionsValue(postOptionsState);
    const cashBeforeBonuses = postOptionsState.cash;
    const dividends = hasUpgrade(postOptionsState, "dividends") ? portfolioValue * 0.02 : 0;
    const interest = hasUpgrade(postOptionsState, "interest") ? cashBeforeBonuses * 0.005 : 0;
    const staking = hasUpgrade(postOptionsState, "staking") ? postOptionsState.portfolio.reduce((sum, pos) => { const stock = newStocks.find((s) => s.symbol === pos.symbol); return stock && state.day - pos.dayAcquired >= 3 ? sum + stock.price * pos.shares * 0.01 : sum; }, 0) : 0;
    const heldTags = hasUpgrade(postOptionsState, "diversification") ? new Set(postOptionsState.portfolio.flatMap((pos) => newStocks.find((s) => s.symbol === pos.symbol)?.tags ?? [])) : new Set<string>();
    const netWorthBeforeBonuses = cashBeforeBonuses + portfolioValue + shortCollateral - shortLiability + optionsValue;
    const diversification = heldTags.size > 0 ? netWorthBeforeBonuses * 0.02 * heldTags.size : 0;
    let finalCash = cashBeforeBonuses + dividends + interest + staking + diversification;
    const dayFines = [];

    if (postOptionsState.insiderViewed && getViewedTipSymbols(postOptionsState).length > 0) {
      let totalInsiderProfit = postOptionsState.insiderRealizedProfit;
      for (const tipSymbol of getViewedTipSymbols(postOptionsState)) {
        const tipStock = newStocks.find((s) => s.symbol === tipSymbol);
        if (!tipStock) continue;
        const currentPos = postOptionsState.portfolio.find((p) => p.symbol === tipSymbol);
        const snapPos = postOptionsState.insiderSnapshotHoldings.find((p) => p.symbol === tipSymbol);
        const currentShares = currentPos?.shares ?? 0; const snapShares = snapPos?.shares ?? 0;
        if (currentPos && currentShares > snapShares) totalInsiderProfit += (tipStock.price - currentPos.avgCost) * (currentShares - snapShares);
        const currentShort = postOptionsState.shorts.find((p) => p.symbol === tipSymbol);
        const snapShort = postOptionsState.insiderSnapshotShorts.find((p) => p.symbol === tipSymbol);
        const currentShortShares = currentShort?.shares ?? 0; const snapShortShares = snapShort?.shares ?? 0;
        if (currentShort && currentShortShares > snapShortShares) totalInsiderProfit += (currentShort.entryPrice - tipStock.price) * (currentShortShares - snapShortShares);
      }
      if (totalInsiderProfit > 0) {
        const catchChance = Math.min(0.95, totalInsiderProfit / 3500 + 0.1);
        if (Math.random() < catchChance) {
          let fineAmount = Math.round(totalInsiderProfit * (2 + Math.random()) * 100) / 100;
          if (hasUpgrade(postOptionsState, "bail_out")) fineAmount *= 0.8;
          fineAmount = Math.round(fineAmount * 100) / 100;
          finalCash -= fineAmount;
          dayFines.push({ amount: fineAmount, symbol: getViewedTipSymbols(postOptionsState).join("/"), profit: Math.round(totalInsiderProfit * 100) / 100, day: state.day });
        }
      }
    }

    const finalNetWorth = finalCash + portfolioValue + shortCollateral - shortLiability + optionsValue;
    const completedDay = state.day; let gameOver = false; let goldenParachutes = postOptionsState.goldenParachutes;
    if (completedDay % 3 === 0) { const milestoneNum = completedDay / 3; const requiredNetWorth = 1000 + 250 * milestoneNum * (milestoneNum + 1); gameOver = finalNetWorth < requiredNetWorth; if (gameOver && goldenParachutes > 0) { gameOver = false; goldenParachutes -= 1; } }
    const pendingOrders = hasUpgrade(postOptionsState, "limit_order_pro") ? postOptionsState.pendingOrders : [];
    const endOfDayState: GameState = { ...postOptionsState, day: state.day + 1, cash: finalCash, stocks: newStocks, news: newNews, timeOfDay: 0, marketOpen: false, gameOver, totalProfit: finalNetWorth - 1000, insiderTip: null, insiderTip2: null, insiderViewed: false, insiderViewedTick: 0, insiderSnapshotHoldings: [], insiderSnapshotShorts: [], insiderRealizedProfit: 0, goldenParachutes, pendingOrders, secFines: dayFines.length > 0 ? [...postOptionsState.secFines, ...dayFines] : postOptionsState.secFines, institutionalOrders: [] };
    return gameOver ? endOfDayState : generateDraftOptions(generateUpgradeDraft(endOfDayState));
  }

  return { ...postOrderState, stocks: newStocks, news: newNews, timeOfDay: newTimeOfDay, insiderTip, insiderTip2, institutionalOrders };
}

function pushRecent(recent: string[], symbol: string): string[] {
  return [symbol, ...recent.filter((s) => s !== symbol)].slice(0, 10);
}

export function togglePinStock(state: GameState, symbol: string): GameState {
  const pinned = state.pinnedStocks.includes(symbol)
    ? state.pinnedStocks.filter((s) => s !== symbol)
    : [...state.pinnedStocks, symbol];
  return { ...state, pinnedStocks: pinned };
}

export function buyStock(state: GameState, symbol: string, shares: number): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  if (!stock || shares <= 0) return state;
  const cost = stock.price * shares;
  if (cost > getBuyingPower(state)) return state;
  const bonusShares = hasUpgrade(state, "bogo") && Math.random() < 0.04 ? 1 : 0;
  const totalNewShares = shares + bonusShares;
  const existingPosition = state.portfolio.find((p) => p.symbol === symbol);
  let newPortfolio;
  if (existingPosition) {
    const totalShares = existingPosition.shares + totalNewShares;
    const totalCost = existingPosition.avgCost * existingPosition.shares + cost;
    newPortfolio = state.portfolio.map((p) => p.symbol === symbol ? { ...p, shares: totalShares, avgCost: totalCost / totalShares } : p);
  } else {
    newPortfolio = [...state.portfolio, { symbol, shares: totalNewShares, avgCost: cost / totalNewShares, dayAcquired: state.day }];
  }
  return { ...state, cash: state.cash - cost, portfolio: newPortfolio, recentTrades: pushRecent(state.recentTrades, symbol) };
}

export function sellStock(state: GameState, symbol: string, shares: number): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  const position = state.portfolio.find((p) => p.symbol === symbol);
  if (!stock || !position || position.shares < shares || shares <= 0) return state;
  const revenue = stock.price * shares;
  const costBasis = position.avgCost * shares;
  const profit = revenue - costBasis;
  const adjustedProfit = applyProfitModifiers(state, stock, position, profit);
  const cashDelta = revenue + (adjustedProfit - profit);
  const remainingShares = position.shares - shares;
  const newPortfolio = remainingShares === 0 ? state.portfolio.filter((p) => p.symbol !== symbol) : state.portfolio.map((p) => p.symbol === symbol ? { ...p, shares: remainingShares } : p);
  let insiderRealizedProfit = state.insiderRealizedProfit;
  if (state.insiderViewed && isTipSymbol(state, symbol)) {
    const snapPos = state.insiderSnapshotHoldings.find((p) => p.symbol === symbol);
    const snapShares = snapPos?.shares ?? 0;
    const insiderShares = Math.max(0, Math.min(shares, position.shares - snapShares));
    if (insiderShares > 0) insiderRealizedProfit += (stock.price - position.avgCost) * insiderShares;
  }
  return { ...state, cash: state.cash + cashDelta, portfolio: newPortfolio, insiderRealizedProfit, recentTrades: pushRecent(state.recentTrades, symbol) };
}

export function shortStock(state: GameState, symbol: string, shares: number): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  if (!stock || shares <= 0) return state;
  const collateral = stock.price * shares;
  if (collateral > getBuyingPower(state)) return state;
  const existing = state.shorts.find((p) => p.symbol === symbol);
  let newShorts;
  if (existing) {
    const totalShares = existing.shares + shares;
    const totalEntry = existing.entryPrice * existing.shares + stock.price * shares;
    newShorts = state.shorts.map((p) => p.symbol === symbol ? { ...p, shares: totalShares, entryPrice: totalEntry / totalShares } : p);
  } else newShorts = [...state.shorts, { symbol, shares, entryPrice: stock.price }];
  return { ...state, cash: state.cash - collateral, shorts: newShorts, recentTrades: pushRecent(state.recentTrades, symbol) };
}

export function coverShort(state: GameState, symbol: string, shares: number): GameState {
  const stock = state.stocks.find((s) => s.symbol === symbol);
  const position = state.shorts.find((p) => p.symbol === symbol);
  if (!stock || !position || position.shares < shares || shares <= 0) return state;
  let profit = (position.entryPrice - stock.price) * shares;
  if (profit > 0 && hasUpgrade(state, "loan_shark") && stock.tags.includes("finance")) profit *= 1.15;
  if (profit < 0 && hasUpgrade(state, "hedge_fund")) profit *= 0.75;
  const netCash = state.cash + position.entryPrice * shares + profit;
  const remainingShares = position.shares - shares;
  const newShorts = remainingShares === 0 ? state.shorts.filter((p) => p.symbol !== symbol) : state.shorts.map((p) => p.symbol === symbol ? { ...p, shares: remainingShares } : p);
  let insiderRealizedProfit = state.insiderRealizedProfit;
  if (state.insiderViewed && isTipSymbol(state, symbol)) {
    const snapShort = state.insiderSnapshotShorts.find((p) => p.symbol === symbol);
    const snapShares = snapShort?.shares ?? 0;
    const insiderShares = Math.max(0, Math.min(shares, position.shares - snapShares));
    if (insiderShares > 0) insiderRealizedProfit += (position.entryPrice - stock.price) * insiderShares;
  }
  return { ...state, cash: netCash, shorts: newShorts, insiderRealizedProfit, recentTrades: pushRecent(state.recentTrades, symbol) };
}

export function openMarket(state: GameState): GameState {
  const netWorth = getNetWorth(state);
  return { ...state, marketOpen: true, stocks: state.stocks.map((s) => ({ ...s, openPrice: s.price, dailyHistory: [...s.dailyHistory, { day: state.day, close: s.price }], history: [s.price] })), dayStartNetWorth: netWorth, insiderTip: null, insiderTip2: null, insiderViewed: false, insiderViewedTick: 0, insiderSnapshotHoldings: [], insiderSnapshotShorts: [], insiderRealizedProfit: 0, institutionalOrders: [] };
}

export function acquireUpgrade(state: GameState, upgradeId: string): GameState {
  const upgrade = UPGRADE_POOL.find((u) => u.id === upgradeId);
  if (!upgrade || upgradeCount(state, upgradeId) >= upgrade.maxStacks) return state;
  let newState: GameState = { ...state, acquiredUpgrades: [...state.acquiredUpgrades, upgradeId], upgradeDraftOptions: [] };
  if (upgradeId === "monitor" && newState.monitors.length < 3) newState = { ...newState, monitors: [...newState.monitors, { id: newState.monitors.length, channel: "business_news" }] };
  if (upgradeId === "golden_parachute") newState = { ...newState, goldenParachutes: newState.goldenParachutes + 1 };
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

// --- Stock Draft System ---

function draftSeededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateDraftHistory(
  currentPrice: number,
  tradingDays: number,
  seed: number,
  volatility: number,
): DailyPrice[] {
  const rng = draftSeededRandom(seed);
  const prices: DailyPrice[] = [];
  let price = currentPrice;
  const rawPrices: number[] = [price];

  for (let i = 1; i < tradingDays; i++) {
    const change = (rng() - 0.48) * volatility * price;
    price = Math.max(0.5, price - change);
    rawPrices.unshift(price);
  }

  for (let i = 0; i < rawPrices.length; i++) {
    prices.push({
      day: i - rawPrices.length + 1,
      close: Math.round(rawPrices[i] * 100) / 100,
    });
  }

  return prices;
}

function candidateToStock(candidate: StockCandidate, seed: number): Stock {
  const rng = draftSeededRandom(seed);
  const price = Math.round((candidate.priceRange[0] + rng() * (candidate.priceRange[1] - candidate.priceRange[0])) * 100) / 100;
  const dailyHistory = generateDraftHistory(price, candidate.historyDays, seed + 9973, candidate.volatility);

  return {
    symbol: candidate.symbol,
    name: candidate.name,
    price,
    openPrice: price,
    history: [price],
    dailyHistory,
    tags: candidate.tags,
    ipoDay: candidate.historyDays,
  };
}

export function generateDraftOptions(state: GameState): GameState {
  const existingSymbols = new Set([...state.stocks.map((s) => s.symbol), ...state.draftedSymbols]);
  const available = STOCK_POOL.filter((c) => !existingSymbols.has(c.symbol));
  const count = Math.min(3, available.length); const picked: StockCandidate[] = []; const pool = [...available];
  for (let i = 0; i < count; i++) { const idx = Math.floor(Math.random() * pool.length); picked.push(pool[idx]); pool.splice(idx, 1); }
  const seed = state.day * 31337;
  const options = picked.map((c, i) => candidateToStock(c, seed + i * 7919));
  return { ...state, stockDraftOptions: options };
}

export function generateUpgradeDraft(state: GameState): GameState {
  const available = UPGRADE_POOL.filter((upgrade) => upgradeCount(state, upgrade.id) < upgrade.maxStacks);
  const count = Math.min(3, available.length); const pool = [...available]; const picked: string[] = [];
  for (let i = 0; i < count; i++) { const idx = Math.floor(Math.random() * pool.length); picked.push(pool[idx].id); pool.splice(idx, 1); }
  return { ...state, upgradeDraftOptions: picked };
}

export function draftStock(state: GameState, symbol: string): GameState {
  const chosen = state.stockDraftOptions.find((s) => s.symbol === symbol);
  if (!chosen) return state;
  const price = hasUpgrade(state, "ipo_access") ? Math.round(chosen.price * 0.9 * 100) / 100 : chosen.price;
  const drafted = hasUpgrade(state, "ipo_access") ? { ...chosen, price, openPrice: price, history: [price] } : chosen;
  return { ...state, stocks: [...state.stocks, drafted], stockDraftOptions: [], upgradeDraftOptions: [], draftedSymbols: [...state.draftedSymbols, symbol] };
}
