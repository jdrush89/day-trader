import { describe, it, expect } from "vitest";
import { eodTransition, EodContext, EodState } from "../eod-machine";

function ctx(overrides: Partial<EodContext> = {}): EodContext {
  return {
    hasUpgradeDraft: false,
    hasStockDraft: false,
    hasRestaurantUpgradeDraft: false,
    hasMenuDraft: false,
    hasTickets: false,
    hasRestaurantState: false,
    isBossDay: false,
    ...overrides,
  };
}

describe("eodTransition", () => {
  describe("basic info screen flow", () => {
    it("trading → info_summary on market close", () => {
      expect(eodTransition("trading", { type: "market_closed" }, ctx())).toBe("info_summary");
    });

    it("info_summary → info_challenges on continue", () => {
      expect(eodTransition("info_summary", { type: "continue" }, ctx())).toBe("info_challenges");
    });

    it("info_summary → waiting on continue (boss day)", () => {
      expect(eodTransition("info_summary", { type: "continue" }, ctx({ isBossDay: true }))).toBe("waiting");
    });

    it("info_challenges → waiting on continue", () => {
      expect(eodTransition("info_challenges", { type: "continue" }, ctx())).toBe("waiting");
    });

    it("restaurant → info_summary on shift end", () => {
      expect(eodTransition("restaurant", { type: "shift_ended" }, ctx())).toBe("info_summary");
    });
  });

  describe("waiting gate → picks", () => {
    it("goes to upgrades when available", () => {
      expect(eodTransition("waiting", { type: "all_ready" }, ctx({ hasUpgradeDraft: true, hasStockDraft: true }))).toBe("pick_upgrades");
    });

    it("skips upgrades, goes to stocks", () => {
      expect(eodTransition("waiting", { type: "all_ready" }, ctx({ hasStockDraft: true }))).toBe("pick_stocks");
    });

    it("goes to restaurant upgrades when no trading picks", () => {
      expect(eodTransition("waiting", { type: "all_ready" }, ctx({ hasRestaurantUpgradeDraft: true }))).toBe("pick_restaurant_upgrades");
    });

    it("goes to menu when only menu draft", () => {
      expect(eodTransition("waiting", { type: "all_ready" }, ctx({ hasMenuDraft: true }))).toBe("pick_menu");
    });

    it("goes to shop when tickets and restaurant state", () => {
      expect(eodTransition("waiting", { type: "all_ready" }, ctx({ hasTickets: true, hasRestaurantState: true }))).toBe("shop");
    });

    it("goes to next_phase when nothing needed", () => {
      expect(eodTransition("waiting", { type: "all_ready" }, ctx())).toBe("next_phase");
    });

    it("tickets without restaurant state → next_phase (no shop)", () => {
      expect(eodTransition("waiting", { type: "all_ready" }, ctx({ hasTickets: true, hasRestaurantState: false }))).toBe("next_phase");
    });
  });

  describe("pick phase transitions", () => {
    it("upgrades → stocks when stock draft available", () => {
      expect(eodTransition("pick_upgrades", { type: "all_chosen" }, ctx({ hasStockDraft: true }))).toBe("pick_stocks");
    });

    it("stocks → restaurant upgrades", () => {
      expect(eodTransition("pick_stocks", { type: "all_chosen" }, ctx({ hasRestaurantUpgradeDraft: true }))).toBe("pick_restaurant_upgrades");
    });

    it("stocks → next_phase when no restaurant options", () => {
      expect(eodTransition("pick_stocks", { type: "all_chosen" }, ctx())).toBe("next_phase");
    });

    it("stocks → shop when tickets available (after restaurant)", () => {
      expect(eodTransition("pick_stocks", { type: "all_chosen" }, ctx({ hasTickets: true, hasRestaurantState: true }))).toBe("shop");
    });

    it("restaurant upgrades (choice_made) → pick_menu", () => {
      expect(eodTransition("pick_restaurant_upgrades", { type: "choice_made" }, ctx({ hasMenuDraft: true }))).toBe("pick_menu");
    });

    it("menu → shop when tickets", () => {
      expect(eodTransition("pick_menu", { type: "all_chosen" }, ctx({ hasTickets: true }))).toBe("shop");
    });

    it("menu → next_phase when no tickets", () => {
      expect(eodTransition("pick_menu", { type: "all_chosen" }, ctx())).toBe("next_phase");
    });
  });

  describe("shop", () => {
    it("shop → next_phase when all ready", () => {
      expect(eodTransition("shop", { type: "all_ready" }, ctx())).toBe("next_phase");
    });
  });

  describe("full day 1 flow (trading only)", () => {
    it("completes trading → info → picks → next phase", () => {
      const context = ctx({ hasUpgradeDraft: true, hasStockDraft: true });
      let state: EodState = "trading";

      state = eodTransition(state, { type: "market_closed" }, context);
      expect(state).toBe("info_summary");

      state = eodTransition(state, { type: "continue" }, context);
      expect(state).toBe("info_challenges");

      state = eodTransition(state, { type: "continue" }, context);
      expect(state).toBe("waiting");

      state = eodTransition(state, { type: "all_ready" }, context);
      expect(state).toBe("pick_upgrades");

      state = eodTransition(state, { type: "all_chosen" }, context);
      expect(state).toBe("pick_stocks");

      state = eodTransition(state, { type: "all_chosen" }, context);
      expect(state).toBe("next_phase");
    });
  });

  describe("full day 2 flow (trading + restaurant)", () => {
    it("trading → picks → restaurant → picks → shop → done", () => {
      // After trading on day 2 (no restaurant upgrades yet)
      let tradingCtx = ctx({ hasUpgradeDraft: true, hasStockDraft: true });
      let state: EodState = "trading";

      state = eodTransition(state, { type: "market_closed" }, tradingCtx);
      state = eodTransition(state, { type: "continue" }, tradingCtx); // → challenges
      state = eodTransition(state, { type: "continue" }, tradingCtx); // → waiting
      state = eodTransition(state, { type: "all_ready" }, tradingCtx); // → upgrades
      state = eodTransition(state, { type: "all_chosen" }, tradingCtx); // → stocks
      state = eodTransition(state, { type: "all_chosen" }, tradingCtx); // → next_phase (go to restaurant)
      expect(state).toBe("next_phase");

      // Restaurant shift happens...
      state = "restaurant";
      // After restaurant, options are generated
      const restaurantCtx = ctx({
        hasRestaurantUpgradeDraft: true,
        hasMenuDraft: true,
        hasTickets: true,
        hasRestaurantState: true,
      });

      state = eodTransition(state, { type: "shift_ended" }, restaurantCtx);
      expect(state).toBe("info_summary");

      state = eodTransition(state, { type: "continue" }, restaurantCtx); // → challenges
      state = eodTransition(state, { type: "continue" }, restaurantCtx); // → waiting
      state = eodTransition(state, { type: "all_ready" }, restaurantCtx); // → restaurant upgrades
      expect(state).toBe("pick_restaurant_upgrades");

      state = eodTransition(state, { type: "choice_made" }, restaurantCtx); // → menu
      expect(state).toBe("pick_menu");

      state = eodTransition(state, { type: "all_chosen" }, restaurantCtx); // → shop
      expect(state).toBe("shop");

      state = eodTransition(state, { type: "all_ready" }, restaurantCtx); // → next_phase
      expect(state).toBe("next_phase");
    });
  });

  describe("invalid events are ignored", () => {
    it("trading ignores continue", () => {
      expect(eodTransition("trading", { type: "continue" }, ctx())).toBe("trading");
    });

    it("info_summary ignores all_ready", () => {
      expect(eodTransition("info_summary", { type: "all_ready" }, ctx())).toBe("info_summary");
    });

    it("pick_stocks ignores continue", () => {
      expect(eodTransition("pick_stocks", { type: "continue" }, ctx())).toBe("pick_stocks");
    });
  });
});
