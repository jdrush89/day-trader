/**
 * EOD (End-of-Day) State Machine
 *
 * Centralizes all phase transition logic for end-of-day flow.
 * In multiplayer, the HOST drives this machine; peers follow via sync.
 *
 * Flow after market close:
 *   INFO_SUMMARY → INFO_CHALLENGES → WAITING_FOR_PLAYERS
 *   → PICK_UPGRADES → PICK_STOCKS → PICK_RESTAURANT_UPGRADES → PICK_MENU
 *   → SHOP → NEXT_PHASE
 *
 * Pick phases are skipped when no draft options exist.
 * Shop is skipped when no tickets are available.
 */

export type EodState =
  | "trading"            // Market is open
  | "info_summary"      // P&L summary (each player navigates independently)
  | "info_challenges"   // Challenge results (each player navigates independently)
  | "waiting"           // Waiting for all players to finish info screens
  | "pick_upgrades"     // Upgrade draft (gated: all must choose)
  | "pick_stocks"       // Stock draft (gated: all must choose)
  | "pick_restaurant_upgrades" // Kitchen upgrade (no gate: each advances independently)
  | "pick_menu"         // Menu item draft (gated: all must choose)
  | "shop"             // Ticket shop (each player browses, then signals ready)
  | "leisure"          // Leisure activity (fishing, etc.) — each player picks and completes
  | "next_phase"       // Transition to restaurant or next trading day
  | "restaurant"       // Restaurant shift is active
  ;

export type EodEvent =
  | { type: "market_closed" }
  | { type: "continue" }          // Player clicks Continue (info screens)
  | { type: "all_ready" }         // All players signaled readiness (gate)
  | { type: "choice_made" }       // Current player made their pick
  | { type: "all_chosen" }        // All players made picks (gate fired)
  | { type: "shift_ended" }       // Restaurant shift ended
  ;

export interface EodContext {
  hasUpgradeDraft: boolean;
  hasStockDraft: boolean;
  hasRestaurantUpgradeDraft: boolean;
  hasMenuDraft: boolean;
  hasTickets: boolean;
  hasRestaurantState: boolean; // true if restaurant was active (determines if shop shows)
  isBossDay: boolean;
}

/**
 * Given the current state and an event, returns the next state.
 * This is a PURE function — no side effects.
 */
export function eodTransition(state: EodState, event: EodEvent, ctx: EodContext): EodState {
  switch (state) {
    case "trading":
      if (event.type === "market_closed") return "info_summary";
      return state;

    case "restaurant":
      if (event.type === "shift_ended") return "info_summary";
      return state;

    case "info_summary":
      if (event.type === "continue") {
        if (ctx.isBossDay) return "waiting";
        return "info_challenges";
      }
      return state;

    case "info_challenges":
      if (event.type === "continue") return "waiting";
      return state;

    case "waiting":
      if (event.type === "all_ready") return nextPickOrShopOrDone(ctx);
      return state;

    case "pick_upgrades":
      if (event.type === "all_chosen") return nextAfterUpgrades(ctx);
      return state;

    case "pick_stocks":
      if (event.type === "all_chosen") return nextAfterStocks(ctx);
      return state;

    case "pick_restaurant_upgrades":
      // No gate — each player advances to menu immediately
      if (event.type === "choice_made") return "pick_menu";
      if (event.type === "all_chosen") return nextAfterRestaurantUpgrades(ctx);
      return state;

    case "pick_menu":
      if (event.type === "all_chosen") return nextAfterMenu(ctx);
      return state;

    case "shop":
      if (event.type === "all_ready") return "leisure";
      return state;

    case "leisure":
      if (event.type === "all_ready") return "next_phase";
      return state;

    case "next_phase":
      return state;

    default:
      return state;
  }
}

/** After the info screen gate fires, determine first pick phase or skip to shop/done */
function nextPickOrShopOrDone(ctx: EodContext): EodState {
  if (ctx.hasUpgradeDraft) return "pick_upgrades";
  if (ctx.hasStockDraft) return "pick_stocks";
  if (ctx.hasRestaurantUpgradeDraft) return "pick_restaurant_upgrades";
  if (ctx.hasMenuDraft) return "pick_menu";
  if (ctx.hasTickets && (ctx.hasRestaurantState || ctx.isBossDay)) return "shop";
  return "leisure";
}

function nextAfterUpgrades(ctx: EodContext): EodState {
  // Upgrades + stocks are a single gate (both submitted together)
  // so this always goes to stocks
  if (ctx.hasStockDraft) return "pick_stocks";
  if (ctx.hasRestaurantUpgradeDraft) return "pick_restaurant_upgrades";
  if (ctx.hasMenuDraft) return "pick_menu";
  if (ctx.hasTickets && (ctx.hasRestaurantState || ctx.isBossDay)) return "shop";
  return "leisure";
}

function nextAfterStocks(ctx: EodContext): EodState {
  if (ctx.hasRestaurantUpgradeDraft) return "pick_restaurant_upgrades";
  if (ctx.hasMenuDraft) return "pick_menu";
  if (ctx.hasTickets && (ctx.hasRestaurantState || ctx.isBossDay)) return "shop";
  return "leisure";
}

function nextAfterRestaurantUpgrades(ctx: EodContext): EodState {
  if (ctx.hasMenuDraft) return "pick_menu";
  if (ctx.hasTickets && (ctx.hasRestaurantState || ctx.isBossDay)) return "shop";
  return "leisure";
}

function nextAfterMenu(ctx: EodContext): EodState {
  if (ctx.hasTickets) return "shop";
  return "leisure";
}

/**
 * Build context from current game state.
 * Use this to drive the state machine with real data.
 */
export function buildEodContext(opts: {
  upgradeDraftOptions: unknown[];
  stockDraftOptions: unknown[];
  restaurantUpgradeDraftOptions: unknown[];
  menuDraftOptions: unknown[];
  tradingTickets: number;
  restaurantTickets: number;
  restaurantState: unknown | null;
  isBossDay: boolean;
}): EodContext {
  return {
    hasUpgradeDraft: opts.upgradeDraftOptions.length > 0,
    hasStockDraft: opts.stockDraftOptions.length > 0,
    hasRestaurantUpgradeDraft: opts.restaurantUpgradeDraftOptions.length > 0,
    hasMenuDraft: opts.menuDraftOptions.length > 0,
    hasTickets: opts.tradingTickets > 0 || opts.restaurantTickets > 0,
    hasRestaurantState: opts.restaurantState !== null,
    isBossDay: opts.isBossDay,
  };
}
