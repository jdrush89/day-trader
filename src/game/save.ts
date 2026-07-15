import { GameState, Stock } from "./types";
import { createTradingTracker } from "./challenges";
import { createEmptyInventory } from "./consumables";

const SAVE_KEY = "rogue-day-trader-save";
const MP_SAVES_KEY = "rogue-day-trader-mp-saves";
const SAVE_VERSION = 2; // Bumped for slim save format

interface SaveData {
  version: number;
  gameState: GameState;
  phase: "trading" | "restaurant";
  savedAt: number;
}

// Strip large regenerable fields to reduce save size.
// On resume, the game starts at the beginning of the trading phase.
function slimStateForSave(gs: GameState): GameState {
  // Trim stock data: keep dailyHistory (last 20 days), clear intraday history
  const slimStocks: Stock[] = gs.stocks.map((s) => ({
    ...s,
    history: [s.price], // just current price
    dailyHistory: s.dailyHistory.slice(-20),
  }));

  return {
    ...gs,
    // Reset to start-of-day state
    marketOpen: true,
    timeOfDay: 0,
    // Strip regenerable per-day fields
    monitors: [], // will be rebuilt with defaults on load
    news: [],
    upgradeDraftOptions: [],
    restaurantUpgradeDraftOptions: [],
    stockDraftOptions: [],
    menuDraftOptions: [],
    challengeTracker: createTradingTracker(),
    insiderTip: null,
    insiderTip2: null,
    insiderViewed: false,
    insiderViewedTick: 0,
    insiderSnapshotHoldings: [],
    insiderSnapshotShorts: [],
    insiderRealizedProfit: 0,
    institutionalOrders: [],
    pendingOrders: [],
    pendingSECCheck: null,
    recentTrades: [],
    milestonePayment: null,
    restaurantEarnings: 0,
    // Use trimmed stocks
    stocks: slimStocks,
  };
}

export function saveGame(gameState: GameState, phase: "trading" | "restaurant"): boolean {
  const slim = slimStateForSave(gameState);
  const data: SaveData = {
    version: SAVE_VERSION,
    gameState: slim,
    phase,
    savedAt: Date.now(),
  };
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(SAVE_KEY, json);
    return true;
  } catch (e) {
    console.warn("[saveGame] Failed to save:", e);
    return false;
  }
}

function backfillGameState(gs: GameState): GameState {
  if (!gs.challengeTracker) gs.challengeTracker = createTradingTracker();
  else {
    // Backfill new tracker fields for old saves
    if (gs.challengeTracker.maxSingleTradeSymbol == null) gs.challengeTracker.maxSingleTradeSymbol = "";
    if (gs.challengeTracker.maxSingleTradePlayer == null) gs.challengeTracker.maxSingleTradePlayer = "";
    if (gs.challengeTracker.firstSellPlayer == null) gs.challengeTracker.firstSellPlayer = "";
    if (gs.challengeTracker.firstBuyPlayer == null) gs.challengeTracker.firstBuyPlayer = "";
  }
  if (!gs.activeChallenges) gs.activeChallenges = [];
  if (gs.tickets == null) gs.tickets = 0;
  if (gs.tradingTickets == null) gs.tradingTickets = gs.tickets || 0;
  if (gs.restaurantTickets == null) gs.restaurantTickets = gs.tickets || 0;
  if (gs.runSeed == null) gs.runSeed = Math.floor(Math.random() * 2147483647);
  if (gs.freeNextStock == null) gs.freeNextStock = false;
  if (!gs.consumableInventory) gs.consumableInventory = createEmptyInventory();
  if (gs.playerCount == null) gs.playerCount = 1;
  // Rebuild default monitors if stripped
  if (!gs.monitors || gs.monitors.length === 0) {
    const firstStock = gs.stocks?.[0]?.symbol ?? "MEGA";
    gs.monitors = [{ id: 0, channel: "stock_ticker", selectedStock: firstStock }];
  }
  return gs;
}

export function loadGame(): { gameState: GameState; phase: "trading" | "restaurant" } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data: SaveData = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return null;
    if (!data.gameState || typeof data.gameState.day !== "number") return null;
    return { gameState: backfillGameState(data.gameState), phase: data.phase ?? "trading" };
  } catch (e) {
    console.warn("[loadGame] Failed to load save:", e);
    return null;
  }
}

export function hasSavedGame(): boolean {
  return loadGame() !== null;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

// --- Multiplayer saves ---

export interface PlayerSaveData {
  name: string;
  upgrades: string[];
  restaurantUpgrades: string[];
}

export interface MpSaveData {
  id: string;
  version: number;
  gameState: GameState;
  players: PlayerSaveData[];
  savedAt: number;
  saveType: "auto" | "manual";
}

function generateSaveId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function saveMpGame(
  gameState: GameState,
  players: PlayerSaveData[],
  existingId?: string,
  saveType: "auto" | "manual" = "auto",
): string {
  const saves = loadAllMpSaves();
  const id = existingId ?? generateSaveId();

  const data: MpSaveData = {
    id,
    version: SAVE_VERSION,
    gameState: slimStateForSave(gameState),
    players,
    savedAt: Date.now(),
    saveType,
  };

  // One save per run — always overwrite by id
  const idx = saves.findIndex((s) => s.id === id);
  if (idx >= 0) saves[idx] = data;
  else saves.push(data);

  try {
    localStorage.setItem(MP_SAVES_KEY, JSON.stringify(saves));
  } catch {
    // silently fail
  }
  return data.id;
}

export function loadAllMpSaves(): MpSaveData[] {
  try {
    const raw = localStorage.getItem(MP_SAVES_KEY);
    if (!raw) return [];
    const saves: MpSaveData[] = JSON.parse(raw);
    return saves
      .filter((s) => s.version === SAVE_VERSION && s.gameState && typeof s.gameState.day === "number")
      .map((s) => ({ ...s, saveType: s.saveType ?? "manual" })); // backfill old saves
  } catch {
    return [];
  }
}

export function loadMpSave(id: string): MpSaveData | null {
  const saves = loadAllMpSaves();
  const save = saves.find((s) => s.id === id);
  if (!save) return null;
  save.gameState = backfillGameState(save.gameState);
  return save;
}

export function deleteMpSave(id: string): void {
  const saves = loadAllMpSaves().filter((s) => s.id !== id);
  try {
    localStorage.setItem(MP_SAVES_KEY, JSON.stringify(saves));
  } catch {
    // silently fail
  }
}
