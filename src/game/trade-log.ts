/**
 * Trade log tracking for P&L graph.
 * Records per-player trades with FIFO ownership tracking for shared positions.
 */

export type TradeAction = "buy" | "sell" | "short" | "cover" | "buy_option" | "sell_option" | "close_option";

export interface TradeLogEntry {
  timestamp: number; // timeOfDay tick
  playerId: string;
  playerName: string;
  action: TradeAction;
  symbol: string;
  shares: number;
  price: number;
  realizedPnL: number; // For sells/covers/close_option: profit/loss realized at this moment
  label?: string; // Human-readable label for tooltip (e.g. "Bought 2 MEGA calls")
}

// FIFO lot tracking: which player bought which shares at what price
export interface FIFOLot {
  playerId: string;
  symbol: string;
  shares: number;
  price: number;
  type: "long" | "short";
}

export interface TradeTracker {
  log: TradeLogEntry[];
  fifoLots: FIFOLot[]; // FIFO queue per symbol (oldest first)
}

export function createTradeTracker(): TradeTracker {
  return { log: [], fifoLots: [] };
}

export function recordBuy(
  tracker: TradeTracker,
  playerId: string,
  playerName: string,
  symbol: string,
  shares: number,
  price: number,
  timestamp: number
): TradeTracker {
  const entry: TradeLogEntry = {
    timestamp,
    playerId,
    playerName,
    action: "buy",
    symbol,
    shares,
    price,
    realizedPnL: 0,
    label: `Bought ${shares} ${symbol}`,
  };
  const lot: FIFOLot = { playerId, symbol, shares, price, type: "long" };
  return {
    log: [...tracker.log, entry],
    fifoLots: [...tracker.fifoLots, lot],
  };
}

export function recordSell(
  tracker: TradeTracker,
  playerId: string,
  playerName: string,
  symbol: string,
  shares: number,
  sellPrice: number,
  timestamp: number
): TradeTracker {
  // FIFO: consume oldest lots for this symbol
  let remaining = shares;
  let totalPnL = 0;
  const newLots = [...tracker.fifoLots];
  const pnlByPlayer: Record<string, number> = {};

  for (let i = 0; i < newLots.length && remaining > 0; i++) {
    const lot = newLots[i];
    if (lot.symbol !== symbol || lot.type !== "long") continue;

    const consumed = Math.min(lot.shares, remaining);
    const lotPnL = (sellPrice - lot.price) * consumed;
    // Split credit: half to buyer, half to seller
    const buyerCredit = lotPnL / 2;
    const sellerCredit = lotPnL / 2;
    pnlByPlayer[lot.playerId] = (pnlByPlayer[lot.playerId] ?? 0) + buyerCredit;
    pnlByPlayer[playerId] = (pnlByPlayer[playerId] ?? 0) + sellerCredit;
    totalPnL += lotPnL;

    remaining -= consumed;
    if (consumed >= lot.shares) {
      newLots.splice(i, 1);
      i--;
    } else {
      newLots[i] = { ...lot, shares: lot.shares - consumed };
    }
  }

  // If same player bought and sold, they get full credit (half + half = full)
  // Generate log entries for each player who gets credit
  const entries: TradeLogEntry[] = [];

  // Seller's entry always shows
  entries.push({
    timestamp,
    playerId,
    playerName,
    action: "sell",
    symbol,
    shares,
    price: sellPrice,
    realizedPnL: pnlByPlayer[playerId] ?? 0,
    label: `Sold ${shares} ${symbol}`,
  });

  // If a different player gets buyer credit, add a phantom entry for them
  for (const [pid, pnl] of Object.entries(pnlByPlayer)) {
    if (pid === playerId) continue; // already added
    entries.push({
      timestamp,
      playerId: pid,
      playerName: "", // will be filled from players list
      action: "sell",
      symbol,
      shares: 0, // phantom: they didn't sell, just get credit
      price: sellPrice,
      realizedPnL: pnl,
    });
  }

  return {
    log: [...tracker.log, ...entries],
    fifoLots: newLots,
  };
}

export function recordShort(
  tracker: TradeTracker,
  playerId: string,
  playerName: string,
  symbol: string,
  shares: number,
  price: number,
  timestamp: number
): TradeTracker {
  const entry: TradeLogEntry = {
    timestamp,
    playerId,
    playerName,
    action: "short",
    symbol,
    shares,
    price,
    realizedPnL: 0,
    label: `Shorted ${shares} ${symbol}`,
  };
  const lot: FIFOLot = { playerId, symbol, shares, price, type: "short" };
  return {
    log: [...tracker.log, entry],
    fifoLots: [...tracker.fifoLots, lot],
  };
}

export function recordCover(
  tracker: TradeTracker,
  playerId: string,
  playerName: string,
  symbol: string,
  shares: number,
  coverPrice: number,
  timestamp: number
): TradeTracker {
  // FIFO: consume oldest short lots for this symbol
  let remaining = shares;
  const newLots = [...tracker.fifoLots];
  const pnlByPlayer: Record<string, number> = {};

  for (let i = 0; i < newLots.length && remaining > 0; i++) {
    const lot = newLots[i];
    if (lot.symbol !== symbol || lot.type !== "short") continue;

    const consumed = Math.min(lot.shares, remaining);
    const lotPnL = (lot.price - coverPrice) * consumed;
    // Split credit: half to shorter, half to coverer
    const shorterCredit = lotPnL / 2;
    const covererCredit = lotPnL / 2;
    pnlByPlayer[lot.playerId] = (pnlByPlayer[lot.playerId] ?? 0) + shorterCredit;
    pnlByPlayer[playerId] = (pnlByPlayer[playerId] ?? 0) + covererCredit;

    remaining -= consumed;
    if (consumed >= lot.shares) {
      newLots.splice(i, 1);
      i--;
    } else {
      newLots[i] = { ...lot, shares: lot.shares - consumed };
    }
  }

  const entries: TradeLogEntry[] = [];

  entries.push({
    timestamp,
    playerId,
    playerName,
    action: "cover",
    symbol,
    shares,
    price: coverPrice,
    realizedPnL: pnlByPlayer[playerId] ?? 0,
    label: `Covered ${shares} ${symbol}`,
  });

  // Phantom entries for original shorters who get credit
  for (const [pid, pnl] of Object.entries(pnlByPlayer)) {
    if (pid === playerId) continue;
    entries.push({
      timestamp,
      playerId: pid,
      playerName: "",
      action: "cover",
      symbol,
      shares: 0,
      price: coverPrice,
      realizedPnL: pnl,
    });
  }

  return {
    log: [...tracker.log, ...entries],
    fifoLots: newLots,
  };
}

/**
 * At end of day, assign unrealized P&L to lot owners for open positions.
 * Returns per-player unrealized P&L entries for the graph.
 */
export function computeEODUnrealized(
  tracker: TradeTracker,
  stocks: Array<{ symbol: string; price: number }>,
  endTimestamp: number
): TradeLogEntry[] {
  const pnlByPlayer: Record<string, number> = {};

  for (const lot of tracker.fifoLots) {
    const stock = stocks.find((s) => s.symbol === lot.symbol);
    if (!stock) continue;

    let unrealized: number;
    if (lot.type === "long") {
      unrealized = (stock.price - lot.price) * lot.shares;
    } else {
      unrealized = (lot.price - stock.price) * lot.shares;
    }
    pnlByPlayer[lot.playerId] = (pnlByPlayer[lot.playerId] ?? 0) + unrealized;
  }

  return Object.entries(pnlByPlayer).map(([playerId, pnl]) => ({
    timestamp: endTimestamp,
    playerId,
    playerName: "",
    action: "sell" as const, // treated as realized at EOD
    symbol: "EOD",
    shares: 0,
    price: 0,
    realizedPnL: pnl,
  }));
}

/**
 * Build cumulative P&L series per player for graphing.
 * Each point is { time, cumulativePnL } per player.
 * Also includes action markers for interactive display.
 */
export interface PnLDataPoint {
  time: number;
  value: number;
  entry?: TradeLogEntry; // Present when this point is a trade action (for dots/tooltips)
}

export interface PlayerPnLSeries {
  playerId: string;
  playerName: string;
  playerColor: string;
  data: PnLDataPoint[];
}

export function recordOptionBuy(
  tracker: TradeTracker,
  playerId: string,
  playerName: string,
  symbol: string,
  optionType: "call" | "put",
  contracts: number,
  premium: number,
  timestamp: number
): TradeTracker {
  const entry: TradeLogEntry = {
    timestamp,
    playerId,
    playerName,
    action: "buy_option",
    symbol,
    shares: contracts,
    price: premium,
    realizedPnL: -premium * contracts * 100, // Premium paid
    label: `Bought ${contracts} ${symbol} ${optionType}${contracts > 1 ? "s" : ""}`,
  };
  return { log: [...tracker.log, entry], fifoLots: tracker.fifoLots };
}

export function recordOptionSell(
  tracker: TradeTracker,
  playerId: string,
  playerName: string,
  symbol: string,
  optionType: "call" | "put",
  contracts: number,
  premium: number,
  timestamp: number
): TradeTracker {
  const entry: TradeLogEntry = {
    timestamp,
    playerId,
    playerName,
    action: "sell_option",
    symbol,
    shares: contracts,
    price: premium,
    realizedPnL: premium * contracts * 100, // Premium received
    label: `Wrote ${contracts} ${symbol} ${optionType}${contracts > 1 ? "s" : ""}`,
  };
  return { log: [...tracker.log, entry], fifoLots: tracker.fifoLots };
}

export function recordOptionClose(
  tracker: TradeTracker,
  playerId: string,
  playerName: string,
  symbol: string,
  realizedPnL: number,
  timestamp: number
): TradeTracker {
  const entry: TradeLogEntry = {
    timestamp,
    playerId,
    playerName,
    action: "close_option",
    symbol,
    shares: 1,
    price: 0,
    realizedPnL,
    label: `Closed ${symbol} option (${realizedPnL >= 0 ? "+" : ""}$${realizedPnL.toFixed(2)})`,
  };
  return { log: [...tracker.log, entry], fifoLots: tracker.fifoLots };
}

export function buildPnLSeries(
  log: TradeLogEntry[],
  players: Array<{ id: string; name: string; color: string }>,
  dayLength: number
): PlayerPnLSeries[] {
  const seriesMap: Record<string, PnLDataPoint[]> = {};

  // Initialize all players at 0
  for (const p of players) {
    seriesMap[p.id] = [{ time: 0, value: 0 }];
  }

  // Sort log by timestamp
  const sorted = [...log].sort((a, b) => a.timestamp - b.timestamp);

  // Accumulate per-player
  const cumulative: Record<string, number> = {};
  for (const p of players) cumulative[p.id] = 0;

  for (const entry of sorted) {
    if (!cumulative.hasOwnProperty(entry.playerId)) continue;

    if (entry.realizedPnL !== 0) {
      cumulative[entry.playerId] += entry.realizedPnL;
    }
    // Always add a point for every action (so dots show up even for buys with 0 pnl)
    seriesMap[entry.playerId].push({
      time: entry.timestamp,
      value: cumulative[entry.playerId],
      entry,
    });
  }

  // Add final point at day end for continuity
  for (const p of players) {
    const series = seriesMap[p.id];
    if (series.length > 0 && series[series.length - 1].time < dayLength) {
      series.push({ time: dayLength, value: cumulative[p.id] });
    }
  }

  return players.map((p) => ({
    playerId: p.id,
    playerName: p.name,
    playerColor: p.color,
    data: seriesMap[p.id] || [{ time: 0, value: 0 }],
  }));
}
