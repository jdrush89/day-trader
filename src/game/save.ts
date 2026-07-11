import { GameState } from "./types";
import { createTradingTracker } from "./challenges";

const SAVE_KEY = "rogue-day-trader-save";
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

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data: SaveData = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return null;
    if (!data.gameState || typeof data.gameState.day !== "number") return null;
    // Backfill challenge fields for older saves
    const gs = data.gameState;
    if (!gs.challengeTracker) gs.challengeTracker = createTradingTracker();
    if (!gs.activeChallenges) gs.activeChallenges = [];
    if (gs.tickets == null) gs.tickets = 0;
    return gs;
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
