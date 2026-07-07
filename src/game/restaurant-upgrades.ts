export interface RestaurantUpgradeCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "speed" | "profit" | "skill" | "capacity";
  maxStacks: number;
}

export const RESTAURANT_UPGRADE_POOL: RestaurantUpgradeCard[] = [
  { id: "fast_grill", name: "Turbo Grill", description: "Grill/fry steps cook 20% faster", icon: "🔥", category: "speed", maxStacks: 2 },
  { id: "sharp_knives", name: "Sharp Knives", description: "Chopping requires 30% fewer chops", icon: "🔪", category: "speed", maxStacks: 2 },
  { id: "power_mixer", name: "Power Mixer", description: "Mixing requires 30% less distance", icon: "⚡", category: "speed", maxStacks: 2 },
  { id: "speed_hands", name: "Speed Hands", description: "Assembly auto-advances one ingredient", icon: "🤲", category: "speed", maxStacks: 1 },
  { id: "appetizer_bonus", name: "Appetizer Expert", description: "Orders under $7 pay +40% more", icon: "🥗", category: "profit", maxStacks: 1 },
  { id: "entree_bonus", name: "Entrée Expert", description: "Orders $10+ pay +25% more", icon: "🍽️", category: "profit", maxStacks: 1 },
  { id: "charm", name: "Customer Charm", description: "+30% tips on all orders", icon: "😊", category: "profit", maxStacks: 2 },
  { id: "combo_bonus", name: "Combo Bonus", description: "+$3 for every 3 orders served in a row", icon: "🔗", category: "profit", maxStacks: 1 },
  { id: "burn_resist", name: "Burn Resistant", description: "Food takes 50% longer to burn after done", icon: "🧤", category: "skill", maxStacks: 1 },
  { id: "forgiving_flip", name: "Forgiving Flip", description: "Flip window is 50% wider", icon: "🍳", category: "skill", maxStacks: 1 },
  { id: "patient_customers", name: "Yelp Star", description: "All customers have +20% patience", icon: "⭐", category: "skill", maxStacks: 2 },
  { id: "rhythm_assist", name: "Rhythm Assist", description: "Rhythm timing windows are 40% wider", icon: "🎵", category: "skill", maxStacks: 1 },
  { id: "memory_boost", name: "Memory Boost", description: "Memorize sequences reveal 1 second longer", icon: "🧠", category: "skill", maxStacks: 2 },
  { id: "sixth_slot", name: "Extra Counter", description: "Gain a 6th order slot", icon: "🪑", category: "capacity", maxStacks: 1 },
  { id: "longer_shift", name: "Overtime", description: "Shifts last 30 seconds longer", icon: "⏰", category: "capacity", maxStacks: 2 },
  { id: "rush_hour", name: "Rush Hour", description: "Orders come 25% more frequently", icon: "🏃", category: "capacity", maxStacks: 1 },
];
