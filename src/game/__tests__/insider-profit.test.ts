import { describe, expect, it } from "vitest";
import { coverShort, getInsiderProfitInfo, sellStock } from "../engine";
import { createInitialState } from "../state";
import type { GameState, InsiderTip } from "../types";

function stateWithTip(direction: InsiderTip["direction"]): GameState {
  const state = createInitialState();
  const symbol = state.stocks[0].symbol;
  return {
    ...state,
    insiderViewed: true,
    insiderTip: {
      id: "test-tip",
      symbol,
      companyName: "Test Company",
      tipText: "Test tip",
      direction,
      day: state.day,
    },
    stocks: state.stocks.map((stock) => stock.symbol === symbol ? { ...stock, price: 120 } : stock),
    portfolio: [{ symbol, shares: 10, avgCost: 100, dayAcquired: state.day }],
    shorts: [{ symbol, shares: 10, entryPrice: 140 }],
  };
}

describe("insider profit tracking", () => {
  it("counts long profit but not short profit for an upward tip", () => {
    const info = getInsiderProfitInfo(stateWithTip("up"));

    expect(info.profit).toBe(200);
    expect(info.catchChance).toBeCloseTo(0.1 + 200 / 3500);
  });

  it("counts short profit but not long profit for a downward tip", () => {
    const info = getInsiderProfitInfo(stateWithTip("down"));

    expect(info.profit).toBe(200);
    expect(info.catchChance).toBeCloseTo(0.1 + 200 / 3500);
  });

  it("does not create SEC risk from unprofitable tipped-direction exposure", () => {
    const state = stateWithTip("up");
    const info = getInsiderProfitInfo({
      ...state,
      portfolio: [{ ...state.portfolio[0], avgCost: 130 }],
    });

    expect(info.profit).toBe(0);
    expect(info.catchChance).toBe(0);
  });

  it("only records realized profit from trades aligned with the tip", () => {
    const upwardState = stateWithTip("up");
    const upwardSymbol = upwardState.stocks[0].symbol;
    const upwardSell = sellStock(upwardState, upwardSymbol, 10);
    const upwardCover = coverShort(upwardState, upwardSymbol, 10);

    expect(upwardSell.insiderRealizedProfit).toBe(200);
    expect(upwardCover.insiderRealizedProfit).toBe(0);

    const downwardState = stateWithTip("down");
    const downwardSymbol = downwardState.stocks[0].symbol;
    const downwardSell = sellStock(downwardState, downwardSymbol, 10);
    const downwardCover = coverShort(downwardState, downwardSymbol, 10);

    expect(downwardSell.insiderRealizedProfit).toBe(0);
    expect(downwardCover.insiderRealizedProfit).toBe(200);
  });
});
