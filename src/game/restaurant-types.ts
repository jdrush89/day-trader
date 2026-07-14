import type { RestaurantChallengeTracker } from "./challenges";

export type StepType = "grill" | "fry" | "chop" | "mix" | "assemble" | "rhythm" | "hold" | "memorize";

export interface AssembleIngredient {
  name: string;
  key: string;
  essential?: boolean; // cannot be removed by customization
}

export interface PrepStep {
  type: "grill" | "fry";
  label: string;
  duration: number;
  flipAt?: number;
  flipWindow: number;
}

export interface ChopStep {
  type: "chop";
  label: string;
  target: number;
}

export interface MixStep {
  type: "mix";
  label: string;
  target: number;
}

export interface AssembleStep {
  type: "assemble";
  label: string;
  ingredients: AssembleIngredient[];
}

export interface RhythmHit {
  key: string;
  targetTick: number;
  window: number;
}

export interface RhythmStep {
  type: "rhythm";
  label: string;
  hits: RhythmHit[];
}

export interface HoldStep {
  type: "hold";
  label: string;
  key: string;
  targetMin: number;
  targetMax: number;
  maxDuration: number;
}

export interface MemorizeStep {
  type: "memorize";
  label: string;
  sequenceLength: number;
  revealDuration: number;
}

export type OrderStep = PrepStep | ChopStep | MixStep | AssembleStep | RhythmStep | HoldStep | MemorizeStep;
export type RhythmResult = "pending" | "hit" | "miss";

export interface MenuItem {
  name: string;
  icon: string;
  basePay: number;
  steps: OrderStep[];
  patience: number;
}

export interface ActiveOrder {
  id: number;
  menuItem: MenuItem;
  currentStepIndex: number;
  prepProgress: number;
  prepStarted: boolean;
  flipped: boolean;
  burnt: boolean;
  chopCount: number;
  lastChopKey: "left" | "right" | null;
  mixProgress: number;
  lastMousePos: { x: number; y: number } | null;
  assembleIndex: number;
  rhythmHitIndex: number;
  rhythmHits: number;
  rhythmResults: RhythmResult[];
  holdStartTick: number | null;
  holdProgress: number;
  holdReleased: boolean;
  memorizeSequence: string[];
  memorizeRevealed: boolean;
  memorizeRevealTimer: number;
  memorizeInputIndex: number;
  startTime: number;
  patienceRemaining: number;
  completed: boolean;
  served: boolean;
  failed: boolean;
  failedTimer: number;
  // Per-assemble-step customization: which ingredients are wanted (true) vs unwanted (false)
  customizations: Record<number, boolean[]>;
  orderCorrect: boolean;
}

export interface RestaurantOrderLog {
  timestamp: number; // seconds elapsed (shiftDuration - shiftTimeRemaining)
  orderId: number;
  orderName: string;
  orderIcon: string;
  payout: number;
  contributors: string[]; // playerIds who worked on this order
}

// --- Chore system ---

export type ChoreType = "wash_dishes" | "take_out_trash" | "mop_floor" | "stack_plates" | "break_down_recycling";

export interface DishSpot {
  x: number; // 0-1 normalized position
  y: number;
  scrubbed: boolean;
}

export interface TrashBag {
  x: number;
  y: number;
  removed: boolean;
}

export interface ActiveChore {
  id: number;
  type: ChoreType;
  timer: number; // seconds remaining before it blocks serving
  timerExpired: boolean;
  completed: boolean;
  // Wash dishes state
  dishSpots: DishSpot[];
  // Take out trash state
  trashBags: TrashBag[];
  // Mop floor state
  mopPhase: "dunk" | "squeeze" | "mop"; // current phase of the mop cycle
  mopCycles: number; // how many full cycles completed
  mopCyclesNeeded: number; // target cycles to complete
  mopSqueezeCount: number; // space bar presses during squeeze phase
  mopSwipeCount: number; // left/right alternations during mop phase
  mopLastDirection: "left" | "right" | null;
  // Stack plates state
  platePosition: number; // 0-1, oscillates back and forth
  plateDirection: 1 | -1;
  plateSpeed: number;
  platesStacked: number;
  platesNeeded: number;
  lastPlatePosition: number; // where the last plate landed (for stacking check)
  plateMissed: boolean; // true if last plate missed (resets on next attempt)
  // Break down recycling state
  recyclePhase: "click" | "arrows"; // click to dismantle, arrows to flatten
  recycleClicks: number;
  recycleClicksNeeded: number;
  recycleArrows: number;
  recycleArrowsNeeded: number;
  recycleCycles: number;
  recycleCyclesNeeded: number;
}

export interface RestaurantState {
  shiftActive: boolean;
  orderSlots: (ActiveOrder | null)[];
  activeOrderId: number | null;
  completedOrders: number;
  failedOrders: number;
  totalEarnings: number;
  totalTips: number;
  shiftTimeRemaining: number;
  nextOrderTimer: number;
  orderIdCounter: number;
  shiftOver: boolean;
  availableMenu: MenuItem[];
  acquiredUpgrades: string[];
  comboStreak: number;
  challengeTracker: RestaurantChallengeTracker;
  // Multiplayer counter system
  numCounters: number; // 1 for single player, N for multiplayer
  slotsPerCounter: number; // typically 5 (or 6 with upgrade)
  playerFocus: Record<string, number | null>; // playerId → activeOrderId they're focused on
  // Per-order contributor tracking: orderId → set of playerIds who worked on it
  orderContributors: Record<number, string[]>;
  // Completed order log for graphing
  orderLog: RestaurantOrderLog[];
  shiftDuration: number; // total shift length in seconds (for graph x-axis)
  // Chore system
  activeChore: ActiveChore | null;
  nextChoreTimer: number; // seconds until next chore spawns
  choresCompleted: number;
  choresScheduled: number; // how many chores this shift (1-2)
  servingBlocked: boolean; // true when a chore timer has expired
}
