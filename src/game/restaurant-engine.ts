import { GameState } from "./types";
import {
  ActiveOrder,
  AssembleIngredient,
  HoldStep,
  MemorizeStep,
  MenuItem,
  OrderStep,
  RestaurantState,
  RhythmHit,
  RhythmStep,
} from "./restaurant-types";
import { RESTAURANT_UPGRADE_POOL } from "./restaurant-upgrades";
import { getNetWorth } from "./engine";

const TICKS_PER_SECOND = 20;
const SHIFT_DURATION_SECONDS = 120;
const ORDER_INTERVAL_MIN = 8;
const ORDER_INTERVAL_MAX = 15;
const DEFAULT_FLIP_WINDOW = Math.round(TICKS_PER_SECOND * 0.75);
const DEFAULT_BURN_MULTIPLIER = 1.6;
const MEMORIZE_KEYS = ["q", "w", "e", "r", "a", "s", "d", "f"];
const BASE_MENU_NAMES = [
  "Classic Burger",
  "Chicken Sandwich",
  "Fries",
  "Garden Salad",
  "Milkshake",
  "Grilled Cheese",
  "Fish Tacos",
  "Smoothie",
];

const ingredient = (name: string, key: string, essential?: boolean): AssembleIngredient => ({
  name,
  key,
  ...(essential ? { essential: true } : {}),
});
const secondsToTicks = (seconds: number): number => Math.round(seconds * TICKS_PER_SECOND);
const holdStep = (label: string, key: string, targetMin: number, targetMax: number, maxDurationSeconds: number): HoldStep => ({
  type: "hold",
  label,
  key,
  targetMin,
  targetMax,
  maxDuration: secondsToTicks(maxDurationSeconds),
});
const memorizeStep = (label: string, sequenceLength: number, revealDurationSeconds: number): MemorizeStep => ({
  type: "memorize",
  label,
  sequenceLength,
  revealDuration: secondsToTicks(revealDurationSeconds),
});
const rhythmHits = (keys: string[], startSeconds = 0.8, spacingSeconds = 0.8, windowTicks = 4): RhythmHit[] =>
  keys.map((key, index) => ({
    key,
    targetTick: secondsToTicks(startSeconds + spacingSeconds * index),
    window: windowTicks,
  }));
const rhythmStep = (label: string, keys: string[], startSeconds?: number, spacingSeconds?: number, windowTicks?: number): RhythmStep => ({
  type: "rhythm",
  label,
  hits: rhythmHits(keys, startSeconds, spacingSeconds, windowTicks),
});

const BASE_MENU: MenuItem[] = [
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
      { type: "mix", label: "Toss it all together", target: 6000 },
    ],
  },
  {
    name: "Milkshake",
    icon: "🥤",
    basePay: 5,
    patience: 30,
    steps: [
      { type: "assemble", label: "Load blender", ingredients: [ingredient("Milk", "m", true), ingredient("Ice cream", "i", true), ingredient("Syrup", "s")] },
      { type: "mix", label: "Blend smooth", target: 5000 },
    ],
  },
  {
    name: "Grilled Cheese",
    icon: "🧀",
    basePay: 5,
    patience: 35,
    steps: [
      { type: "assemble", label: "Stack sandwich", ingredients: [ingredient("Bread", "b", true), ingredient("Cheese", "c", true), ingredient("Top bread", "b", true)] },
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
      { type: "assemble", label: "Fill blender", ingredients: [ingredient("Banana", "b", true), ingredient("Strawberry", "s", true), ingredient("Yogurt", "y"), ingredient("Juice", "j")] },
      { type: "mix", label: "Blend smoothie", target: 4000 },
    ],
  },
];

const DRAFT_MENU: MenuItem[] = [
  {
    name: "Steak",
    icon: "🥩",
    basePay: 14,
    patience: 60,
    steps: [
      holdStep("Sear steak", "h", 0.7, 0.9, 2.4),
      { type: "grill", label: "Finish on grill", duration: secondsToTicks(9), flipAt: secondsToTicks(4.5), flipWindow: DEFAULT_FLIP_WINDOW },
      { type: "assemble", label: "Plate steak", ingredients: [ingredient("Plate", "p", true), ingredient("Steak", "s", true), ingredient("Butter", "b", true), ingredient("Garnish", "g")] },
    ],
  },
  {
    name: "Pizza",
    icon: "🍕",
    basePay: 12,
    patience: 55,
    steps: [
      memorizeStep("Memorize topping ticket", 5, 3),
      { type: "assemble", label: "Build pizza", ingredients: [ingredient("Dough", "d", true), ingredient("Sauce", "s", true), ingredient("Cheese", "c", true), ingredient("Pepperoni", "p"), ingredient("Basil", "b")] },
      { type: "grill", label: "Bake pizza", duration: secondsToTicks(7), flipWindow: DEFAULT_FLIP_WINDOW },
    ],
  },
  {
    name: "Sushi Roll",
    icon: "🍣",
    basePay: 15,
    patience: 50,
    steps: [
      { type: "chop", label: "Prep fish", target: 8 },
      rhythmStep("Precise knife cuts", ["q", "w", "e", "r", "q"]),
      { type: "assemble", label: "Roll sushi", ingredients: [ingredient("Rice", "r", true), ingredient("Nori", "n", true), ingredient("Fish", "f", true), ingredient("Avocado", "a"), ingredient("Sesame", "s")] },
    ],
  },
  {
    name: "Pancakes",
    icon: "🥞",
    basePay: 7,
    patience: 35,
    steps: [
      { type: "mix", label: "Mix batter", target: 3500 },
      holdStep("Pour batter", "p", 0.62, 0.82, 2.2),
      { type: "grill", label: "Cook and flip", duration: secondsToTicks(6), flipAt: secondsToTicks(3), flipWindow: DEFAULT_FLIP_WINDOW },
    ],
  },
  {
    name: "Stir Fry",
    icon: "🥘",
    basePay: 11,
    patience: 45,
    steps: [
      { type: "chop", label: "Prep veggies", target: 7 },
      rhythmStep("Toss the wok", ["a", "s", "d", "f", "a", "s"], 0.8, 0.7),
      { type: "assemble", label: "Plate stir fry", ingredients: [ingredient("Oil", "o", true), ingredient("Veggies", "v", true), ingredient("Sauce", "s", true), ingredient("Rice", "r", true)] },
    ],
  },
  {
    name: "Soup",
    icon: "🍲",
    basePay: 8,
    patience: 40,
    steps: [
      { type: "chop", label: "Prep ingredients", target: 6 },
      { type: "mix", label: "Stir the pot", target: 3000 },
      holdStep("Simmer to finish", "s", 0.76, 0.9, 2.6),
    ],
  },
  {
    name: "Omelette",
    icon: "🍳",
    basePay: 9,
    patience: 42,
    steps: [
      { type: "chop", label: "Dice fillings", target: 6 },
      holdStep("Pour eggs", "p", 0.65, 0.82, 2),
      { type: "grill", label: "Fold omelette", duration: secondsToTicks(5.5), flipAt: secondsToTicks(2.7), flipWindow: DEFAULT_FLIP_WINDOW },
    ],
  },
  {
    name: "Burrito",
    icon: "🌯",
    basePay: 10,
    patience: 48,
    steps: [
      { type: "chop", label: "Prep salsa", target: 6 },
      { type: "assemble", label: "Roll burrito", ingredients: [ingredient("Tortilla", "t", true), ingredient("Rice", "r", true), ingredient("Beans", "b", true), ingredient("Chicken", "c"), ingredient("Salsa", "s"), ingredient("Cheese", "h")] },
      holdStep("Toast burrito", "t", 0.7, 0.88, 2.3),
    ],
  },
  {
    name: "Ramen",
    icon: "🍜",
    basePay: 13,
    patience: 52,
    steps: [
      memorizeStep("Memorize topping callout", 4, 3),
      { type: "mix", label: "Whisk broth", target: 4500 },
      { type: "assemble", label: "Build ramen bowl", ingredients: [ingredient("Noodles", "n", true), ingredient("Broth", "b", true), ingredient("Egg", "e"), ingredient("Scallion", "s"), ingredient("Pork", "p")] },
    ],
  },
  {
    name: "Nachos",
    icon: "🧆",
    basePay: 7,
    patience: 38,
    steps: [
      rhythmStep("Layer toppings fast", ["q", "e", "w", "r"], 0.7, 0.65),
      { type: "assemble", label: "Finish nachos", ingredients: [ingredient("Chips", "c", true), ingredient("Cheese", "h", true), ingredient("Jalapeño", "j"), ingredient("Beans", "b"), ingredient("Salsa", "s")] },
      { type: "grill", label: "Melt cheese", duration: secondsToTicks(4.5), flipWindow: DEFAULT_FLIP_WINDOW },
    ],
  },
  {
    name: "Ice Cream Sundae",
    icon: "🍨",
    basePay: 6,
    patience: 32,
    steps: [
      memorizeStep("Memorize topping combo", 4, 3),
      { type: "assemble", label: "Build sundae", ingredients: [ingredient("Cup", "c", true), ingredient("Ice Cream", "i", true), ingredient("Fudge", "f"), ingredient("Cherry", "h"), ingredient("Nuts", "n")] },
      { type: "mix", label: "Final swirl", target: 2500 },
    ],
  },
  {
    name: "Kebabs",
    icon: "🍢",
    basePay: 11,
    patience: 46,
    steps: [
      { type: "chop", label: "Prep skewers", target: 7 },
      rhythmStep("Thread the skewer", ["a", "d", "s", "f", "d"]),
      { type: "grill", label: "Char kebabs", duration: secondsToTicks(7.5), flipAt: secondsToTicks(3.8), flipWindow: DEFAULT_FLIP_WINDOW },
    ],
  },
];

export const MENU: MenuItem[] = BASE_MENU;
export const MENU_POOL: MenuItem[] = [...BASE_MENU, ...DRAFT_MENU];

function restaurantUpgradeCount(source: GameState | string[], id: string): number {
  const upgrades = Array.isArray(source) ? source : source.acquiredRestaurantUpgrades;
  return upgrades.filter((upgrade) => upgrade === id).length;
}

function hasRestaurantUpgrade(source: GameState | string[], id: string): boolean {
  return restaurantUpgradeCount(source, id) > 0;
}

function randomOrderInterval(upgrades: string[] = []): number {
  const rushMultiplier = hasRestaurantUpgrade(upgrades, "rush_hour") ? 0.75 : 1;
  return (ORDER_INTERVAL_MIN + Math.random() * (ORDER_INTERVAL_MAX - ORDER_INTERVAL_MIN)) * rushMultiplier;
}

function getCurrentStep(order: ActiveOrder): OrderStep | undefined {
  return order.menuItem.steps[order.currentStepIndex];
}

function cloneMenuItem(menuItem: MenuItem): MenuItem {
  return {
    ...menuItem,
    steps: menuItem.steps.map((step) => {
      if (step.type === "assemble") return { ...step, ingredients: step.ingredients.map((ingredientItem) => ({ ...ingredientItem })) };
      if (step.type === "rhythm") return { ...step, hits: step.hits.map((hit) => ({ ...hit })) };
      return { ...step };
    }),
  };
}

function applyMenuItemUpgrades(menuItem: MenuItem, upgrades: string[]): MenuItem {
  const fastGrillStacks = restaurantUpgradeCount(upgrades, "fast_grill");
  const sharpKnifeStacks = restaurantUpgradeCount(upgrades, "sharp_knives");
  const mixerStacks = restaurantUpgradeCount(upgrades, "power_mixer");
  const patienceStacks = restaurantUpgradeCount(upgrades, "patient_customers");
  const memoryStacks = restaurantUpgradeCount(upgrades, "memory_boost");
  const rhythmAssist = hasRestaurantUpgrade(upgrades, "rhythm_assist");
  const forgivingFlip = hasRestaurantUpgrade(upgrades, "forgiving_flip");

  const clone = cloneMenuItem(menuItem);
  return {
    ...clone,
    patience: Math.round(clone.patience * 1.2 ** patienceStacks),
    steps: clone.steps.map((step) => {
      switch (step.type) {
        case "grill":
        case "fry":
          return {
            ...step,
            duration: Math.max(1, Math.round(step.duration * 0.8 ** fastGrillStacks)),
            flipWindow: Math.max(1, Math.round(step.flipWindow * (forgivingFlip ? 1.5 : 1))),
          };
        case "chop":
          return { ...step, target: Math.max(1, Math.round(step.target * 0.7 ** sharpKnifeStacks)) };
        case "mix":
          return { ...step, target: Math.max(1, Math.round(step.target * 0.7 ** mixerStacks)) };
        case "rhythm":
          return {
            ...step,
            hits: step.hits.map((hit) => ({
              ...hit,
              window: Math.max(1, Math.round(hit.window * (rhythmAssist ? 1.4 : 1))),
            })),
          };
        case "memorize":
          return { ...step, revealDuration: step.revealDuration + memoryStacks * TICKS_PER_SECOND };
        default:
          return step;
      }
    }),
  };
}

function getAvailableMenu(state: GameState): MenuItem[] {
  const drafted = MENU_POOL.filter(
    (menuItem) => !BASE_MENU_NAMES.includes(menuItem.name) && state.draftedMenuItems.includes(menuItem.name),
  );
  return [...MENU, ...drafted].map((menuItem) => applyMenuItemUpgrades(menuItem, state.acquiredRestaurantUpgrades));
}

function generateMemorizeSequence(length: number): string[] {
  return Array.from({ length }, () => MEMORIZE_KEYS[Math.floor(Math.random() * MEMORIZE_KEYS.length)]);
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
    rhythmHitIndex: 0,
    rhythmHits: 0,
    rhythmResults: [],
    holdStartTick: null,
    holdProgress: 0,
    holdReleased: false,
    memorizeSequence: [],
    memorizeRevealed: false,
    memorizeRevealTimer: 0,
    memorizeInputIndex: 0,
  };
}

function initializeCurrentStep(order: ActiveOrder, upgrades: string[]): ActiveOrder {
  const step = getCurrentStep(order);
  if (!step) return order;

  if (step.type === "assemble" && hasRestaurantUpgrade(upgrades, "speed_hands")) {
    // Auto-add the first ingredient
    return { ...order, assembleIndex: 1 };
  }

  if (step.type === "rhythm") {
    return {
      ...order,
      prepProgress: 0,
      rhythmHitIndex: 0,
      rhythmHits: 0,
      rhythmResults: step.hits.map(() => "pending"),
    };
  }

  if (step.type === "hold") {
    return {
      ...order,
      prepProgress: 0,
      holdStartTick: null,
      holdProgress: 0,
      holdReleased: false,
    };
  }

  if (step.type === "memorize") {
    return {
      ...order,
      memorizeSequence: generateMemorizeSequence(step.sequenceLength),
      memorizeRevealed: true,
      memorizeRevealTimer: step.revealDuration,
      memorizeInputIndex: 0,
    };
  }

  return order;
}

function createOrder(menuItem: MenuItem, id: number, upgrades: string[]): ActiveOrder {
  const customizations: Record<number, boolean[]> = {};
  menuItem.steps.forEach((step, stepIdx) => {
    if (step.type !== "assemble") return;
    const wanted = step.ingredients.map(() => true);
    const optionalIndices = step.ingredients.map((_, index) => index).filter((index) => !step.ingredients[index].essential);
    if (optionalIndices.length >= 1 && Math.random() < 0.35) {
      const removeCount = Math.min(optionalIndices.length, Math.random() < 0.7 ? 1 : 2);
      const shuffled = [...optionalIndices].sort(() => Math.random() - 0.5);
      for (let removeIndex = 0; removeIndex < removeCount; removeIndex += 1) {
        wanted[shuffled[removeIndex]] = false;
      }
    }
    customizations[stepIdx] = wanted;
  });

  return initializeCurrentStep(
    {
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
      rhythmHitIndex: 0,
      rhythmHits: 0,
      rhythmResults: [],
      holdStartTick: null,
      holdProgress: 0,
      holdReleased: false,
      memorizeSequence: [],
      memorizeRevealed: false,
      memorizeRevealTimer: 0,
      memorizeInputIndex: 0,
      startTime: Date.now(),
      patienceRemaining: menuItem.patience,
      completed: false,
      served: false,
      failed: false,
      failedTimer: 0,
      customizations,
      orderCorrect: true,
    },
    upgrades,
  );
}

export function nextWantedIndex(order: ActiveOrder, fromIndex: number): number {
  const step = order.menuItem.steps[order.currentStepIndex];
  if (!step || step.type !== "assemble") return fromIndex;
  const wanted = order.customizations[order.currentStepIndex];
  if (!wanted) return fromIndex;
  let index = fromIndex;
  while (index < step.ingredients.length && !wanted[index]) index += 1;
  return index;
}

function replaceOrder(
  state: RestaurantState,
  updatedOrder: ActiveOrder,
  nextActiveOrderId: number | null = state.activeOrderId,
): RestaurantState {
  const orderSlots = state.orderSlots.map((slot) => (slot && slot.id === updatedOrder.id ? updatedOrder : slot));
  const activeStillValid = orderSlots.some(
    (slot) => slot && slot.id === nextActiveOrderId && !slot.failed && !slot.served,
  );
  return {
    ...state,
    orderSlots,
    activeOrderId: activeStillValid ? nextActiveOrderId : null,
  };
}

function spawnOrder(state: RestaurantState): RestaurantState {
  const emptyIndex = state.orderSlots.findIndex((slot) => slot === null);
  if (emptyIndex === -1 || state.shiftOver || state.availableMenu.length === 0) return state;
  const menuItem = state.availableMenu[Math.floor(Math.random() * state.availableMenu.length)];
  const order = createOrder(menuItem, state.orderIdCounter, state.acquiredUpgrades);
  const orderSlots = [...state.orderSlots];
  orderSlots[emptyIndex] = order;
  return {
    ...state,
    orderSlots,
    orderIdCounter: state.orderIdCounter + 1,
    nextOrderTimer: randomOrderInterval(state.acquiredUpgrades),
  };
}

export function isStepComplete(order: ActiveOrder): boolean {
  const step = getCurrentStep(order);
  if (!step) return true;

  switch (step.type) {
    case "grill":
      return (
        order.prepStarted &&
        !order.burnt &&
        order.prepProgress >= step.duration &&
        (!!order.flipped || step.flipAt == null)
      );
    case "fry":
      return order.prepStarted && !order.burnt && order.prepProgress >= step.duration;
    case "chop":
      return order.chopCount >= step.target;
    case "mix":
      return order.mixProgress >= step.target;
    case "assemble":
      return order.assembleIndex >= step.ingredients.length;
    case "rhythm":
      return order.rhythmHitIndex >= step.hits.length;
    case "hold":
      return order.holdReleased;
    case "memorize":
      return order.memorizeInputIndex >= order.memorizeSequence.length && order.memorizeSequence.length > 0;
    default:
      return false;
  }
}

function advanceStep(order: ActiveOrder, upgrades: string[]): ActiveOrder {
  const nextIndex = order.currentStepIndex + 1;
  if (nextIndex >= order.menuItem.steps.length) {
    return {
      ...resetStepProgress(order),
      currentStepIndex: nextIndex,
      completed: true,
    };
  }

  return initializeCurrentStep(
    {
      ...resetStepProgress(order),
      currentStepIndex: nextIndex,
    },
    upgrades,
  );
}

function maybeAdvance(order: ActiveOrder, upgrades: string[]): ActiveOrder {
  return isStepComplete(order) ? advanceStep(order, upgrades) : order;
}

function getBurnMultiplier(upgrades: string[]): number {
  return DEFAULT_BURN_MULTIPLIER * (hasRestaurantUpgrade(upgrades, "burn_resist") ? 1.5 : 1);
}

function markRhythmResult(order: ActiveOrder, index: number, result: "hit" | "miss"): ActiveOrder {
  const rhythmResults = order.rhythmResults.length > 0 ? [...order.rhythmResults] : [];
  if (index >= 0 && index < rhythmResults.length) rhythmResults[index] = result;
  return { ...order, rhythmResults };
}

function updateOrderTick(order: ActiveOrder, dt: number, upgrades: string[]): ActiveOrder {
  if (order.served) return order;
  if (order.failed) return { ...order, failedTimer: order.failedTimer - dt * TICKS_PER_SECOND };
  if (order.completed) return order;

  const patienceRemaining = Math.max(0, order.patienceRemaining - dt);
  let updatedOrder: ActiveOrder = { ...order, patienceRemaining };
  if (patienceRemaining <= 0) return { ...updatedOrder, failed: true, failedTimer: TICKS_PER_SECOND * 2 };

  const step = getCurrentStep(updatedOrder);
  if (!step) return updatedOrder;

  if ((step.type === "grill" || step.type === "fry") && updatedOrder.prepStarted) {
    const prepProgress = updatedOrder.prepProgress + dt * TICKS_PER_SECOND;
    updatedOrder = { ...updatedOrder, prepProgress };

    if (
      step.type === "grill" &&
      step.flipAt != null &&
      !updatedOrder.flipped &&
      prepProgress > step.flipAt + step.flipWindow
    ) {
      return { ...updatedOrder, burnt: true, failed: true, failedTimer: TICKS_PER_SECOND * 2 };
    }

    if (prepProgress > step.duration * getBurnMultiplier(upgrades)) {
      return { ...updatedOrder, burnt: true, failed: true, failedTimer: TICKS_PER_SECOND * 2 };
    }

    return updatedOrder;
  }

  if (step.type === "rhythm") {
    let rhythmOrder: ActiveOrder = { ...updatedOrder, prepProgress: updatedOrder.prepProgress + dt * TICKS_PER_SECOND };
    while (rhythmOrder.rhythmHitIndex < step.hits.length) {
      const currentHit = step.hits[rhythmOrder.rhythmHitIndex];
      if (rhythmOrder.prepProgress <= currentHit.targetTick + currentHit.window) break;
      rhythmOrder = markRhythmResult(rhythmOrder, rhythmOrder.rhythmHitIndex, "miss");
      rhythmOrder = { ...rhythmOrder, rhythmHitIndex: rhythmOrder.rhythmHitIndex + 1 };
    }
    return maybeAdvance(rhythmOrder, upgrades);
  }

  if (step.type === "hold" && updatedOrder.holdStartTick != null && !updatedOrder.holdReleased) {
    const prepProgress = updatedOrder.prepProgress + dt * TICKS_PER_SECOND;
    const holdProgress = Math.min(1, prepProgress / step.maxDuration);
    updatedOrder = { ...updatedOrder, prepProgress, holdProgress };
    if (prepProgress >= step.maxDuration) {
      return advanceStep(
        { ...updatedOrder, holdReleased: true, orderCorrect: false },
        upgrades,
      );
    }
    return updatedOrder;
  }

  if (step.type === "memorize" && updatedOrder.memorizeRevealed) {
    const memorizeRevealTimer = Math.max(0, updatedOrder.memorizeRevealTimer - dt * TICKS_PER_SECOND);
    return {
      ...updatedOrder,
      memorizeRevealTimer,
      memorizeRevealed: memorizeRevealTimer > 0,
    };
  }

  return updatedOrder;
}

export function createRestaurantState(state: GameState): RestaurantState {
  const baseState: RestaurantState = {
    shiftActive: true,
    orderSlots: Array.from({ length: hasRestaurantUpgrade(state, "sixth_slot") ? 6 : 5 }, () => null),
    activeOrderId: null,
    completedOrders: 0,
    totalEarnings: 0,
    totalTips: 0,
    shiftTimeRemaining: SHIFT_DURATION_SECONDS + restaurantUpgradeCount(state, "longer_shift") * 30,
    nextOrderTimer: randomOrderInterval(state.acquiredRestaurantUpgrades),
    orderIdCounter: 1,
    shiftOver: false,
    availableMenu: getAvailableMenu(state),
    acquiredUpgrades: [...state.acquiredRestaurantUpgrades],
    comboStreak: 0,
  };

  return spawnOrder(baseState);
}

export function restaurantTick(state: RestaurantState, dt: number): RestaurantState {
  if (!state.shiftActive || state.shiftOver) return state;

  const shiftTimeRemaining = Math.max(0, state.shiftTimeRemaining - dt);
  const shiftOver = shiftTimeRemaining <= 0;
  let failureOccurred = false;
  const orderSlots = state.orderSlots.map((slot) => {
    if (!slot) return null;
    const updated = updateOrderTick(slot, dt, state.acquiredUpgrades);
    if (!slot.failed && updated.failed) failureOccurred = true;
    if (updated.failed && updated.failedTimer <= 0) return null;
    return updated;
  });
  const activeStillValid = orderSlots.some(
    (slot) => slot && slot.id === state.activeOrderId && !slot.failed && !slot.served,
  );
  const hasEmptySlot = orderSlots.some((slot) => slot === null);

  let nextState: RestaurantState = {
    ...state,
    orderSlots,
    activeOrderId: activeStillValid ? state.activeOrderId : null,
    shiftTimeRemaining,
    shiftActive: !shiftOver,
    shiftOver,
    nextOrderTimer: Math.max(0, state.nextOrderTimer - dt),
    comboStreak: failureOccurred ? 0 : state.comboStreak,
  };

  if (!shiftOver && hasEmptySlot && nextState.nextOrderTimer <= 0) nextState = spawnOrder(nextState);
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

  if (step.type === "assemble") {
    const currentIngredient = step.ingredients[activeOrder.assembleIndex];
    if (!currentIngredient) {
      return replaceOrder(state, maybeAdvance({ ...activeOrder, assembleIndex: step.ingredients.length }, state.acquiredUpgrades));
    }

    const wanted = activeOrder.customizations[activeOrder.currentStepIndex];

    // Press the ingredient's key to ADD it
    if (normalizedKey === currentIngredient.key.toLowerCase()) {
      const isWanted = !wanted || wanted[activeOrder.assembleIndex];
      const newOrder = {
        ...activeOrder,
        assembleIndex: activeOrder.assembleIndex + 1,
        // Adding an unwanted ingredient makes the order incorrect
        orderCorrect: activeOrder.orderCorrect && isWanted,
      };
      return replaceOrder(state, maybeAdvance(newOrder, state.acquiredUpgrades));
    }

    // Press Space to SKIP the current ingredient (don't add it)
    if (key === " ") {
      const isWanted = !wanted || wanted[activeOrder.assembleIndex];
      const newOrder = {
        ...activeOrder,
        assembleIndex: activeOrder.assembleIndex + 1,
        // Skipping a wanted ingredient makes the order incorrect
        orderCorrect: activeOrder.orderCorrect && !isWanted,
      };
      return replaceOrder(state, maybeAdvance(newOrder, state.acquiredUpgrades));
    }

    return state;
  }

  if ((step.type === "grill" || step.type === "fry") && normalizedKey === "g" && !activeOrder.prepStarted) {
    return replaceOrder(state, { ...activeOrder, prepStarted: true });
  }

  if (
    step.type === "grill" &&
    normalizedKey === "f" &&
    step.flipAt != null &&
    activeOrder.prepStarted &&
    !activeOrder.flipped
  ) {
    const withinWindow = Math.abs(activeOrder.prepProgress - step.flipAt) <= step.flipWindow;
    if (!withinWindow) return state;
    return replaceOrder(state, { ...activeOrder, flipped: true });
  }

  if ((step.type === "grill" || step.type === "fry") && (normalizedKey === "enter" || normalizedKey === "g")) {
    if (!isStepComplete(activeOrder)) return state;
    return replaceOrder(state, advanceStep(activeOrder, state.acquiredUpgrades));
  }

  if (step.type === "rhythm") {
    const currentHit = step.hits[activeOrder.rhythmHitIndex];
    if (!currentHit || normalizedKey !== currentHit.key.toLowerCase()) return state;

    const withinWindow = Math.abs(activeOrder.prepProgress - currentHit.targetTick) <= currentHit.window;
    const resultOrder = markRhythmResult(activeOrder, activeOrder.rhythmHitIndex, withinWindow ? "hit" : "miss");
    const updatedOrder = maybeAdvance(
      {
        ...resultOrder,
        rhythmHitIndex: activeOrder.rhythmHitIndex + 1,
        rhythmHits: activeOrder.rhythmHits + (withinWindow ? 1 : 0),
      },
      state.acquiredUpgrades,
    );
    return replaceOrder(state, updatedOrder);
  }

  if (step.type === "hold") {
    if (normalizedKey !== step.key.toLowerCase() || activeOrder.holdStartTick != null || activeOrder.holdReleased) return state;
    return replaceOrder(state, {
      ...activeOrder,
      holdStartTick: Math.round(activeOrder.prepProgress),
    });
  }

  if (step.type === "memorize") {
    if (activeOrder.memorizeRevealed) return state;
    const expected = activeOrder.memorizeSequence[activeOrder.memorizeInputIndex];
    if (!expected) return state;

    if (normalizedKey === expected) {
      const updatedOrder = maybeAdvance(
        {
          ...activeOrder,
          memorizeInputIndex: activeOrder.memorizeInputIndex + 1,
        },
        state.acquiredUpgrades,
      );
      return replaceOrder(state, updatedOrder);
    }

    return replaceOrder(
      state,
      advanceStep(
        {
          ...activeOrder,
          memorizeInputIndex: activeOrder.memorizeInputIndex,
          orderCorrect: false,
        },
        state.acquiredUpgrades,
      ),
    );
  }

  return state;
}

export function handleKeyUp(state: RestaurantState, key: string): RestaurantState {
  const normalizedKey = key.toLowerCase();
  const activeOrder = state.orderSlots.find((slot) => slot?.id === state.activeOrderId);
  if (!activeOrder || activeOrder.completed || activeOrder.failed) return state;

  const step = getCurrentStep(activeOrder);
  if (!step || step.type !== "hold") return state;
  if (normalizedKey !== step.key.toLowerCase() || activeOrder.holdStartTick == null || activeOrder.holdReleased) return state;

  const releasedInZone = activeOrder.holdProgress >= step.targetMin && activeOrder.holdProgress <= step.targetMax;
  const updatedOrder = advanceStep(
    {
      ...activeOrder,
      holdReleased: true,
      orderCorrect: activeOrder.orderCorrect && releasedInZone,
    },
    state.acquiredUpgrades,
  );
  return replaceOrder(state, updatedOrder);
}

export function handleChopKey(state: RestaurantState, direction: "left" | "right"): RestaurantState {
  const activeOrder = state.orderSlots.find((slot) => slot?.id === state.activeOrderId);
  if (!activeOrder || activeOrder.completed || activeOrder.failed) return state;

  const step = getCurrentStep(activeOrder);
  if (!step || step.type !== "chop" || activeOrder.lastChopKey === direction) return state;

  return replaceOrder(
    state,
    maybeAdvance(
      {
        ...activeOrder,
        chopCount: activeOrder.chopCount + 1,
        lastChopKey: direction,
      },
      state.acquiredUpgrades,
    ),
  );
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
  return replaceOrder(
    state,
    maybeAdvance(
      {
        ...activeOrder,
        mixProgress: activeOrder.mixProgress + distance,
        lastMousePos: { x, y },
      },
      state.acquiredUpgrades,
    ),
  );
}

function getOrderBasePay(order: ActiveOrder, upgrades: string[]): number {
  let multiplier = 1;
  if (order.menuItem.basePay < 7 && hasRestaurantUpgrade(upgrades, "appetizer_bonus")) multiplier *= 1.4;
  if (order.menuItem.basePay >= 10 && hasRestaurantUpgrade(upgrades, "entree_bonus")) multiplier *= 1.25;
  return Math.round(order.menuItem.basePay * multiplier * 100) / 100;
}

export function calculateTip(order: ActiveOrder, upgrades: string[] = []): number {
  if (!order.orderCorrect) return 0;
  const patienceRatio = Math.max(0, Math.min(1, order.patienceRemaining / order.menuItem.patience));
  const charmMultiplier = 1.3 ** restaurantUpgradeCount(upgrades, "charm");
  return Math.round(order.menuItem.basePay * 0.6 * patienceRatio * charmMultiplier * 100) / 100;
}

export function serveOrder(state: RestaurantState, slotIndex: number): RestaurantState {
  const order = state.orderSlots[slotIndex];
  if (!order || !order.completed || order.failed) return state;

  const tip = calculateTip(order, state.acquiredUpgrades);
  const basePay = getOrderBasePay(order, state.acquiredUpgrades);
  const nextComboStreak = state.comboStreak + 1;
  const comboBonus = hasRestaurantUpgrade(state.acquiredUpgrades, "combo_bonus") && nextComboStreak % 3 === 0 ? 3 : 0;
  const payout = basePay + tip + comboBonus;
  const orderSlots = [...state.orderSlots];
  orderSlots[slotIndex] = null;

  return {
    ...state,
    orderSlots,
    activeOrderId: state.activeOrderId === order.id ? null : state.activeOrderId,
    completedOrders: state.completedOrders + 1,
    totalEarnings: Math.round((state.totalEarnings + payout) * 100) / 100,
    totalTips: Math.round((state.totalTips + tip) * 100) / 100,
    comboStreak: nextComboStreak,
  };
}

export function generateRestaurantUpgradeDraft(state: GameState): GameState {
  const available = RESTAURANT_UPGRADE_POOL.filter(
    (upgrade) => restaurantUpgradeCount(state, upgrade.id) < upgrade.maxStacks,
  );
  const pool = [...available];
  const picked: string[] = [];
  const count = Math.min(3, pool.length);
  for (let index = 0; index < count; index += 1) {
    const pickIndex = Math.floor(Math.random() * pool.length);
    picked.push(pool[pickIndex].id);
    pool.splice(pickIndex, 1);
  }
  return { ...state, restaurantUpgradeDraftOptions: picked };
}

export function generateMenuDraft(state: GameState): GameState {
  const draftedNames = new Set([...BASE_MENU_NAMES, ...state.draftedMenuItems]);
  const available = MENU_POOL.filter((menuItem) => !draftedNames.has(menuItem.name));
  const pool = [...available];
  const picked: MenuItem[] = [];
  const count = Math.min(3, pool.length);
  for (let index = 0; index < count; index += 1) {
    const pickIndex = Math.floor(Math.random() * pool.length);
    picked.push(cloneMenuItem(pool[pickIndex]));
    pool.splice(pickIndex, 1);
  }
  return { ...state, menuDraftOptions: picked };
}

export function acquireRestaurantUpgrade(state: GameState, upgradeId: string): GameState {
  const upgrade = RESTAURANT_UPGRADE_POOL.find((candidate) => candidate.id === upgradeId);
  if (!upgrade || restaurantUpgradeCount(state, upgradeId) >= upgrade.maxStacks) return state;
  return {
    ...state,
    acquiredRestaurantUpgrades: [...state.acquiredRestaurantUpgrades, upgradeId],
    restaurantUpgradeDraftOptions: [],
  };
}

export function draftMenuItem(state: GameState, itemName: string): GameState {
  const chosen = state.menuDraftOptions.find((menuItem) => menuItem.name === itemName);
  if (!chosen) return state;
  return {
    ...state,
    draftedMenuItems: [...state.draftedMenuItems, itemName],
    menuDraftOptions: [],
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
    upgradeDraftOptions: [],
    stockDraftOptions: [],
  };

  return generateMenuDraft(generateRestaurantUpgradeDraft(postShiftState));
}
