import { describe, expect, it, vi } from "vitest";
import {
  createCasinoState,
  finishSlotsAnimation,
  getRouletteBetLabel,
  setCasinoBet,
  spinRoulette,
  spinSlots,
  toggleRouletteBet,
} from "../casino";

describe("casino mini-games", () => {
  it("keeps slot payouts pending until the spin animation finishes", () => {
    const randomSpy = vi.spyOn(Math, "random");
    [0, 0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5, 0.7].forEach((value) => randomSpy.mockReturnValueOnce(value));

    const baseState = createCasinoState(1_000);
    const bettingState = {
      ...baseState,
      stage: "slots" as const,
      slots: { ...baseState.slots, bet: 100 },
    };

    const spinningState = spinSlots(bettingState);
    expect(spinningState.slots.phase).toBe("spinning");
    expect(spinningState.totalNetChange).toBe(0);

    const finishedState = finishSlotsAnimation(spinningState);
    expect(finishedState.slots.phase).toBe("result");
    expect(finishedState.totalNetChange).toBe(finishedState.slots.netChange);

    randomSpy.mockRestore();
  });

  it("splits roulette bets evenly across selected positions", () => {
    const baseState = createCasinoState(1_000);
    const rouletteState = { ...baseState, stage: "roulette" as const };

    const withSelections = toggleRouletteBet(
      toggleRouletteBet(toggleRouletteBet(rouletteState, "red"), "single", 7),
      "half1",
    );
    const withBet = setCasinoBet(withSelections, 100);

    expect(getRouletteBetLabel(withBet.roulette)).toBe("3 positions selected");
    expect(withBet.roulette.bets.map((bet) => bet.amount)).toEqual([33.33, 33.33, 33.33]);
  });

  it("settles multiple roulette bets independently", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.2);
    const baseState = createCasinoState(1_000);
    const rouletteState = { ...baseState, stage: "roulette" as const };

    const bettingState = setCasinoBet(
      toggleRouletteBet(toggleRouletteBet(rouletteState, "red"), "single", 7),
      100,
    );
    const resultState = spinRoulette(bettingState);

    expect(resultState.roulette.phase).toBe("result");
    expect(resultState.roulette.resultNumber).toBe(7);
    expect(resultState.roulette.resolvedBets).toHaveLength(2);
    expect(resultState.roulette.resolvedBets.map((bet) => bet.won)).toEqual([true, true]);
    expect(resultState.roulette.netChange).toBe(1800);
    expect(resultState.totalNetChange).toBe(1800);

    randomSpy.mockRestore();
  });
});
