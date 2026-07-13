export type ConsumablePhase = "trading" | "restaurant";

export interface ConsumableItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  phase: ConsumablePhase;
  tier: 1 | 2 | 3; // cost in tickets
}

export interface ActiveBuff {
  consumableId: string;
  remainingTicks: number;
}

export interface ConsumableInventory {
  items: string[]; // consumable IDs (can have duplicates)
  activeBuffs: ActiveBuff[];
}

// --- Trading Consumables ---

export const TRADING_CONSUMABLES: ConsumableItem[] = [
  {
    id: "upvote_bots",
    name: "Upvote Bots",
    icon: "🤖",
    description: "Choose a social post to add many upvotes to, making its effects much stronger",
    phase: "trading",
    tier: 3,
  },
  {
    id: "golden_coin",
    name: "Golden Coin",
    icon: "🪙",
    description: "Negate the loss from your next sell or cover",
    phase: "trading",
    tier: 2,
  },
  {
    id: "stock_ticket",
    name: "Stock Ticket",
    icon: "🎟️",
    description: "Your next stock purchase is free",
    phase: "trading",
    tier: 1,
  },
  {
    id: "scale",
    name: "Scale",
    icon: "⚖️",
    description: "Double the movement of all stocks for 10 seconds",
    phase: "trading",
    tier: 3,
  },
  {
    id: "quantum_encryption",
    name: "Quantum Encryption",
    icon: "🔐",
    description: "View the insider tip without risk of SEC violations",
    phase: "trading",
    tier: 2,
  },
  {
    id: "bubble",
    name: "Bubble",
    icon: "🫧",
    description: "Choose a stock to cause it to rise quickly, then crash",
    phase: "trading",
    tier: 2,
  },
  {
    id: "rewinder",
    name: "Rewinder",
    icon: "⏪",
    description: "Rewind time by 10 seconds",
    phase: "trading",
    tier: 3,
  },
];

// --- Restaurant Consumables ---

export const RESTAURANT_CONSUMABLES: ConsumableItem[] = [
  {
    id: "tablet",
    name: "Tablet",
    icon: "📱",
    description: "Decrease patience loss rate by 50% for 25 sec",
    phase: "restaurant",
    tier: 2,
  },
  {
    id: "live_band",
    name: "Live Band",
    icon: "🎸",
    description: "Increase tips by 50% for 25 sec",
    phase: "restaurant",
    tier: 2,
  },
  {
    id: "birthday_chant",
    name: "Birthday Chant",
    icon: "🎂",
    description: "Stop patience loss entirely for 10 sec",
    phase: "restaurant",
    tier: 1,
  },
  {
    id: "ad_buy",
    name: "Ad Buy",
    icon: "📺",
    description: "Increase customer arrival rate for 20 sec",
    phase: "restaurant",
    tier: 2,
  },
  {
    id: "lighter",
    name: "Lighter",
    icon: "🔥",
    description: "Cook twice as fast for 30 sec",
    phase: "restaurant",
    tier: 3,
  },
  {
    id: "assistant",
    name: "Assistant",
    icon: "👨‍🍳",
    description: "All prep is handled automatically for 25 sec",
    phase: "restaurant",
    tier: 3,
  },
  {
    id: "new_hire",
    name: "New Hire",
    icon: "🧹",
    description: "All chores are handled automatically for 25 sec",
    phase: "restaurant",
    tier: 1,
  },
];

export const ALL_CONSUMABLES: ConsumableItem[] = [...TRADING_CONSUMABLES, ...RESTAURANT_CONSUMABLES];

export function getConsumable(id: string): ConsumableItem | undefined {
  return ALL_CONSUMABLES.find((c) => c.id === id);
}

export function createEmptyInventory(): ConsumableInventory {
  return { items: [], activeBuffs: [] };
}

/** Generate 3 shop items: one tier-3, one tier-2, one tier-1. Never duplicate. */
export function generateShopOffering(): ConsumableItem[] {
  // Ensure at least 1 from each phase among the 3 items
  const tradingPool = [...TRADING_CONSUMABLES];
  const restaurantPool = [...RESTAURANT_CONSUMABLES];
  const allPool = [...ALL_CONSUMABLES];

  const pickFromPool = (pool: ConsumableItem[], tier: 1 | 2 | 3): ConsumableItem => {
    const candidates = pool.filter((c) => c.tier === tier);
    if (candidates.length === 0) {
      // Fallback to any tier from pool
      const idx = Math.floor(Math.random() * pool.length);
      return pool[idx];
    }
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
  };

  // Pick tier 3 from one phase, tier 1 from the other, tier 2 from either
  const results: ConsumableItem[] = [];
  const startWithTrading = Math.random() < 0.5;

  // Tier 3: one phase
  const tier3Pool = startWithTrading ? tradingPool : restaurantPool;
  const tier3 = pickFromPool(tier3Pool, 3);
  results.push(tier3);

  // Tier 1: other phase
  const tier1Pool = startWithTrading ? restaurantPool : tradingPool;
  const tier1 = pickFromPool(tier1Pool, 1);
  results.push(tier1);

  // Tier 2: random from remaining (avoid duplicates)
  const remaining = allPool.filter((c) => c.id !== tier3.id && c.id !== tier1.id);
  const tier2 = pickFromPool(remaining, 2);
  results.push(tier2);

  // Sort by tier descending for display
  return results.sort((a, b) => b.tier - a.tier);
}

/** Add a consumable to inventory. */
export function addConsumable(inv: ConsumableInventory, id: string): ConsumableInventory {
  return { ...inv, items: [...inv.items, id] };
}

/** Remove one instance of a consumable from inventory. */
export function removeConsumable(inv: ConsumableInventory, id: string): ConsumableInventory {
  const idx = inv.items.indexOf(id);
  if (idx === -1) return inv;
  const next = [...inv.items];
  next.splice(idx, 1);
  return { ...inv, items: next };
}

/** Check if a buff is currently active. */
export function hasActiveBuff(inv: ConsumableInventory, consumableId: string): boolean {
  return inv.activeBuffs.some((b) => b.consumableId === consumableId);
}

/** Activate a timed buff. */
export function activateBuff(inv: ConsumableInventory, consumableId: string, durationTicks: number): ConsumableInventory {
  return {
    ...inv,
    activeBuffs: [...inv.activeBuffs, { consumableId, remainingTicks: durationTicks }],
  };
}

/** Tick all active buffs down; remove expired ones. */
export function tickBuffs(inv: ConsumableInventory): ConsumableInventory {
  const next = inv.activeBuffs
    .map((b) => ({ ...b, remainingTicks: b.remainingTicks - 1 }))
    .filter((b) => b.remainingTicks > 0);
  if (next.length === inv.activeBuffs.length && next.every((b, i) => b.remainingTicks === inv.activeBuffs[i].remainingTicks - 0)) return inv;
  return { ...inv, activeBuffs: next };
}

/** Get items from inventory for a specific phase. */
export function getPhaseItems(inv: ConsumableInventory, phase: ConsumablePhase): string[] {
  return inv.items.filter((id) => {
    const c = getConsumable(id);
    return c && c.phase === phase;
  });
}
