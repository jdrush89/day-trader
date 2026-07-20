/**
 * Fishing Mini-Game Engine
 *
 * A vertical meter with a fishing pole indicator (player) and a fish indicator.
 * The player reels in by rotating their mouse to move the pole indicator up.
 * The pole indicator obeys gravity (accelerates down when not reeling).
 * The fish moves up and down sporadically.
 * The player must keep the pole indicator within the fish's range for enough
 * of the fish's duration to catch it.
 */

import { MenuItem } from "./restaurant-types";
import { UPGRADE_POOL } from "./upgrades";

export interface FishType {
  id: string;
  name: string;
  icon: string;
  size: number;        // 0.1 to 0.4 — how much of the meter the fish occupies
  speed: number;       // How fast the fish moves (units/tick)
  erratic: number;     // How often direction changes (0-1, higher = more erratic)
  duration: number;    // How many ticks the fish stays on the line
  catchThreshold: number; // 0-1 — what % of duration must be overlapping
  difficulty: string;  // Display label
}

export interface FishingReward {
  type: "cash" | "ticket" | "upgrade" | "recipe";
  amount?: number;       // For cash rewards
  upgradeId?: string;    // For upgrade rewards
  recipe?: MenuItem;     // For recipe rewards
}

export interface FishEntry {
  fish: FishType;
  reward: FishingReward;
}

export interface FishingState {
  phase: "idle" | "casting" | "waiting" | "reeling" | "result";
  castTimer: number;
  waitTimer: number;
  // Meter positions (0 = bottom, 1 = top)
  polePosition: number;
  poleVelocity: number;
  fishPosition: number;
  fishDirection: number; // -1 or 1
  fishDirectionTimer: number;
  // Tracking
  currentFish: FishEntry | null;
  overlapTicks: number;
  totalTicks: number;
  caught: boolean | null;
  resultTimer: number;
  // Input
  reelPower: number; // accumulated from mouse rotation this frame
}

// Physics constants
const GRAVITY = 0.003;
const REEL_FORCE = 0.012;
const MAX_VELOCITY = 0.04;
const FRICTION = 0.92;

// Fish pool - various difficulties
const FISH_POOL: FishType[] = [
  // Easy fish (large indicator, slow, forgiving)
  { id: "goldfish", name: "Goldfish", icon: "🐠", size: 0.35, speed: 0.008, erratic: 0.02, duration: 300, catchThreshold: 0.35, difficulty: "Easy" },
  { id: "sardine", name: "Sardine", icon: "🐟", size: 0.3, speed: 0.01, erratic: 0.03, duration: 260, catchThreshold: 0.38, difficulty: "Easy" },
  { id: "catfish", name: "Catfish", icon: "🐡", size: 0.3, speed: 0.009, erratic: 0.025, duration: 300, catchThreshold: 0.36, difficulty: "Easy" },

  // Medium fish
  { id: "bass", name: "Bass", icon: "🐟", size: 0.25, speed: 0.013, erratic: 0.04, duration: 260, catchThreshold: 0.42, difficulty: "Medium" },
  { id: "trout", name: "Trout", icon: "🐠", size: 0.22, speed: 0.015, erratic: 0.05, duration: 240, catchThreshold: 0.4, difficulty: "Medium" },
  { id: "salmon", name: "Salmon", icon: "🐟", size: 0.22, speed: 0.014, erratic: 0.045, duration: 260, catchThreshold: 0.43, difficulty: "Medium" },

  // Hard fish (small indicator, fast, demanding)
  { id: "swordfish", name: "Swordfish", icon: "🗡️", size: 0.18, speed: 0.018, erratic: 0.06, duration: 220, catchThreshold: 0.48, difficulty: "Hard" },
  { id: "tuna", name: "Tuna", icon: "🐟", size: 0.16, speed: 0.02, erratic: 0.07, duration: 200, catchThreshold: 0.45, difficulty: "Hard" },
  { id: "marlin", name: "Marlin", icon: "🏆", size: 0.14, speed: 0.022, erratic: 0.08, duration: 200, catchThreshold: 0.5, difficulty: "Hard" },

  // Legendary
  { id: "whale", name: "Whale Shark", icon: "🐋", size: 0.12, speed: 0.025, erratic: 0.09, duration: 180, catchThreshold: 0.55, difficulty: "Legendary" },
];

// Fish-based recipes that can be unlocked
export const FISH_RECIPES: MenuItem[] = [
  {
    name: "Grilled Salmon",
    icon: "🐟",
    basePay: 12,
    patience: 50,
    steps: [
      { type: "grill", label: "Grill salmon fillet", duration: 160, flipAt: 80, flipWindow: 15 },
      { type: "assemble", label: "Plate salmon", ingredients: [
        { name: "Plate", key: "p", essential: true },
        { name: "Salmon", key: "s", essential: true },
        { name: "Lemon", key: "l" },
        { name: "Dill", key: "d" },
        { name: "Rice", key: "r", essential: true },
      ]},
    ],
  },
  {
    name: "Fish & Chips",
    icon: "🐠",
    basePay: 10,
    patience: 45,
    steps: [
      { type: "chop", label: "Cut potatoes", target: 8 },
      { type: "fry", label: "Fry fish & chips", duration: 140, flipWindow: 15 },
      { type: "assemble", label: "Plate it up", ingredients: [
        { name: "Paper", key: "p", essential: true },
        { name: "Fish", key: "f", essential: true },
        { name: "Chips", key: "c", essential: true },
        { name: "Tartar", key: "t" },
        { name: "Lemon", key: "l" },
      ]},
    ],
  },
  {
    name: "Seared Tuna",
    icon: "🍣",
    basePay: 16,
    patience: 48,
    steps: [
      { type: "hold", label: "Sear tuna", key: "h", targetMin: 0.68, targetMax: 0.88, maxDuration: 48 },
      { type: "chop", label: "Slice thinly", target: 10 },
      { type: "assemble", label: "Arrange plate", ingredients: [
        { name: "Plate", key: "p", essential: true },
        { name: "Tuna", key: "t", essential: true },
        { name: "Wasabi", key: "w", essential: true },
        { name: "Ginger", key: "g" },
        { name: "Soy", key: "s" },
      ]},
    ],
  },
  {
    name: "Shrimp Scampi",
    icon: "🦐",
    basePay: 13,
    patience: 50,
    steps: [
      { type: "chop", label: "Mince garlic", target: 7 },
      { type: "fry", label: "Sauté shrimp", duration: 120, flipWindow: 15 },
      { type: "assemble", label: "Plate scampi", ingredients: [
        { name: "Pasta", key: "p", essential: true },
        { name: "Shrimp", key: "s", essential: true },
        { name: "Butter", key: "b", essential: true },
        { name: "Parsley", key: "r" },
        { name: "Lemon", key: "l" },
      ]},
    ],
  },
  {
    name: "Lobster Roll",
    icon: "🦞",
    basePay: 18,
    patience: 55,
    steps: [
      { type: "grill", label: "Grill lobster", duration: 180, flipAt: 90, flipWindow: 15 },
      { type: "chop", label: "Chop lobster meat", target: 6 },
      { type: "assemble", label: "Build roll", ingredients: [
        { name: "Bun", key: "b", essential: true },
        { name: "Lobster", key: "l", essential: true },
        { name: "Mayo", key: "m", essential: true },
        { name: "Celery", key: "c" },
        { name: "Chive", key: "h" },
      ]},
    ],
  },
];

function generateReward(fish: FishType, availableUpgrades: string[]): FishingReward {
  const roll = Math.random();
  const difficultyMultiplier = fish.difficulty === "Easy" ? 1 : fish.difficulty === "Medium" ? 1.5 : fish.difficulty === "Hard" ? 2 : 3;

  if (roll < 0.4) {
    // Cash reward scaled by difficulty
    const base = 50 + Math.floor(Math.random() * 50);
    const amount = Math.round(base * difficultyMultiplier);
    return { type: "cash", amount: Math.min(amount, 200) };
  } else if (roll < 0.55) {
    // Store ticket
    return { type: "ticket" };
  } else if (roll < 0.75) {
    // Random upgrade
    const available = UPGRADE_POOL.filter((u) => !availableUpgrades.includes(u.id));
    if (available.length > 0) {
      const upgrade = available[Math.floor(Math.random() * available.length)];
      return { type: "upgrade", upgradeId: upgrade.id };
    }
    // Fallback to cash
    return { type: "cash", amount: Math.round(100 * difficultyMultiplier) };
  } else {
    // Fish recipe
    const recipe = FISH_RECIPES[Math.floor(Math.random() * FISH_RECIPES.length)];
    return { type: "recipe", recipe };
  }
}

export function createFishingState(): FishingState {
  return {
    phase: "idle",
    castTimer: 40, // 2 seconds
    waitTimer: 60 + Math.floor(Math.random() * 80), // 3-7 seconds wait
    polePosition: 0.5,
    poleVelocity: 0,
    fishPosition: 0.5,
    fishDirection: 1,
    fishDirectionTimer: 0,
    currentFish: null,
    overlapTicks: 0,
    totalTicks: 0,
    caught: null,
    resultTimer: 0,
    reelPower: 0,
  };
}

export function pickFish(day: number, acquiredUpgrades: string[]): FishEntry {
  // Weight towards harder fish on later days
  const weights = FISH_POOL.map((fish) => {
    const diffWeight = fish.difficulty === "Easy" ? Math.max(0.5, 3 - day * 0.2)
      : fish.difficulty === "Medium" ? 2
      : fish.difficulty === "Hard" ? Math.min(2, 0.5 + day * 0.15)
      : Math.min(1, day * 0.05); // Legendary very rare early
    return diffWeight;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  let fish = FISH_POOL[0];
  for (let i = 0; i < FISH_POOL.length; i++) {
    roll -= weights[i];
    if (roll <= 0) { fish = FISH_POOL[i]; break; }
  }
  const reward = generateReward(fish, acquiredUpgrades);
  return { fish, reward };
}

export function castLine(state: FishingState): FishingState {
  if (state.phase !== "idle") return state;
  return { ...state, phase: "casting" };
}

export function fishingTick(state: FishingState, day: number, acquiredUpgrades: string[]): FishingState {
  if (state.phase === "idle") return state;

  if (state.phase === "result") {
    const resultTimer = state.resultTimer - 1;
    if (resultTimer <= 0) return { ...state, resultTimer: 0 };
    return { ...state, resultTimer };
  }

  if (state.phase === "casting") {
    const castTimer = state.castTimer - 1;
    if (castTimer <= 0) return { ...state, phase: "waiting", castTimer: 0 };
    return { ...state, castTimer };
  }

  if (state.phase === "waiting") {
    const waitTimer = state.waitTimer - 1;
    if (waitTimer <= 0) {
      const entry = pickFish(day, acquiredUpgrades);
      return {
        ...state,
        phase: "reeling",
        waitTimer: 0,
        currentFish: entry,
        fishPosition: 0.3 + Math.random() * 0.4,
        fishDirection: Math.random() > 0.5 ? 1 : -1,
        fishDirectionTimer: 20 + Math.floor(Math.random() * 40),
        overlapTicks: 0,
        totalTicks: 0,
      };
    }
    return { ...state, waitTimer };
  }

  // Reeling phase
  if (state.phase === "reeling" && state.currentFish) {
    const fish = state.currentFish.fish;
    const totalTicks = state.totalTicks + 1;

    // Fish ran out of time?
    if (totalTicks >= fish.duration) {
      const ratio = state.overlapTicks / fish.duration;
      const caught = ratio >= fish.catchThreshold;
      return { ...state, phase: "result", caught, totalTicks, resultTimer: 0 };
    }

    // Update pole position (gravity + reel)
    let poleVelocity = state.poleVelocity - GRAVITY; // gravity pulls down
    if (state.reelPower > 0) {
      poleVelocity += REEL_FORCE * Math.min(state.reelPower, 3);
    }
    poleVelocity *= FRICTION;
    poleVelocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, poleVelocity));
    let polePosition = state.polePosition + poleVelocity;
    polePosition = Math.max(0, Math.min(1, polePosition));

    // Update fish position (sporadic movement)
    let fishDirection = state.fishDirection;
    let fishDirectionTimer = state.fishDirectionTimer - 1;
    if (fishDirectionTimer <= 0 || Math.random() < fish.erratic) {
      fishDirection = Math.random() > 0.5 ? 1 : -1;
      fishDirectionTimer = 15 + Math.floor(Math.random() * 35);
    }
    let fishPosition = state.fishPosition + fishDirection * fish.speed;
    // Bounce off walls (keep fish within 0.05 to 0.95)
    if (fishPosition < 0.05) { fishPosition = 0.05; fishDirection = 1; }
    if (fishPosition > 0.95) { fishPosition = 0.95; fishDirection = -1; }

    // Check overlap (pole position within fish range)
    const fishTop = fishPosition + fish.size / 2;
    const fishBottom = fishPosition - fish.size / 2;
    const poleSize = 0.05;
    const poleTop = polePosition + poleSize / 2;
    const poleBottom = polePosition - poleSize / 2;
    const overlapping = poleTop >= fishBottom && poleBottom <= fishTop;
    const overlapTicks = overlapping ? state.overlapTicks + 1 : state.overlapTicks;

    return {
      ...state,
      polePosition,
      poleVelocity,
      fishPosition,
      fishDirection,
      fishDirectionTimer,
      overlapTicks,
      totalTicks,
      reelPower: 0, // reset each tick
    };
  }

  return state;
}

export function applyReel(state: FishingState, power: number): FishingState {
  if (state.phase !== "reeling") return state;
  return { ...state, reelPower: state.reelPower + power };
}
