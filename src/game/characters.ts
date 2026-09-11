export const CHARACTER_IDS = [
  "jane",
  "cameron",
  "dinky",
  "sydney",
  "paul",
  "allan",
  "colin",
  "ian",
  "zack",
  "josh",
] as const;

export type CharacterId = typeof CHARACTER_IDS[number];

export interface CharacterSelection {
  id: CharacterId;
  level: number;
}

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  icon: string;
  description: string;
  drawback: string;
  scaling: string;
}

export interface CharacterProfile {
  xp: number;
  level: number;
}

export const CHARACTERS: CharacterDefinition[] = [
  { id: "jane", name: "Jane", icon: "🍀", description: "Luck bends stock, short, and option moves in her favor.", drawback: "Insider profits are more likely to attract the SEC.", scaling: "Higher levels increase her market luck." },
  { id: "cameron", name: "Cameron", icon: "🗣️", description: "Customers are more patient, and active orders boost completed-order tips.", drawback: "Abandoning an order costs cash.", scaling: "Higher levels improve patience and tip bonuses." },
  { id: "dinky", name: "Dinky", icon: "🔮", description: "Sees a projected end-of-day price range for every stock.", drawback: "20% of manual stock trades target a different stock.", scaling: "Higher levels narrow the prediction range." },
  { id: "sydney", name: "Sydney", icon: "👩‍🍳", description: "A five-star chef who earns greatly increased Shwendy's tips.", drawback: "Every order requires an extra ingredient.", scaling: "Higher levels further increase tip earnings." },
  { id: "paul", name: "Paul", icon: "📐", description: "Technical analysis makes displayed stock-tip probabilities more accurate.", drawback: "Orders lose patience faster once he starts them.", scaling: "Higher levels improve tip accuracy." },
  { id: "allan", name: "Allan", icon: "🎳", description: "Earns extra money from every leisure activity.", drawback: "The market timer becomes a useless, nonsensical analog clock.", scaling: "Higher levels increase leisure rewards." },
  { id: "colin", name: "Colin", icon: "🚀", description: "Meme-stock gains and losses are dramatically amplified.", drawback: "Meme-stock losses are doubled.", scaling: "Higher levels further amplify gains." },
  { id: "ian", name: "Ian", icon: "👁️", description: "Randomly sees stock prices from the future.", drawback: "Past sight can replace current prices with five-second-old prices.", scaling: "Higher levels trigger sight more often and see farther ahead." },
  { id: "zack", name: "Zack", icon: "🧠", description: "Trading days last longer for everyone.", drawback: "Tips become less reliable as his brain gets cooked through the day.", scaling: "Higher levels lengthen the day further." },
  { id: "josh", name: "Josh", icon: "🤖", description: "Turns tips into persistent AI trading strategies with configurable risk.", drawback: "Cannot place individual trades manually.", scaling: "Higher levels make the AI time and size trades more intelligently." },
];

const PROFILE_KEY = "rogue-day-trader-character-profiles";

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && CHARACTER_IDS.includes(value as CharacterId);
}

export function xpRequiredForLevel(level: number): number {
  return Math.round(750 * Math.pow(Math.max(1, level), 1.45));
}

export function loadCharacterProfiles(): Record<CharacterId, CharacterProfile> {
  const defaults = Object.fromEntries(CHARACTER_IDS.map((id) => [id, { xp: 0, level: 1 }])) as Record<CharacterId, CharacterProfile>;
  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<CharacterId, CharacterProfile>>;
    for (const id of CHARACTER_IDS) {
      const profile = parsed[id];
      if (profile && Number.isFinite(profile.xp) && Number.isFinite(profile.level)) {
        defaults[id] = { xp: Math.max(0, profile.xp), level: Math.max(1, Math.floor(profile.level)) };
      }
    }
  } catch (error) {
    console.warn("[characters] Failed to load profiles:", error);
  }
  return defaults;
}

export function getCharacterSelection(id: CharacterId): CharacterSelection {
  return { id, level: loadCharacterProfiles()[id].level };
}

export function awardCharacterXp(id: CharacterId, amount: number): { profile: CharacterProfile; levelsGained: number } {
  const profiles = loadCharacterProfiles();
  const previousLevel = profiles[id].level;
  let { xp, level } = profiles[id];
  xp += Math.max(0, Math.round(amount));
  while (xp >= xpRequiredForLevel(level)) {
    xp -= xpRequiredForLevel(level);
    level += 1;
  }
  const profile = { xp, level };
  profiles[id] = profile;
  if (typeof localStorage === "undefined") return { profile, levelsGained: level - previousLevel };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
  } catch (error) {
    console.warn("[characters] Failed to save profiles:", error);
  }
  return { profile, levelsGained: level - previousLevel };
}

export function characterScale(level: number, base: number, perLevel: number, maximum = Number.POSITIVE_INFINITY): number {
  return Math.min(maximum, base + Math.max(0, level - 1) * perLevel);
}

export function getCharacterDefinition(id: CharacterId): CharacterDefinition {
  return CHARACTERS.find((character) => character.id === id)!;
}
