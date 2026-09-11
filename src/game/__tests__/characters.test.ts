import { describe, expect, it, vi } from "vitest";
import { characterScale, xpRequiredForLevel, type CharacterSelection } from "../characters";
import { buyOption, buyStock, getIanSightDuration, getMarketDuration, placeOrder, sellStock } from "../engine";
import { acceptOrder, calculateTip, createRestaurantState, serveOrder } from "../restaurant-engine";
import { createInitialState } from "../state";

const character = (id: CharacterSelection["id"], level = 1): CharacterSelection => ({ id, level });

describe("character progression", () => {
  it("requires progressively more XP and caps scaled abilities", () => {
    expect(xpRequiredForLevel(2)).toBeGreaterThan(xpRequiredForLevel(1));
    expect(xpRequiredForLevel(3)).toBeGreaterThan(xpRequiredForLevel(2));
    expect(characterScale(100, 1, 0.1, 3)).toBe(3);
  });
});

describe("trading characters", () => {
  it("adds Jane's directional bias after a trade", () => {
    const state = createInitialState(1, character("jane"));
    const next = buyStock(state, state.stocks[0].symbol, 1, "Jane", character("jane", 3));

    expect(next.characterMarketBiases).toHaveLength(1);
    expect(next.characterMarketBiases[0]).toMatchObject({ symbol: state.stocks[0].symbol, direction: "up" });
  });

  it("amplifies Colin's realized meme-stock gains", () => {
    const state = createInitialState();
    const meme = state.stocks.find((stock) => stock.tags.includes("social-media"))!;
    const withPosition = {
      ...state,
      stocks: state.stocks.map((stock) => stock.symbol === meme.symbol ? { ...stock, price: 20 } : stock),
      portfolio: [{ symbol: meme.symbol, shares: 10, avgCost: 10, dayAcquired: 1 }],
    };

    const normal = sellStock(withPosition, meme.symbol, 10);
    const colin = sellStock(withPosition, meme.symbol, 10, "Colin", character("colin", 1));
    expect(colin.cash - withPosition.cash).toBeGreaterThan(normal.cash - withPosition.cash);
  });

  it("blocks every Josh manual entry route", () => {
    const state = createInitialState(1, character("josh"));
    const symbol = state.stocks[0].symbol;
    const josh = character("josh");

    expect(buyStock(state, symbol, 1, "Josh", josh).portfolio).toEqual([]);
    expect(buyOption(state, symbol, "call", state.stocks[0].price, 1, 1, josh).optionsPositions).toEqual([]);
    expect(placeOrder(state, symbol, "buy", 1, "limit", state.stocks[0].price, undefined, josh).pendingOrders).toEqual([]);
  });

  it("uses the strongest Zack to extend a shared trading day", () => {
    const state = createInitialState(2, character("jane"), {
      first: character("zack", 1),
      second: character("zack", 4),
    });
    expect(getMarketDuration(state)).toBe(155);
  });

  it("keeps Ian's sight active for 10 to 20 ticks as he levels", () => {
    expect(getIanSightDuration(1)).toBe(10);
    expect(getIanSightDuration(6)).toBe(15);
    expect(getIanSightDuration(20)).toBe(20);
  });

  it("misroutes Dinky trades at the configured chance", () => {
    const state = createInitialState();
    const requested = state.stocks[0].symbol;
    vi.spyOn(Math, "random").mockReturnValue(0);
    const next = buyStock(state, requested, 1, "Dinky", character("dinky"));
    vi.restoreAllMocks();

    expect(next.portfolio[0].symbol).not.toBe(requested);
  });
});

describe("restaurant characters", () => {
  it("adds Sydney's required garnish and doubles her level-one tips", () => {
    const sydney = character("sydney");
    const game = createInitialState(1, sydney, { player: sydney });
    const restaurant = createRestaurantState(game);
    const order = restaurant.orderSlots.find(Boolean)!;
    const assemble = order.menuItem.steps.find((step) => step.type === "assemble");
    expect(assemble?.ingredients.some((ingredient) => ingredient.name === "Chef's garnish" && ingredient.essential)).toBe(true);

    const completed = { ...order, completed: true };
    const ready = { ...restaurant, orderSlots: restaurant.orderSlots.map((slot) => slot?.id === order.id ? completed : slot) };
    const baseTip = calculateTip(completed);
    expect(serveOrder(ready, ready.orderSlots.indexOf(completed), 1, "player", sydney).totalTips).toBeCloseTo(baseTip * 2);
  });

  it("gives Cameron patience and charges for abandoning an unfinished order", () => {
    const cameron = character("cameron");
    const restaurant = createRestaurantState(createInitialState());
    const first = restaurant.orderSlots.find(Boolean)!;
    const firstIndex = restaurant.orderSlots.indexOf(first);
    const secondIndex = firstIndex === 0 ? 1 : 0;
    const second = { ...first, id: first.id + 1 };
    const withTwo = {
      ...restaurant,
      orderSlots: restaurant.orderSlots.map((slot, index) => index === secondIndex ? second : slot),
    };

    const started = acceptOrder(withTwo, firstIndex, cameron);
    expect(started.orderSlots[firstIndex]!.patienceRemaining).toBeGreaterThan(first.patienceRemaining);
    const switched = acceptOrder(started, secondIndex, cameron);
    expect(switched.totalEarnings).toBe(-5);
  });
});
