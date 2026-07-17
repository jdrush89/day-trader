import { describe, it, expect } from "vitest";
import { eodTransition, buildEodContext, EodState } from "../eod-machine";

/**
 * Integration tests simulating full multiplayer day flows.
 * These verify the exact scenarios that previously caused bugs:
 *
 * 1. Day 2 after trading: stocks → restaurant transition (not stuck on trading UI)
 * 2. Day 1 after restaurant: picks → shop (shop only AFTER picks)
 * 3. Menu draft not stuck (gate fires properly)
 */

describe("MP Flow: Day 2 trading → restaurant transition", () => {
  it("after stocks chosen with no restaurant options, goes to next_phase (restaurant)", () => {
    // This was the bug in v0.0.72: stale restaurantUpgradeDraftOptions caused
    // the machine to go to pick_restaurant_upgrades instead of next_phase
    const ctx = buildEodContext({
      upgradeDraftOptions: [],  // already picked
      stockDraftOptions: [],    // already picked
      restaurantUpgradeDraftOptions: [],  // MUST be empty after trading
      menuDraftOptions: [],
      tradingTickets: 0,
      restaurantTickets: 0,
      restaurantState: null,   // no restaurant active yet
      isBossDay: false,
    });

    const result = eodTransition("pick_stocks", { type: "all_chosen" }, ctx);
    expect(result).toBe("leisure");
  });

  it("if stale restaurant options leaked, would incorrectly go to pick_restaurant_upgrades", () => {
    // This demonstrates what the bug looked like
    const buggyCtx = buildEodContext({
      upgradeDraftOptions: [],
      stockDraftOptions: [],
      restaurantUpgradeDraftOptions: ["upgrade_1", "upgrade_2"],  // LEAKED from previous day
      menuDraftOptions: [],
      tradingTickets: 0,
      restaurantTickets: 0,
      restaurantState: null,
      isBossDay: false,
    });

    // The machine correctly returns pick_restaurant_upgrades — the bug was that
    // the OPTIONS shouldn't have been there in the first place. The fix was to
    // clear them in handleAcquireRestaurantUpgrade.
    const result = eodTransition("pick_stocks", { type: "all_chosen" }, buggyCtx);
    expect(result).toBe("pick_restaurant_upgrades");
  });
});

describe("MP Flow: Shop timing", () => {
  it("shop shows AFTER picks, not between challenges and waiting", () => {
    // After restaurant shift ends with tickets earned
    const ctx = buildEodContext({
      upgradeDraftOptions: [],
      stockDraftOptions: [],
      restaurantUpgradeDraftOptions: ["u1"],
      menuDraftOptions: [{ name: "burger" }],
      tradingTickets: 1,
      restaurantTickets: 2,
      restaurantState: { shiftOver: true },  // non-null = restaurant was active
      isBossDay: false,
    });

    let state: EodState = "info_challenges";

    // Continue from challenges → should go to WAITING, not shop
    state = eodTransition(state, { type: "continue" }, ctx);
    expect(state).toBe("waiting");
    expect(state).not.toBe("shop");

    // Gate fires → should go to picks first
    state = eodTransition(state, { type: "all_ready" }, ctx);
    expect(state).toBe("pick_restaurant_upgrades");

    // Pick restaurant upgrade
    state = eodTransition(state, { type: "choice_made" }, ctx);
    expect(state).toBe("pick_menu");

    // All menu items chosen → NOW shop shows
    state = eodTransition(state, { type: "all_chosen" }, ctx);
    expect(state).toBe("shop");
  });

  it("shop does not show when no tickets after picks", () => {
    const ctx = buildEodContext({
      upgradeDraftOptions: [],
      stockDraftOptions: [],
      restaurantUpgradeDraftOptions: [],
      menuDraftOptions: [],
      tradingTickets: 0,
      restaurantTickets: 0,
      restaurantState: { shiftOver: true },
      isBossDay: false,
    });

    const result = eodTransition("pick_menu", { type: "all_chosen" }, ctx);
    expect(result).toBe("leisure");
  });
});

describe("MP Flow: Menu draft gate", () => {
  it("complete flow from restaurant upgrades to menu to next phase", () => {
    const ctx = buildEodContext({
      upgradeDraftOptions: [],
      stockDraftOptions: [],
      restaurantUpgradeDraftOptions: ["u1", "u2"],
      menuDraftOptions: [{ name: "burger" }],
      tradingTickets: 0,
      restaurantTickets: 0,
      restaurantState: { shiftOver: true },
      isBossDay: false,
    });

    let state: EodState = "pick_restaurant_upgrades";

    // Player picks restaurant upgrade → moves to menu
    state = eodTransition(state, { type: "choice_made" }, ctx);
    expect(state).toBe("pick_menu");

    // All players pick menu item → no tickets → next_phase
    state = eodTransition(state, { type: "all_chosen" }, ctx);
    expect(state).toBe("leisure");
  });
});

describe("MP Flow: Full 3-day simulation", () => {
  it("day 1 trading → day 1 restaurant → day 2 trading → restaurant", () => {
    // Day 1: Trading only (no restaurant yet, first time)
    let state: EodState = "trading";
    let ctx = buildEodContext({
      upgradeDraftOptions: ["u1", "u2", "u3"],
      stockDraftOptions: [{ symbol: "MEGA" }],
      restaurantUpgradeDraftOptions: [],
      menuDraftOptions: [],
      tradingTickets: 0,
      restaurantTickets: 0,
      restaurantState: null,
      isBossDay: false,
    });

    // Market closes
    state = eodTransition(state, { type: "market_closed" }, ctx);
    expect(state).toBe("info_summary");

    // Navigate info screens
    state = eodTransition(state, { type: "continue" }, ctx);
    state = eodTransition(state, { type: "continue" }, ctx);
    expect(state).toBe("waiting");

    // Gate fires → upgrades available
    state = eodTransition(state, { type: "all_ready" }, ctx);
    expect(state).toBe("pick_upgrades");

    // All pick upgrades + stocks
    state = eodTransition(state, { type: "all_chosen" }, ctx);
    expect(state).toBe("pick_stocks");
    state = eodTransition(state, { type: "all_chosen" }, ctx);
    expect(state).toBe("leisure"); // → transition to restaurant

    // Day 1: Restaurant shift
    state = "restaurant";
    ctx = buildEodContext({
      upgradeDraftOptions: [],
      stockDraftOptions: [],
      restaurantUpgradeDraftOptions: ["ru1", "ru2"],
      menuDraftOptions: [{ name: "burger" }],
      tradingTickets: 1,
      restaurantTickets: 0,
      restaurantState: { shiftOver: true },
      isBossDay: false,
    });

    state = eodTransition(state, { type: "shift_ended" }, ctx);
    state = eodTransition(state, { type: "continue" }, ctx); // → challenges
    state = eodTransition(state, { type: "continue" }, ctx); // → waiting
    state = eodTransition(state, { type: "all_ready" }, ctx); // → restaurant upgrades
    expect(state).toBe("pick_restaurant_upgrades");

    state = eodTransition(state, { type: "choice_made" }, ctx); // → menu
    state = eodTransition(state, { type: "all_chosen" }, ctx); // → shop (has tickets)
    expect(state).toBe("shop");

    state = eodTransition(state, { type: "all_ready" }, ctx); // → next_phase
    expect(state).toBe("leisure"); // → begin day 2 trading

    // Day 2: Trading
    state = "trading";
    ctx = buildEodContext({
      upgradeDraftOptions: ["u4", "u5"],
      stockDraftOptions: [{ symbol: "TECH" }],
      restaurantUpgradeDraftOptions: [],  // CLEARED from day 1
      menuDraftOptions: [],               // CLEARED from day 1
      tradingTickets: 0,
      restaurantTickets: 0,
      restaurantState: null,  // not in restaurant yet
      isBossDay: false,
    });

    state = eodTransition(state, { type: "market_closed" }, ctx);
    state = eodTransition(state, { type: "continue" }, ctx);
    state = eodTransition(state, { type: "continue" }, ctx);
    state = eodTransition(state, { type: "all_ready" }, ctx);
    expect(state).toBe("pick_upgrades");

    state = eodTransition(state, { type: "all_chosen" }, ctx);
    state = eodTransition(state, { type: "all_chosen" }, ctx);
    // Should go to restaurant, NOT get stuck
    expect(state).toBe("leisure");
  });
});
