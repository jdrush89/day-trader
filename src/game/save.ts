import { GameState } from "./types";
import { createTradingTracker } from "./challenges";
import { createEmptyInventory } from "./consumables";

const SAVE_KEY = "rogue-day-trader-save";
const MP_SAVES_KEY = "rogue-day-trader-mp-saves";
const SAVE_VERSION = 1;

interface SaveData {
  version: number;
  gameState: GameState;
  savedAt: number;
}

export function saveGame(gameState: GameState): void {
  const data: SaveData = {
    version: SAVE_VERSION,
    gameState,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

function backfillGameState(gs: GameState): GameState {
  if (!gs.challengeTracker) gs.challengeTracker = createTradingTracker();
  if (!gs.activeChallenges) gs.activeChallenges = [];
  if (gs.tickets == null) gs.tickets = 0;
  if (!gs.consumableInventory) gs.consumableInventory = createEmptyInventory();
  return gs;
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data: SaveData = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return null;
    if (!data.gameState || typeof data.gameState.day !== "number") return null;
    return backfillGameState(data.gameState);
  } catch {
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
    gameState,
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
