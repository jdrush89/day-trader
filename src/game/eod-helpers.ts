/**
 * EOD Machine integration helpers.
 *
 * Maps state machine outputs to the existing App.tsx state variables
 * and side effects. This bridges the pure state machine with the
 * React component's setState calls.
 */

import { eodTransition, buildEodContext, EodState, EodEvent, EodContext } from "./eod-machine";

export type EodPhase = "summary" | "challenges" | "shop" | "upgrades" | "stocks" | "restaurant-upgrades" | "menu-draft";
export type LocalInfoStep = "summary" | "challenges" | "shop" | "waiting" | null;

/**
 * Maps an EodState to the pair of (eodPhase, localInfoStep) used for rendering.
 * Returns null for states that don't directly map (trading, restaurant, next_phase).
 */
export function mapStateToPhases(state: EodState): { eodPhase: EodPhase; localInfoStep: LocalInfoStep } | null {
  switch (state) {
    case "info_summary":
      return { eodPhase: "summary", localInfoStep: "summary" };
    case "info_challenges":
      return { eodPhase: "summary", localInfoStep: "challenges" };
    case "waiting":
      return { eodPhase: "summary", localInfoStep: "waiting" };
    case "pick_upgrades":
      return { eodPhase: "upgrades", localInfoStep: null };
    case "pick_stocks":
      return { eodPhase: "stocks", localInfoStep: null };
    case "pick_restaurant_upgrades":
      return { eodPhase: "restaurant-upgrades", localInfoStep: null };
    case "pick_menu":
      return { eodPhase: "menu-draft", localInfoStep: null };
    case "shop":
      return { eodPhase: "shop", localInfoStep: "shop" };
    case "next_phase":
      return null; // triggers side effects, not rendering
    case "trading":
    case "restaurant":
      return null;
    default:
      return null;
  }
}

/**
 * Determines what the next machine state should be after an event,
 * given the current context. Returns the new state and whether it
 * represents a "gate" phase change (host broadcasts to peers).
 */
export interface TransitionResult {
  newState: EodState;
  /** True if this transition should be broadcast to peers (pick phases, shop) */
  hostBroadcast: boolean;
  /** True if the transition requires a gate reset */
  needsGateReset: boolean;
}

export function computeTransition(
  currentState: EodState,
  event: EodEvent,
  ctx: EodContext
): TransitionResult {
  const newState = eodTransition(currentState, event, ctx);
  if (newState === currentState) {
    return { newState, hostBroadcast: false, needsGateReset: false };
  }

  const hostBroadcast =
    newState === "pick_upgrades" ||
    newState === "pick_stocks" ||
    newState === "pick_restaurant_upgrades" ||
    newState === "pick_menu" ||
    newState === "shop";

  const needsGateReset =
    newState === "pick_upgrades" ||
    newState === "pick_stocks" ||
    newState === "pick_restaurant_upgrades" ||
    newState === "pick_menu";

  return { newState, hostBroadcast, needsGateReset };
}

export { eodTransition, buildEodContext, type EodState, type EodEvent, type EodContext };
