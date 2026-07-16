import { GameState } from "./types";
import { createRestaurantTracker } from "./challenges";
import {
  ActiveChore,
  ActiveOrder,
  AssembleIngredient,
  ChoreType,
  DishSpot,
  HoldStep,
  MemorizeStep,
  MenuItem,
  OrderStep,
  RestaurantOrderLog,
  RestaurantState,
  RhythmHit,
  RhythmStep,
  TrashBag,
} from "./restaurant-types";
import { RESTAURANT_UPGRADE_POOL } from "./restaurant-upgrades";
import { getNetWorth } from "./engine";
import { pickSchmoozeRounds, shuffleOptions } from "./schmooze-data";

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

function randomOrderInterval(upgrades: string[] = [], numCounters = 1): number {
  const rushMultiplier = hasRestaurantUpgrade(upgrades, "rush_hour") ? 0.75 : 1;
  // Scale order frequency by number of counters (more players = more orders)
  const counterScale = numCounters > 1 ? 1 / numCounters : 1;
  return (ORDER_INTERVAL_MIN + Math.random() * (ORDER_INTERVAL_MAX - ORDER_INTERVAL_MIN)) * rushMultiplier * counterScale;
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
    memorizeInputDelay: 0,
  };
}

function initializeCurrentStep(order: ActiveOrder, upgrades: string[]): ActiveOrder {
  const step = getCurrentStep(order);
  if (!step) return order;

  if (step.type === "assemble") {
    let startIndex = 0;
    if (hasRestaurantUpgrade(upgrades, "speed_hands")) {
      startIndex = 1;
    }
    return { ...order, assembleIndex: startIndex };
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
      memorizeRevealed: false,
      memorizeRevealTimer: 0,
      memorizeInputIndex: 0,
      memorizeInputDelay: 0,
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
      memorizeInputDelay: 0,
      startTime: Date.now(),
      patienceRemaining: menuItem.patience,
      completed: false,
      served: false,
      failed: false,
      failedTimer: 0,
      customizations,
      orderCorrect: true,
      isInsider: false,
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
  if (state.shiftOver || state.availableMenu.length === 0) return state;

  // Pick a target counter with some randomness (not always balanced)
  let emptyIndex = -1;
  if (state.numCounters > 1) {
    // Weight toward counters that have more empty slots (but still random)
    const counterWeights: number[] = [];
    for (let c = 0; c < state.numCounters; c++) {
      const start = c * state.slotsPerCounter;
      const end = start + state.slotsPerCounter;
      const emptyCount = state.orderSlots.slice(start, end).filter((s, i) => s === null && (start + i) !== state.choreSlotIndex).length;
      // Weight: empties + 1 random factor to create imbalance
      counterWeights.push(emptyCount > 0 ? emptyCount + Math.random() * 2 : 0);
    }
    const totalWeight = counterWeights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return state;
    let roll = Math.random() * totalWeight;
    let targetCounter = 0;
    for (let c = 0; c < state.numCounters; c++) {
      roll -= counterWeights[c];
      if (roll <= 0) { targetCounter = c; break; }
    }
    // Find first empty slot in target counter (skip chore slot)
    const start = targetCounter * state.slotsPerCounter;
    const end = start + state.slotsPerCounter;
    for (let i = start; i < end; i++) {
      if (state.orderSlots[i] === null && i !== state.choreSlotIndex) { emptyIndex = i; break; }
    }
  } else {
    emptyIndex = state.orderSlots.findIndex((slot, i) => slot === null && i !== state.choreSlotIndex);
  }

  if (emptyIndex === -1) return state;
  const menuItem = state.availableMenu[Math.floor(Math.random() * state.availableMenu.length)];
  const order = createOrder(menuItem, state.orderIdCounter, state.acquiredUpgrades);

  // ~15% chance to be an insider customer, max 1 per shift
  const hasInsiderAlready = state.orderSlots.some((o) => o?.isInsider) || state.insiderServed;
  if (!hasInsiderAlready && Math.random() < 0.15) {
    order.isInsider = true;
  }

  const orderSlots = [...state.orderSlots];
  orderSlots[emptyIndex] = order;
  return {
    ...state,
    orderSlots,
    orderIdCounter: state.orderIdCounter + 1,
    nextOrderTimer: randomOrderInterval(state.acquiredUpgrades, state.numCounters),
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
    case "assemble": {
      if (order.assembleIndex >= step.ingredients.length) return true;
      // Also complete if all remaining ingredients are unwanted
      const w = order.customizations[order.currentStepIndex];
      if (w) {
        for (let i = order.assembleIndex; i < step.ingredients.length; i++) {
          if (w[i]) return false; // still a wanted ingredient left
        }
        return true;
      }
      return false;
    }
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

function updateOrderTick(order: ActiveOrder, dt: number, upgrades: string[], patienceMultiplier = 1, cookSpeedMultiplier = 1): ActiveOrder {
  // Schmoozing orders still tick patience, but nothing else
  if (order.schmoozing) {
    // If showing a result message, count down the timer
    if (order.schmoozing.resultTimer != null && order.schmoozing.resultTimer > 0) {
      const resultTimer = order.schmoozing.resultTimer - 1;
      if (resultTimer <= 0) {
        // Timer expired — remove order from slot
        return { ...order, failed: true, failedTimer: 0 };
      }
      return { ...order, schmoozing: { ...order.schmoozing, resultTimer } };
    }
    const patienceRemaining = Math.max(0, order.patienceRemaining - dt * patienceMultiplier);
    if (patienceRemaining <= 0) return { ...order, patienceRemaining: 0, failed: true, failedTimer: TICKS_PER_SECOND * 2 };
    return { ...order, patienceRemaining };
  }
  if (order.served) return order;
  if (order.failed) return { ...order, failedTimer: order.failedTimer - dt * TICKS_PER_SECOND };

  const patienceRemaining = Math.max(0, order.patienceRemaining - dt * patienceMultiplier);
  let updatedOrder: ActiveOrder = { ...order, patienceRemaining };

  // Completed orders still lose patience but don't fail
  if (order.completed) {
    if (patienceRemaining <= 0) return { ...updatedOrder, failed: true, failedTimer: TICKS_PER_SECOND * 2 };
    return updatedOrder;
  }

  if (patienceRemaining <= 0) return { ...updatedOrder, failed: true, failedTimer: TICKS_PER_SECOND * 2 };

  const step = getCurrentStep(updatedOrder);
  if (!step) return updatedOrder;

  if ((step.type === "grill" || step.type === "fry") && updatedOrder.prepStarted) {
    const prepProgress = updatedOrder.prepProgress + dt * TICKS_PER_SECOND * cookSpeedMultiplier;
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
    if (memorizeRevealTimer <= 0) {
      // Reveal ended — start 2-second input delay
      return { ...updatedOrder, memorizeRevealed: false, memorizeRevealTimer: 0, memorizeInputDelay: secondsToTicks(2) };
    }
    return { ...updatedOrder, memorizeRevealTimer };
  }

  // Tick down the input delay after memorize reveal
  if (step.type === "memorize" && updatedOrder.memorizeInputDelay > 0) {
    return { ...updatedOrder, memorizeInputDelay: Math.max(0, updatedOrder.memorizeInputDelay - dt * TICKS_PER_SECOND) };
  }

  return updatedOrder;
}

// --- Chore system ---

const CHORE_TYPES: ChoreType[] = ["wash_dishes", "take_out_trash", "mop_floor", "stack_plates", "break_down_recycling"];
const CHORE_TIMER = 30; // seconds before chore blocks serving

function createChore(id: number): ActiveChore {
  const type = CHORE_TYPES[Math.floor(Math.random() * CHORE_TYPES.length)];
  const base: ActiveChore = {
    id,
    type,
    timer: CHORE_TIMER,
    timerExpired: false,
    completed: false,
    dishSpots: [],
    trashBags: [],
    mopPhase: "dunk",
    mopCycles: 0,
    mopCyclesNeeded: 3,
    mopSqueezeCount: 0,
    mopSwipeCount: 0,
    mopLastDirection: null,
    platePosition: 0,
    plateDirection: 1,
    plateSpeed: 0.02,
    platesStacked: 0,
    platesNeeded: 6,
    lastPlatePosition: 0.5,
    plateMissed: false,
    recyclePhase: "click",
    recycleClicks: 0,
    recycleClicksNeeded: 8,
    recycleArrows: 0,
    recycleArrowsNeeded: 8,
    recycleCycles: 0,
    recycleCyclesNeeded: 3,
  };

  switch (type) {
    case "wash_dishes": {
      const spots: DishSpot[] = [];
      for (let i = 0; i < 5 + Math.floor(Math.random() * 3); i++) {
        spots.push({ x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.7, scrubbed: false });
      }
      base.dishSpots = spots;
      break;
    }
    case "take_out_trash": {
      const bags: TrashBag[] = [];
      for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
        bags.push({ x: 0.1 + Math.random() * 0.8, y: 0.1 + Math.random() * 0.8, removed: false });
      }
      base.trashBags = bags;
      break;
    }
    case "stack_plates":
      base.platePosition = Math.random();
      break;
    default:
      break;
  }

  return base;
}

function choreTimerTick(chore: ActiveChore, dt: number): ActiveChore {
  if (chore.completed) return chore;
  const timer = Math.max(0, chore.timer - dt);
  return { ...chore, timer, timerExpired: timer <= 0 };
}

function updatePlatePosition(chore: ActiveChore, dt: number): ActiveChore {
  if (chore.type !== "stack_plates" || chore.completed) return chore;
  let pos = chore.platePosition + chore.plateDirection * chore.plateSpeed * dt * 20;
  let dir = chore.plateDirection;
  if (pos >= 1) { pos = 1; dir = -1; }
  if (pos <= 0) { pos = 0; dir = 1; }
  return { ...chore, platePosition: pos, plateDirection: dir };
}

function isChoreComplete(chore: ActiveChore): boolean {
  switch (chore.type) {
    case "wash_dishes":
      return chore.dishSpots.every((s) => s.scrubbed);
    case "take_out_trash":
      return chore.trashBags.every((b) => b.removed);
    case "mop_floor":
      return chore.mopCycles >= chore.mopCyclesNeeded;
    case "stack_plates":
      return chore.platesStacked >= chore.platesNeeded;
    case "break_down_recycling":
      return chore.recycleCycles >= chore.recycleCyclesNeeded;
  }
}

export function handleChoreMouseMove(chore: ActiveChore, x: number, y: number, containerRect: DOMRect): ActiveChore {
  if (chore.completed || chore.type !== "wash_dishes") return chore;
  const nx = (x - containerRect.left) / containerRect.width;
  const ny = (y - containerRect.top) / containerRect.height;
  const SCRUB_RADIUS = 0.08;
  let changed = false;
  const spots = chore.dishSpots.map((s) => {
    if (s.scrubbed) return s;
    const dx = nx - s.x;
    const dy = ny - s.y;
    if (Math.sqrt(dx * dx + dy * dy) < SCRUB_RADIUS) {
      changed = true;
      return { ...s, scrubbed: true };
    }
    return s;
  });
  if (!changed) return chore;
  const updated = { ...chore, dishSpots: spots };
  return isChoreComplete(updated) ? { ...updated, completed: true } : updated;
}

export function handleChoreClick(chore: ActiveChore, x: number, y: number, containerRect: DOMRect): ActiveChore {
  if (chore.completed) return chore;
  if (chore.type === "take_out_trash") {
    const nx = (x - containerRect.left) / containerRect.width;
    const ny = (y - containerRect.top) / containerRect.height;
    const CLICK_RADIUS = 0.15;
    let closest = -1;
    let closestDist = Infinity;
    chore.trashBags.forEach((b, i) => {
      if (b.removed) return;
      const d = Math.sqrt((nx - b.x) ** 2 + (ny - b.y) ** 2);
      if (d < CLICK_RADIUS && d < closestDist) { closest = i; closestDist = d; }
    });
    if (closest < 0) return chore;
    const bags = chore.trashBags.map((b, i) => (i === closest ? { ...b, removed: true } : b));
    const updated = { ...chore, trashBags: bags };
    return isChoreComplete(updated) ? { ...updated, completed: true } : updated;
  }
  if (chore.type === "break_down_recycling" && chore.recyclePhase === "click") {
    const clicks = chore.recycleClicks + 1;
    if (clicks >= chore.recycleClicksNeeded) {
      return { ...chore, recycleClicks: 0, recyclePhase: "arrows" };
    }
    return { ...chore, recycleClicks: clicks };
  }
  return chore;
}

export function handleChoreKeyPress(chore: ActiveChore, key: string): ActiveChore {
  if (chore.completed) return chore;
  const k = key.toLowerCase();

  if (chore.type === "mop_floor") {
    if (chore.mopPhase === "dunk" && k === "arrowdown") {
      return { ...chore, mopPhase: "squeeze", mopSqueezeCount: 0 };
    }
    if (chore.mopPhase === "squeeze" && k === " ") {
      const count = chore.mopSqueezeCount + 1;
      if (count >= 3) {
        return { ...chore, mopPhase: "mop", mopSqueezeCount: 0, mopSwipeCount: 0, mopLastDirection: null };
      }
      return { ...chore, mopSqueezeCount: count };
    }
    if (chore.mopPhase === "mop" && (k === "arrowleft" || k === "arrowright")) {
      const dir = k === "arrowleft" ? "left" : "right";
      if (chore.mopLastDirection === dir) return chore;
      const swipes = chore.mopSwipeCount + 1;
      if (swipes >= 6) {
        const cycles = chore.mopCycles + 1;
        const updated = { ...chore, mopCycles: cycles, mopSwipeCount: 0, mopLastDirection: null, mopPhase: "dunk" as const };
        return isChoreComplete(updated) ? { ...updated, completed: true } : updated;
      }
      return { ...chore, mopSwipeCount: swipes, mopLastDirection: dir };
    }
    return chore;
  }

  if (chore.type === "stack_plates" && k === " ") {
    const distance = Math.abs(chore.platePosition - chore.lastPlatePosition);
    if (distance < 0.15) {
      const stacked = chore.platesStacked + 1;
      const updated = { ...chore, platesStacked: stacked, lastPlatePosition: chore.platePosition, plateMissed: false, plateSpeed: chore.plateSpeed + 0.003 };
      return isChoreComplete(updated) ? { ...updated, completed: true } : updated;
    }
    return { ...chore, plateMissed: true };
  }

  if (chore.type === "break_down_recycling" && chore.recyclePhase === "arrows") {
    if (["arrowleft", "arrowup", "arrowright", "arrowdown"].includes(k)) {
      const arrows = chore.recycleArrows + 1;
      if (arrows >= chore.recycleArrowsNeeded) {
        const cycles = chore.recycleCycles + 1;
        const updated = { ...chore, recycleCycles: cycles, recycleArrows: 0, recycleClicks: 0, recyclePhase: "click" as const };
        return isChoreComplete(updated) ? { ...updated, completed: true } : updated;
      }
      return { ...chore, recycleArrows: arrows };
    }
  }

  return chore;
}

function scheduleChoreTimers(shiftDuration: number, count: number): number[] {
  // Spread chores throughout the shift, avoiding first 15s and last 15s
  const earliest = 15;
  const latest = shiftDuration - 15;
  const window = latest - earliest;
  if (count === 1) return [earliest + Math.random() * window];
  // For 2 chores, space them apart
  const first = earliest + Math.random() * (window * 0.4);
  const second = first + window * 0.3 + Math.random() * (window * 0.3);
  return [first, Math.min(second, latest)];
}

export function createRestaurantState(state: GameState, numPlayers = 1): RestaurantState {
  const slotsPerCounter = hasRestaurantUpgrade(state, "sixth_slot") ? 6 : 5;
  const numCounters = numPlayers;
  const shiftDuration = SHIFT_DURATION_SECONDS + restaurantUpgradeCount(state, "longer_shift") * 30;

  // Chores start appearing on day 2+, 1-2 per shift
  const choreCount = state.day >= 2 ? (Math.random() < 0.5 ? 1 : 2) : 0;
  const choreTimers = choreCount > 0 ? scheduleChoreTimers(shiftDuration, choreCount) : [];
  // nextChoreTimer = seconds until first chore spawns (from shift start)
  const nextChoreTimer = choreTimers.length > 0 ? choreTimers[0] : Infinity;

  const baseState: RestaurantState = {
    shiftActive: true,
    orderSlots: Array.from({ length: slotsPerCounter * numCounters }, () => null),
    activeOrderId: null,
    completedOrders: 0,
    failedOrders: 0,
    totalEarnings: 0,
    totalTips: 0,
    shiftTimeRemaining: shiftDuration,
    nextOrderTimer: randomOrderInterval(state.acquiredRestaurantUpgrades, numCounters),
    orderIdCounter: 1,
    shiftOver: false,
    availableMenu: getAvailableMenu(state),
    acquiredUpgrades: [...state.acquiredRestaurantUpgrades],
    comboStreak: 0,
    challengeTracker: createRestaurantTracker(),
    numCounters,
    slotsPerCounter,
    playerFocus: {},
    orderContributors: {},
    orderLog: [],
    shiftDuration,
    activeChore: null,
    choreSlotIndex: -1,
    choreFocused: false,
    nextChoreTimer,
    choresCompleted: 0,
    choresScheduled: choreCount,
    servingBlocked: false,
    insiderServed: false,
  };

  return spawnOrder(baseState);
}

export function restaurantTick(state: RestaurantState, dt: number, activeBuffIds: string[] = []): RestaurantState {
  if (!state.shiftActive || state.shiftOver) return state;

  const shiftTimeRemaining = Math.max(0, state.shiftTimeRemaining - dt);
  const shiftOver = shiftTimeRemaining <= 0;
  let failureOccurred = false;
  let newFailures = 0;
  const patienceMultiplier = activeBuffIds.includes("birthday_chant") ? 0 : activeBuffIds.includes("tablet") ? 0.5 : 1;
  const cookSpeedMultiplier = activeBuffIds.includes("lighter") ? 2 : 1;
  const orderSlots = state.orderSlots.map((slot) => {
    if (!slot) return null;
    const updated = updateOrderTick(slot, dt, state.acquiredUpgrades, patienceMultiplier, cookSpeedMultiplier);
    if (!slot.failed && updated.failed) { failureOccurred = true; newFailures++; }
    if (updated.failed && updated.failedTimer <= 0) return null;
    return updated;
  });
  const activeStillValid = orderSlots.some(
    (slot) => slot && slot.id === state.activeOrderId && !slot.failed && (!slot.served || slot.schmoozing),
  );
  const hasEmptySlot = orderSlots.some((slot, i) => slot === null && i !== state.choreSlotIndex);

  let nextState: RestaurantState = {
    ...state,
    orderSlots,
    activeOrderId: activeStillValid ? state.activeOrderId : null,
    shiftTimeRemaining,
    shiftActive: !shiftOver,
    shiftOver,
    nextOrderTimer: Math.max(0, state.nextOrderTimer - dt),
    comboStreak: failureOccurred ? 0 : state.comboStreak,
    failedOrders: state.failedOrders + newFailures,
  };

  // Challenge tracking: count active orders and check timer thresholds
  let tracker = { ...state.challengeTracker };
  const activeCount = orderSlots.filter((s) => s && !s.failed && !s.served).length;
  if (activeCount > tracker.maxActiveOrders) tracker.maxActiveOrders = activeCount;
  // Count orders actively cooking on grill/fry (prepStarted, not yet complete)
  const cookingCount = orderSlots.filter((s) => {
    if (!s || s.failed || s.served || !s.prepStarted) return false;
    const step = s.menuItem.steps[s.currentStepIndex];
    return step && (step.type === "grill" || step.type === "fry") && s.prepProgress < (step as any).duration;
  }).length;
  if (cookingCount > tracker.maxCookingOrders) tracker.maxCookingOrders = cookingCount;
  // Check if any order's patience went below 50% (track first occurrence)
  for (const slot of orderSlots) {
    if (slot && !slot.failed && !slot.served) {
      const ratio = slot.patienceRemaining / slot.menuItem.patience;
      if (ratio < 0.5) {
        if (!tracker.anyTimerBelow50) {
          tracker.firstTimerBelow50Order = slot.menuItem.name;
          tracker.firstTimerBelow50Time = state.shiftDuration - shiftTimeRemaining;
        }
        tracker.anyTimerBelow50 = true;
      }
    }
  }
  nextState = { ...nextState, challengeTracker: tracker };

  if (!shiftOver && hasEmptySlot && nextState.nextOrderTimer <= 0) {
    nextState = spawnOrder(nextState);
    // Ad Buy: faster customer arrivals
    if (activeBuffIds.includes("ad_buy")) {
      nextState = { ...nextState, nextOrderTimer: nextState.nextOrderTimer * 0.5 };
    }
  }

  // Chore system tick
  let { activeChore, choreSlotIndex, choreFocused, nextChoreTimer, choresCompleted, choresScheduled, servingBlocked } = nextState;
  const elapsed = nextState.shiftDuration - shiftTimeRemaining;

  // Spawn a new chore if timer is up and no active chore
  if (!activeChore && choresCompleted < choresScheduled && elapsed >= nextChoreTimer && !shiftOver) {
    // Find an empty slot to place the chore
    const emptyIdx = nextState.orderSlots.findIndex((s) => s === null);
    if (emptyIdx >= 0) {
      activeChore = createChore(nextState.orderIdCounter + 1000);
      choreSlotIndex = emptyIdx;
      choreFocused = false;
      // Mark the slot as occupied by putting a placeholder order (null stays, chore is separate)
      // Actually we just track choreSlotIndex — the slot stays null but we render the chore there
    }
    // Schedule next chore (if there's another one)
    if (choresCompleted + 1 < choresScheduled) {
      const remaining = shiftTimeRemaining - 30;
      nextChoreTimer = elapsed + 30 + Math.random() * Math.max(0, remaining - 30);
    } else {
      nextChoreTimer = Infinity;
    }
  }

  // Tick active chore
  if (activeChore && !activeChore.completed) {
    // New Hire buff auto-completes chores
    if (activeBuffIds.includes("new_hire")) {
      activeChore = { ...activeChore, completed: true };
    } else {
      activeChore = choreTimerTick(activeChore, dt);
      activeChore = updatePlatePosition(activeChore, dt);
    }
    servingBlocked = activeChore.timerExpired && !activeChore.completed;
  } else if (activeChore?.completed) {
    // Clear completed chore
    choresCompleted = choresCompleted + 1;
    activeChore = null;
    choreSlotIndex = -1;
    choreFocused = false;
    servingBlocked = false;
  } else {
    servingBlocked = false;
  }

  nextState = { ...nextState, activeChore, choreSlotIndex, choreFocused, nextChoreTimer, choresCompleted, choresScheduled, servingBlocked };

  return nextState;
}

export function acceptOrder(state: RestaurantState, slotIndex: number): RestaurantState {
  // If selecting the chore slot, focus the chore instead
  if (slotIndex === state.choreSlotIndex && state.activeChore && !state.activeChore.completed) {
    return { ...state, choreFocused: true, activeOrderId: null };
  }
  const order = state.orderSlots[slotIndex];
  if (!order || order.failed || order.served) return state;
  if (state.activeOrderId === order.id) return state;

  // Trigger memorize reveal when focusing a memorize-step order
  let updatedOrder = { ...order, lastMousePos: null };
  const step = order.menuItem.steps[order.currentStepIndex];
  if (step?.type === "memorize" && !order.memorizeRevealed && order.memorizeInputIndex === 0 && order.memorizeInputDelay === 0) {
    updatedOrder = { ...updatedOrder, memorizeRevealed: true, memorizeRevealTimer: (step as MemorizeStep).revealDuration };
  }

  return { ...replaceOrder(state, updatedOrder, order.id), choreFocused: false };
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

    // Find if the pressed key matches any ingredient from current position onward
    let matchIndex = -1;
    for (let i = activeOrder.assembleIndex; i < step.ingredients.length; i++) {
      if (step.ingredients[i].key.toLowerCase() === normalizedKey) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex >= 0) {
      // Check correctness: any wanted ingredients before matchIndex were skipped (bad),
      // and if the matched ingredient itself is unwanted, adding it is also bad
      let correct = activeOrder.orderCorrect;
      if (wanted) {
        for (let i = activeOrder.assembleIndex; i < matchIndex; i++) {
          if (wanted[i]) correct = false; // skipped a wanted ingredient
        }
        if (!wanted[matchIndex]) correct = false; // added an unwanted ingredient
      }
      const newOrder = {
        ...activeOrder,
        assembleIndex: matchIndex + 1,
        orderCorrect: correct,
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
    if (activeOrder.memorizeRevealed || activeOrder.memorizeInputDelay > 0) return state;
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

export function serveOrder(state: RestaurantState, slotIndex: number, tipMultiplier = 1, servingPlayerId?: string): RestaurantState {
  const order = state.orderSlots[slotIndex];
  if (!order || !order.completed || order.failed) return state;
  // Don't re-serve an order already in schmooze mode
  if (order.schmoozing) return state;
  // Can't serve while a chore is blocking
  if (state.servingBlocked) return state;

  const tip = calculateTip(order, state.acquiredUpgrades) * tipMultiplier;
  const basePay = getOrderBasePay(order, state.acquiredUpgrades);
  const nextComboStreak = state.comboStreak + 1;
  const comboBonus = hasRestaurantUpgrade(state.acquiredUpgrades, "combo_bonus") && nextComboStreak % 3 === 0 ? 3 : 0;
  const payout = basePay + tip + comboBonus;
  const orderSlots = [...state.orderSlots];

  // Challenge tracking
  let tracker = { ...state.challengeTracker };
  const elapsed = order.menuItem.patience - order.patienceRemaining;
  if (elapsed <= 3) tracker.fastCompletions++;
  if (elapsed < 1) tracker.subSecondCompletion = true;
  if (order.patienceRemaining < 2) tracker.clutchCompletions++;
  if (tip <= 0) {
    if (tracker.allTipsPositive) {
      tracker.firstMissedTipOrder = order.menuItem.name;
      tracker.firstMissedTipTime = state.shiftDuration - state.shiftTimeRemaining;
    }
    tracker.allTipsPositive = false;
  }
  if (elapsed < tracker.fastestCompletion) {
    tracker.fastestCompletion = elapsed;
    tracker.fastestCompletionOrder = order.menuItem.name;
  }

  // Log the completed order for graphing
  const contributors = state.orderContributors[order.id] ?? [];
  if (servingPlayerId && !contributors.includes(servingPlayerId)) {
    contributors.push(servingPlayerId);
  }
  const finalContributors = contributors.length > 0 ? contributors : ["player"];

  const logEntry: RestaurantOrderLog = {
    timestamp: state.shiftDuration - state.shiftTimeRemaining,
    orderId: order.id,
    orderName: order.menuItem.name,
    orderIcon: order.menuItem.icon,
    payout,
    contributors: finalContributors,
  };

  const newContributors = { ...state.orderContributors };
  delete newContributors[order.id];

  // Insider orders stay in slot for schmoozing
  if (order.isInsider && !state.insiderServed) {
    const rounds = pickSchmoozeRounds(3);
    const { options, correctIndex } = shuffleOptions(rounds[0]);
    orderSlots[slotIndex] = {
      ...order,
      served: true,
      schmoozing: {
        rounds,
        currentRound: 0,
        options,
        correctIndex,
        selected: null,
        failed: false,
        success: false,
      },
    };
  } else {
    orderSlots[slotIndex] = null;
  }

  return {
    ...state,
    orderSlots,
    activeOrderId: state.activeOrderId === order.id ? (order.isInsider && !state.insiderServed ? order.id : null) : state.activeOrderId,
    completedOrders: state.completedOrders + 1,
    totalEarnings: Math.round((state.totalEarnings + payout) * 100) / 100,
    totalTips: Math.round((state.totalTips + tip) * 100) / 100,
    comboStreak: nextComboStreak,
    challengeTracker: tracker,
    orderContributors: newContributors,
    orderLog: [...state.orderLog, logEntry],
    insiderServed: state.insiderServed || order.isInsider,
  };
}

/** Record that a player contributed to an order (worked on a step) */
export function recordOrderContributor(state: RestaurantState, orderId: number, playerId: string): RestaurantState {
  const existing = state.orderContributors[orderId] ?? [];
  if (existing.includes(playerId)) return state;
  return {
    ...state,
    orderContributors: { ...state.orderContributors, [orderId]: [...existing, playerId] },
  };
}

/** Select a schmooze option for the active insider order. Returns { state, success?, tipEarned? } */
export function selectSchmoozeOption(
  state: RestaurantState,
  slotIndex: number,
  optionIndex: number,
): { state: RestaurantState; schmoozeSuccess?: boolean } {
  const order = state.orderSlots[slotIndex];
  if (!order?.schmoozing || order.schmoozing.selected !== null || order.schmoozing.failed || order.schmoozing.success) {
    return { state };
  }

  const schmooze = order.schmoozing;
  const isCorrect = optionIndex === schmooze.correctIndex;

  if (!isCorrect) {
    // Wrong answer — show the insult for 5 seconds, then remove
    const selectedText = schmooze.options[optionIndex];
    const orderSlots = [...state.orderSlots];
    orderSlots[slotIndex] = {
      ...order,
      schmoozing: {
        ...schmooze,
        failed: true,
        selected: optionIndex,
        resultMessage: `"${selectedText}?! Get out of my face."`,
        resultTimer: TICKS_PER_SECOND * 5,
      },
    };
    return {
      state: {
        ...state,
        orderSlots,
      },
    };
  }

  // Correct — advance to next round or complete
  const nextRound = schmooze.currentRound + 1;
  if (nextRound < schmooze.rounds.length) {
    const { options, correctIndex } = shuffleOptions(schmooze.rounds[nextRound]);
    const orderSlots = [...state.orderSlots];
    orderSlots[slotIndex] = {
      ...order,
      schmoozing: {
        ...schmooze,
        currentRound: nextRound,
        options,
        correctIndex,
        selected: null,
      },
    };
    return { state: { ...state, orderSlots } };
  }

  // All rounds complete — success! Show tip for 5 seconds
  const orderSlots = [...state.orderSlots];
  orderSlots[slotIndex] = {
    ...order,
    schmoozing: {
      ...schmooze,
      success: true,
      selected: optionIndex,
      resultMessage: "The insider whispers a tip for tomorrow...",
      resultTimer: TICKS_PER_SECOND * 5,
    },
  };
  return {
    state: {
      ...state,
      orderSlots,
    },
    schmoozeSuccess: true,
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
