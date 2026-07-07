import { GameState } from "./types";
import {
  ActiveOrder,
  AssembleIngredient,
  MenuItem,
  OrderStep,
  RestaurantState,
} from "./restaurant-types";
import { generateDraftOptions, generateUpgradeDraft, getNetWorth } from "./engine";

const TICKS_PER_SECOND = 20;
const SHIFT_DURATION_SECONDS = 180;
const ORDER_INTERVAL_MIN = 8;
const ORDER_INTERVAL_MAX = 15;
const DEFAULT_FLIP_WINDOW = Math.round(TICKS_PER_SECOND * 0.75);

const ingredient = (name: string, key: string, essential?: boolean): AssembleIngredient => ({ name, key, ...(essential ? { essential: true } : {}) });
const secondsToTicks = (seconds: number): number => Math.round(seconds * TICKS_PER_SECOND);

export const MENU: MenuItem[] = [
  {
    name: "Classic Burger",
    icon: "🍔",
    basePay: 8,
    patience: 45,
    steps: [
      { type: "grill", label: "Grill patty", duration: secondsToTicks(8), flipAt: secondsToTicks(4), flipWindow: DEFAULT_FLIP_WINDOW },
      { type: "assemble", label: "Build burger", ingredients: [ingredient("Bun", "b", true), ingredient("Patty", "p", true), ingredient("Lettuce", "l"), ingredient("Tomato", "t"), ingredient("Ketchup", "k"), ingredient("Top bun", "b", true)] },
    ],
  },
  {
    name: "Chicken Sandwich",
    icon: "🍗",
    basePay: 9,
    patience: 50,
    steps: [
      { type: "grill", label: "Grill chicken", duration: secondsToTicks(10), flipAt: secondsToTicks(5), flipWindow: DEFAULT_FLIP_WINDOW },
      { type: "assemble", label: "Stack sandwich", ingredients: [ingredient("Bun", "b", true), ingredient("Chicken", "c", true), ingredient("Lettuce", "l"), ingredient("Mayo", "m"), ingredient("Top bun", "b", true)] },
    ],
  },
  {
    name: "Fries",
    icon: "🍟",
    basePay: 4,
    patience: 30,
    steps: [
      { type: "chop", label: "Chop potatoes", target: 10 },
      { type: "fry", label: "Drop in fryer", duration: secondsToTicks(6), flipWindow: DEFAULT_FLIP_WINDOW },
    ],
  },
  {
    name: "Garden Salad",
    icon: "🥗",
    basePay: 6,
    patience: 35,
    steps: [
      { type: "chop", label: "Chop veggies", target: 8 },
      { type: "assemble", label: "Toss salad", ingredients: [ingredient("Lettuce", "l", true), ingredient("Tomato", "t"), ingredient("Cucumber", "c"), ingredient("Onion", "o"), ingredient("Dressing", "d", true)] },
    ],
  },
  {
    name: "Milkshake",
    icon: "🥤",
    basePay: 5,
    patience: 30,
    steps: [
      { type: "assemble", label: "Load blender", ingredients: [ingredient("Milk", "m"), ingredient("Ice cream", "i"), ingredient("Syrup", "s")] },
      { type: "mix", label: "Blend smooth", target: 1200 },
    ],
  },
  {
    name: "Grilled Cheese",
    icon: "🧀",
    basePay: 5,
    patience: 35,
    steps: [
      { type: "assemble", label: "Stack sandwich", ingredients: [ingredient("Bread", "b"), ingredient("Cheese", "c"), ingredient("Top bread", "b")] },
      { type: "grill", label: "Toast sandwich", duration: secondsToTicks(6), flipAt: secondsToTicks(3), flipWindow: DEFAULT_FLIP_WINDOW },
    ],
  },
  {
    name: "Fish Tacos",
    icon: "🌮",
    basePay: 10,
    patience: 55,
    steps: [
      { type: "grill", label: "Grill fish", duration: secondsToTicks(8), flipAt: secondsToTicks(4), flipWindow: DEFAULT_FLIP_WINDOW },
      { type: "chop", label: "Prep slaw", target: 6 },
      { type: "assemble", label: "Build tacos", ingredients: [ingredient("Tortilla", "t", true), ingredient("Fish", "f", true), ingredient("Slaw", "s"), ingredient("Lime", "l"), ingredient("Sauce", "a")] },
    ],
  },
  {
    name: "Smoothie",
    icon: "🍓",
    basePay: 6,
    patience: 30,
    steps: [
      { type: "assemble", label: "Fill blender", ingredients: [ingredient("Banana", "b"), ingredient("Strawberry", "s"), ingredient("Yogurt", "y"), ingredient("Juice", "j")] },
      { type: "mix", label: "Blend smoothie", target: 800 },
    ],
  },
];

function randomOrderInterval(): number {
  return ORDER_INTERVAL_MIN + Math.random() * (ORDER_INTERVAL_MAX - ORDER_INTERVAL_MIN);
}

function getCurrentStep(order: ActiveOrder): OrderStep | undefined {
  return order.menuItem.steps[order.currentStepIndex];
}

function resetStepProgress(order: ActiveOrder): ActiveOrder {
  return {
    ...order,
    prepProgress: 0,
    prepStarted: false,
    flipped: false,
    burnt: false,
    chopCount: 0,
    lastChopKey: null,
    mixProgress: 0,
    lastMousePos: null,
    assembleIndex: 0,
  };
}

function createOrder(menuItem: MenuItem, id: number): ActiveOrder {
  // Generate customizations for assemble steps — ~35% of orders have a removed ingredient
  const customizations: Record<number, boolean[]> = {};
  menuItem.steps.forEach((step, stepIdx) => {
    if (step.type !== "assemble") return;
    const ings = step.ingredients;
    const wanted = ings.map(() => true);
    // 35% chance this order has customizations, only if non-essential optional ingredients exist
    const optionalIndices = ings.map((_, i) => i).filter((i) => !ings[i].essential);
    if (optionalIndices.length >= 1 && Math.random() < 0.35) {
      const removeCount = Math.min(optionalIndices.length, Math.random() < 0.7 ? 1 : 2);
      const shuffled = optionalIndices.sort(() => Math.random() - 0.5);
      for (let r = 0; r < removeCount; r++) {
        wanted[shuffled[r]] = false;
      }
    }
    customizations[stepIdx] = wanted;
  });

  return {
    id,
    menuItem,
    currentStepIndex: 0,
    prepProgress: 0,
    prepStarted: false,
    flipped: false,
    burnt: false,
    chopCount: 0,
    lastChopKey: null,
    mixProgress: 0,
    lastMousePos: null,
    assembleIndex: 0,
    startTime: Date.now(),
    patienceRemaining: menuItem.patience,
    completed: false,
    served: false,
    failed: false,
    failedTimer: 0,
    customizations,
    orderCorrect: true,
  };
}

// Skip past unwanted ingredients to find the next wanted index
export function nextWantedIndex(order: ActiveOrder, fromIndex: number): number {
  const step = order.menuItem.steps[order.currentStepIndex];
  if (!step || step.type !== "assemble") return fromIndex;
  const wanted = order.customizations[order.currentStepIndex];
  if (!wanted) return fromIndex;
  let idx = fromIndex;
  while (idx < step.ingredients.length && !wanted[idx]) {
    idx++;
  }
  return idx;
}

function replaceOrder(state: RestaurantState, updatedOrder: ActiveOrder, nextActiveOrderId: number | null = state.activeOrderId): RestaurantState {
  const orderSlots = state.orderSlots.map((slot) => (slot && slot.id === updatedOrder.id ? updatedOrder : slot));
  const activeStillValid = orderSlots.some((slot) => slot && slot.id === nextActiveOrderId && !slot.failed && !slot.served);
  return {
    ...state,
    orderSlots,
    activeOrderId: activeStillValid ? nextActiveOrderId : null,
  };
}

function spawnOrder(state: RestaurantState): RestaurantState {
  const emptyIdx = state.orderSlots.findIndex((slot) => slot === null);
  if (emptyIdx === -1 || state.shiftOver) return state;
  const menuItem = MENU[Math.floor(Math.random() * MENU.length)];
  const order = createOrder(menuItem, state.orderIdCounter);
  const orderSlots = [...state.orderSlots];
  orderSlots[emptyIdx] = order;
  return {
    ...state,
    orderSlots,
    orderIdCounter: state.orderIdCounter + 1,
    nextOrderTimer: randomOrderInterval(),
  };
}

export function isStepComplete(order: ActiveOrder): boolean {
  const step = getCurrentStep(order);
  if (!step) return true;

  switch (step.type) {
    case "grill":
      return order.prepStarted && !order.burnt && order.prepProgress >= step.duration && (!!order.flipped || step.flipAt == null);
    case "fry":
      return order.prepStarted && !order.burnt && order.prepProgress >= step.duration;
    case "chop":
      return order.chopCount >= step.target;
    case "mix":
      return order.mixProgress >= step.target;
    case "assemble": {
      const wanted = order.customizations[order.currentStepIndex];
      if (!wanted) return order.assembleIndex >= step.ingredients.length;
      // Complete when assembleIndex is past the last wanted ingredient
      return nextWantedIndex(order, order.assembleIndex) >= step.ingredients.length;
    }
    default:
      return false;
  }
}

export function advanceStep(order: ActiveOrder): ActiveOrder {
  const nextIndex = order.currentStepIndex + 1;
  if (nextIndex >= order.menuItem.steps.length) {
    return {
      ...resetStepProgress(order),
      currentStepIndex: nextIndex,
      completed: true,
    };
  }

  return {
    ...resetStepProgress(order),
    currentStepIndex: nextIndex,
  };
}

function maybeAdvance(order: ActiveOrder): ActiveOrder {
  return isStepComplete(order) ? advanceStep(order) : order;
}

function updateOrderTick(order: ActiveOrder, dt: number): ActiveOrder {
  if (order.served) return order;
  // Count down the failed timer — order stays visible briefly after failing
  if (order.failed) {
    return { ...order, failedTimer: order.failedTimer - dt * TICKS_PER_SECOND };
  }
  if (order.completed) return order;

  const patienceRemaining = Math.max(0, order.patienceRemaining - dt);
  let updatedOrder: ActiveOrder = { ...order, patienceRemaining };
  if (patienceRemaining <= 0) return { ...updatedOrder, failed: true, failedTimer: TICKS_PER_SECOND * 2 };

  const step = getCurrentStep(updatedOrder);
  if (!step || (step.type !== "grill" && step.type !== "fry") || !updatedOrder.prepStarted) return updatedOrder;

  const prepProgress = updatedOrder.prepProgress + dt * TICKS_PER_SECOND;
  updatedOrder = { ...updatedOrder, prepProgress };

  if (step.type === "grill" && step.flipAt != null && !updatedOrder.flipped && prepProgress > step.flipAt + step.flipWindow) {
    return { ...updatedOrder, burnt: true, failed: true, failedTimer: TICKS_PER_SECOND * 2 };
  }

  if (prepProgress > step.duration * 1.3) {
    return { ...updatedOrder, burnt: true, failed: true, failedTimer: TICKS_PER_SECOND * 2 };
  }

  return updatedOrder;
}

export function createRestaurantState(): RestaurantState {
  const baseState: RestaurantState = {
    shiftActive: true,
    orderSlots: [null, null, null, null, null],
    activeOrderId: null,
    completedOrders: 0,
    totalEarnings: 0,
    totalTips: 0,
    shiftTimeRemaining: SHIFT_DURATION_SECONDS,
    nextOrderTimer: randomOrderInterval(),
    orderIdCounter: 1,
    shiftOver: false,
  };

  return spawnOrder(baseState);
}

export function restaurantTick(state: RestaurantState, dt: number): RestaurantState {
  if (!state.shiftActive || state.shiftOver) return state;

  const shiftTimeRemaining = Math.max(0, state.shiftTimeRemaining - dt);
  const shiftOver = shiftTimeRemaining <= 0;
  // Update each slot: tick active orders, null out failed ones after their display timer expires
  const orderSlots = state.orderSlots.map((slot) => {
    if (!slot) return null;
    const updated = updateOrderTick(slot, dt);
    if (updated.failed && updated.failedTimer <= 0) return null; // timer expired, free the slot
    return updated;
  });
  const activeStillValid = orderSlots.some((slot) => slot && slot.id === state.activeOrderId && !slot.failed && !slot.served);
  const hasEmptySlot = orderSlots.some((slot) => slot === null);

  let nextState: RestaurantState = {
    ...state,
    orderSlots,
    activeOrderId: activeStillValid ? state.activeOrderId : null,
    shiftTimeRemaining,
    shiftActive: !shiftOver,
    shiftOver,
    nextOrderTimer: Math.max(0, state.nextOrderTimer - dt),
  };

  if (!shiftOver && hasEmptySlot && nextState.nextOrderTimer <= 0) {
    nextState = spawnOrder(nextState);
  }

  return nextState;
}

export function acceptOrder(state: RestaurantState, slotIndex: number): RestaurantState {
  const order = state.orderSlots[slotIndex];
  if (!order || order.failed || order.served) return state;
  if (state.activeOrderId === order.id) return state;

  return replaceOrder(state, { ...order, lastMousePos: null }, order.id);
}

export function handleKeyPress(state: RestaurantState, key: string): RestaurantState {
  const normalizedKey = key.toLowerCase();
  const activeOrder = state.orderSlots.find((slot) => slot?.id === state.activeOrderId);
  if (!activeOrder || activeOrder.completed || activeOrder.failed) return state;

  const step = getCurrentStep(activeOrder);
  if (!step) return state;

  let updatedOrder = activeOrder;

  if (step.type === "assemble") {
    const wanted = activeOrder.customizations[activeOrder.currentStepIndex];
    // Find the next wanted ingredient the player should press
    const targetIdx = wanted ? nextWantedIndex(activeOrder, activeOrder.assembleIndex) : activeOrder.assembleIndex;
    const expected = step.ingredients[targetIdx];
    if (!expected) {
      // All wanted ingredients done — advance step
      updatedOrder = maybeAdvance({ ...activeOrder, assembleIndex: step.ingredients.length });
      return replaceOrder(state, updatedOrder);
    }

    if (normalizedKey === expected.key.toLowerCase()) {
      // Correct wanted ingredient pressed — advance past it and skip any unwanted ones
      const newIndex = wanted ? nextWantedIndex(activeOrder, targetIdx + 1) : targetIdx + 1;
      updatedOrder = maybeAdvance({ ...activeOrder, assembleIndex: newIndex });
      return replaceOrder(state, updatedOrder);
    }

    // Check if they pressed an unwanted ingredient's key — mark order incorrect
    if (wanted) {
      const pressedUnwanted = step.ingredients.some(
        (ing, i) => ing.key.toLowerCase() === normalizedKey && !wanted[i] && i >= activeOrder.assembleIndex
      );
      if (pressedUnwanted) {
        return replaceOrder(state, { ...activeOrder, orderCorrect: false });
      }
    }

    return state;
  }

  if ((step.type === "grill" || step.type === "fry") && normalizedKey === "g" && !activeOrder.prepStarted) {
    updatedOrder = { ...activeOrder, prepStarted: true };
    return replaceOrder(state, updatedOrder);
  }

  if (step.type === "grill" && normalizedKey === "f" && step.flipAt != null && activeOrder.prepStarted && !activeOrder.flipped) {
    const withinWindow = Math.abs(activeOrder.prepProgress - step.flipAt) <= step.flipWindow;
    if (!withinWindow) return state;
    updatedOrder = { ...activeOrder, flipped: true };
    return replaceOrder(state, updatedOrder);
  }

  if ((step.type === "grill" || step.type === "fry") && normalizedKey === "enter") {
    if (!isStepComplete(activeOrder)) return state;
    updatedOrder = advanceStep(activeOrder);
    return replaceOrder(state, updatedOrder);
  }

  return state;
}

export function handleChopKey(state: RestaurantState, direction: "left" | "right"): RestaurantState {
  const activeOrder = state.orderSlots.find((slot) => slot?.id === state.activeOrderId);
  if (!activeOrder || activeOrder.completed || activeOrder.failed) return state;

  const step = getCurrentStep(activeOrder);
  if (!step || step.type !== "chop" || activeOrder.lastChopKey === direction) return state;

  const updatedOrder = maybeAdvance({
    ...activeOrder,
    chopCount: activeOrder.chopCount + 1,
    lastChopKey: direction,
  });

  return replaceOrder(state, updatedOrder);
}

export function handleMouseMove(state: RestaurantState, x: number, y: number): RestaurantState {
  const activeOrder = state.orderSlots.find((slot) => slot?.id === state.activeOrderId);
  if (!activeOrder || activeOrder.completed || activeOrder.failed) return state;

  const step = getCurrentStep(activeOrder);
  if (!step || step.type !== "mix") return state;

  if (!activeOrder.lastMousePos) {
    return replaceOrder(state, { ...activeOrder, lastMousePos: { x, y } });
  }

  const dx = x - activeOrder.lastMousePos.x;
  const dy = y - activeOrder.lastMousePos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const updatedOrder = maybeAdvance({
    ...activeOrder,
    mixProgress: activeOrder.mixProgress + distance,
    lastMousePos: { x, y },
  });

  return replaceOrder(state, updatedOrder);
}

export function calculateTip(order: ActiveOrder): number {
  if (!order.orderCorrect) return 0;
  const patienceRatio = Math.max(0, Math.min(1, order.patienceRemaining / order.menuItem.patience));
  return Math.round(order.menuItem.basePay * 0.6 * patienceRatio * 100) / 100;
}

export function serveOrder(state: RestaurantState, slotIndex: number): RestaurantState {
  const order = state.orderSlots[slotIndex];
  if (!order || !order.completed || order.failed) return state;

  const tip = calculateTip(order);
  const payout = order.menuItem.basePay + tip;
  // Null out the slot instead of filtering
  const orderSlots = [...state.orderSlots];
  orderSlots[slotIndex] = null;

  return {
    ...state,
    orderSlots,
    activeOrderId: state.activeOrderId === order.id ? null : state.activeOrderId,
    completedOrders: state.completedOrders + 1,
    totalEarnings: Math.round((state.totalEarnings + payout) * 100) / 100,
    totalTips: Math.round((state.totalTips + tip) * 100) / 100,
  };
}

export function finishRestaurantDay(state: GameState, earnings: number): GameState {
  const postShiftState: GameState = {
    ...state,
    day: state.day + 1,
    cash: Math.round((state.cash + earnings) * 100) / 100,
    restaurantEarnings: Math.round(earnings * 100) / 100,
    marketOpen: false,
    timeOfDay: 0,
    totalProfit: Math.round((getNetWorth({ ...state, cash: state.cash + earnings }) - 1000) * 100) / 100,
  };

  return generateDraftOptions(generateUpgradeDraft(postShiftState));
}
