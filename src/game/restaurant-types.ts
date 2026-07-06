export type StepType = "grill" | "fry" | "chop" | "mix" | "assemble";

export interface AssembleIngredient {
  name: string;
  key: string;
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

export type OrderStep = PrepStep | ChopStep | MixStep | AssembleStep;

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
  startTime: number;
  patienceRemaining: number;
  completed: boolean;
  served: boolean;
  failed: boolean;
}

export interface RestaurantState {
  shiftActive: boolean;
  orderQueue: ActiveOrder[];
  activeOrderId: number | null;
  completedOrders: number;
  totalEarnings: number;
  totalTips: number;
  shiftTimeRemaining: number;
  nextOrderTimer: number;
  orderIdCounter: number;
  shiftOver: boolean;
}
