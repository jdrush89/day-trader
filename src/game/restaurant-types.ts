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
}
