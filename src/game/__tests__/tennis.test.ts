import { describe, expect, it } from "vitest";
import { BALL_RADIUS, COURT_WIDTH, createTennisState, tennisTick } from "../tennis";

describe("single-point tennis", () => {
  it("ends immediately when the player scores", () => {
    const state = createTennisState();
    const result = tennisTick({
      ...state,
      phase: "playing",
      ball: { ...state.ball, x: COURT_WIDTH + BALL_RADIUS + 1, vx: 1 },
    });

    expect(result.phase).toBe("game_over");
    expect(result.playerWon).toBe(true);
    expect(result.playerScore).toBe(1);
  });

  it("ends immediately when the opponent scores", () => {
    const state = createTennisState();
    const result = tennisTick({
      ...state,
      phase: "playing",
      ball: { ...state.ball, x: -BALL_RADIUS - 1, vx: -1 },
    });

    expect(result.phase).toBe("game_over");
    expect(result.playerWon).toBe(false);
    expect(result.opponentScore).toBe(1);
  });
});
