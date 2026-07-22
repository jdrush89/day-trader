import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import {
  acceptOrder,
  handleChopKey,
  handleKeyPress,
  handleKeyUp,
  handleMouseMove as handleRestaurantMouseMove,
  handleChoreMouseMove,
  handleChoreClick,
  handleChoreKeyPress,
  recordOrderContributor,
  restaurantTick,
  serveOrder,
  selectSchmoozeOption,
} from "../game/restaurant-engine";
import { ActiveChore, ActiveOrder, OrderStep, RestaurantState, RhythmResult } from "../game/restaurant-types";
import { type InsiderTip } from "../game/types";
import { RESTAURANT_UPGRADE_POOL } from "../game/restaurant-upgrades";
import { ALL_CHALLENGES, type ActiveChallenge } from "../game/challenges";
import { getConsumable, getPhaseItems, type ConsumableInventory } from "../game/consumables";
import { PnLGraph } from "./PnLGraph";
import type { PlayerPnLSeries, PnLDataPoint } from "../game/trade-log";

const TICK_MS = 50;

interface RestaurantProps {
  day: number;
  paused: boolean;
  state: RestaurantState;
  setRestaurantState: Dispatch<SetStateAction<RestaurantState | null>>;
  onFinish: (earnings: number) => void;
  milestoneTarget: number | null;
  milestoneDaysLeft: number;
  netWorth: number;
  speed: number;
  onSpeedChange: (speed: number) => void;
  acquiredRestaurantUpgrades: string[];
  debugFF?: boolean;
  onDebugFF?: () => void;
  isBossDay?: boolean;
  activeChallenges?: ActiveChallenge[];
  tradingTickets?: number;
  restaurantTickets?: number;
  isPeer?: boolean;
  onPeerKey?: (key: string) => void;
  onPeerKeyUp?: (key: string) => void;
  onPeerMouse?: (x: number, y: number) => void;
  onPeerChoreClick?: (nx: number, ny: number) => void;
  // Multiplayer counter props
  currentCounter?: number;
  onSwitchCounter?: (counter: number) => void;
  localActiveOrderId?: number | null; // peer's local active order (separate from state.activeOrderId)
  consumableInventory?: ConsumableInventory;
  onUseRestaurantItem?: (itemId: string) => void;
  // Player info for order contributor tracking and graph
  localPlayerId?: string;
  localPlayerName?: string;
  players?: Array<{ id: string; name: string; color: string }>;
  hideShiftSummary?: boolean;
  onSchmoozeSuccess?: () => InsiderTip;
}

function getCurrentStep(order: ActiveOrder): OrderStep | undefined {
  return order.menuItem.steps[order.currentStepIndex];
}

function getStepStatus(order: ActiveOrder): string {
  if (order.burnt) return "🔥 Burnt!";
  if (order.failed) return "👋 Customer left";
  if (order.completed) return "Ready to serve";
  const step = getCurrentStep(order);
  if (!step) return "Ready";
  if ((step.type === "grill" || step.type === "fry") && order.prepStarted) {
    return `${step.label} (${Math.min(100, Math.round((order.prepProgress / step.duration) * 100))}%)`;
  }
  if (step.type === "rhythm") return `${step.label} (${order.rhythmHits}/${step.hits.length} hits)`;
  if (step.type === "hold") return `${step.label} (${Math.round(order.holdProgress * 100)}%)`;
  if (step.type === "memorize") {
    return order.memorizeRevealed
      ? `${step.label} (${(order.memorizeRevealTimer / 20).toFixed(1)}s left)`
      : `${step.label} (${order.memorizeInputIndex}/${step.sequenceLength})`;
  }
  return step.label;
}

function getSlotMiniProgress(order: ActiveOrder): { pct: number; type: string; burnZone: boolean } | null {
  if (order.completed || order.failed) return null;
  const step = getCurrentStep(order);
  if (!step) return null;
  if ((step.type === "grill" || step.type === "fry") && order.prepStarted) {
    const pct = Math.min(130, (order.prepProgress / step.duration) * 100);
    return { pct, type: step.type, burnZone: pct > 100 };
  }
  if (step.type === "chop") {
    return { pct: Math.min(100, (order.chopCount / step.target) * 100), type: "chop", burnZone: false };
  }
  if (step.type === "mix") {
    return { pct: Math.min(100, (order.mixProgress / step.target) * 100), type: "mix", burnZone: false };
  }
  if (step.type === "rhythm") {
    return { pct: Math.min(100, (order.rhythmHitIndex / step.hits.length) * 100), type: "rhythm", burnZone: false };
  }
  if (step.type === "hold") {
    return { pct: Math.min(100, order.holdProgress * 100), type: "hold", burnZone: false };
  }
  if (step.type === "memorize") {
    const pct = order.memorizeRevealed
      ? Math.min(100, ((step.revealDuration - order.memorizeRevealTimer) / step.revealDuration) * 100)
      : Math.min(100, (order.memorizeInputIndex / step.sequenceLength) * 100);
    return { pct, type: "memorize", burnZone: false };
  }
  return null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function renderRhythmResult(result: RhythmResult, isActive: boolean): string {
  if (result === "hit") return "done";
  if (result === "miss") return "miss";
  return isActive ? "active" : "pending";
}

function renderStepInstruction(order: ActiveOrder, isTouch: boolean, triggerKey: (key: string) => void, triggerKeyDown?: (key: string) => void, triggerKeyUp?: (key: string) => void) {
  const step = getCurrentStep(order);
  if (!step) return null;

  if (step.type === "grill" || step.type === "fry") {
    const rawPct = (order.prepProgress / step.duration) * 100;
    const progressPct = Math.min(160, rawPct);
    const flipZone = step.type === "grill" && step.flipAt != null
      ? { left: ((step.flipAt - step.flipWindow) / step.duration) * 100, width: ((step.flipWindow * 2) / step.duration) * 100 }
      : null;
    const flipReady =
      step.type === "grill" &&
      step.flipAt != null &&
      !order.flipped &&
      order.prepStarted &&
      order.prepProgress >= step.flipAt - step.flipWindow &&
      order.prepProgress <= step.flipAt + step.flipWindow;
    const readyToPlate = order.prepProgress >= step.duration;
    const inBurnZone = rawPct > 100 && rawPct <= 160;
    const burnTimeLeft = (step.duration * 1.6 - order.prepProgress) / 20;
    const pastFlipZone = step.type === "grill" && step.flipAt != null && !order.flipped && order.prepProgress > step.flipAt + step.flipWindow;

    return (
      <div className="restaurant-step-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">
          {!order.prepStarted && (isTouch ? "Tap START to begin cooking." : "Press G to start cooking.")}
          {order.prepStarted && step.type === "grill" && !order.flipped && !flipReady && !pastFlipZone && !readyToPlate && "Watch the grill and flip on time."}
          {flipReady && (isTouch ? "Tap FLIP now!" : "Press F now to flip!")}
          {order.burnt && "🔥 Burnt! This order is lost."}
          {inBurnZone && !order.burnt && (isTouch ? `⚠️ Remove NOW! Tap PLATE. Burns in ${burnTimeLeft.toFixed(1)}s` : `⚠️ Remove NOW! Press G or Enter. Burns in ${burnTimeLeft.toFixed(1)}s`)}
          {readyToPlate && !inBurnZone && !order.burnt && (isTouch ? "Done! Tap PLATE to remove." : "Done! Press G or Enter to remove.")}
          {order.prepStarted && step.type === "fry" && !readyToPlate && "Keep an eye on the fryer."}
        </div>
        <div className={`cook-meter ${inBurnZone ? "burn-warning" : ""}`}>
          <div className="cook-meter-fill" style={{ width: `${Math.min(100, progressPct)}%` }} />
          {step.flipAt != null && !order.flipped && <div className="cook-meter-burn-zone" />}
          {inBurnZone && <div className="cook-meter-burn-fill" style={{ width: `${((rawPct - 100) / 60) * 100}%` }} />}
          {flipZone && !order.flipped && (
            <div className={`cook-meter-flip-zone ${flipReady ? "active" : ""}`} style={{ left: `${Math.max(0, flipZone.left)}%`, width: `${flipZone.width}%` }} />
          )}
        </div>
        <div className="cook-meta">
          <span>{(order.prepProgress / 20).toFixed(1)}s / {(step.duration / 20).toFixed(1)}s</span>
          {step.type === "grill" && <span>{order.flipped ? "✅ Flipped" : (isTouch ? "Tap FLIP" : "Press F to flip")}</span>}
        </div>
        {isTouch && (
          <div className="touch-controls">
            {!order.prepStarted && <button type="button" className="touch-btn primary" onClick={() => triggerKey("g")}>▶️ Start</button>}
            {order.prepStarted && step.type === "grill" && !order.flipped && (
              <button type="button" className={`touch-btn ${flipReady ? "urgent" : ""}`} disabled={!flipReady} onClick={() => triggerKey("f")}>🔄 Flip</button>
            )}
            {order.prepStarted && readyToPlate && !order.burnt && (
              <button type="button" className={`touch-btn ${inBurnZone ? "urgent" : "primary"}`} onClick={() => triggerKey("Enter")}>🍽️ Plate</button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (step.type === "chop") {
    const progressPct = Math.min(100, (order.chopCount / step.target) * 100);
    return (
      <div className="restaurant-step-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">{isTouch ? "Tap LEFT and RIGHT alternately!" : "Alternate ← and → rapidly!"}</div>
        <div className="task-meter">
          <div className="task-meter-fill chop" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="cook-meta">
          <span>{order.chopCount}/{step.target} chops</span>
          <span>Last: {order.lastChopKey ? order.lastChopKey.toUpperCase() : "—"}</span>
        </div>
        {isTouch && (
          <div className="touch-controls chop-controls">
            <button type="button" className={`touch-btn big ${order.lastChopKey === "right" ? "primary" : ""}`} onClick={() => triggerKey("ArrowLeft")}>⬅️ Left</button>
            <button type="button" className={`touch-btn big ${order.lastChopKey === "left" ? "primary" : ""}`} onClick={() => triggerKey("ArrowRight")}>Right ➡️</button>
          </div>
        )}
      </div>
    );
  }

  if (step.type === "mix") {
    const progressPct = Math.min(100, (order.mixProgress / step.target) * 100);
    return (
      <div className="restaurant-step-card mix-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">{isTouch ? (step.label.toLowerCase().includes("toss") ? "Drag your finger back and forth on the ring!" : "Drag your finger in circles on the ring!") : (step.label.toLowerCase().includes("toss") ? "Shake the mouse back and forth!" : "Swirl the mouse in circles!")}</div>
        <div className="mix-ring" style={{ "--mix-progress": `${progressPct}%` } as CSSProperties}>
          <div className="mix-ring-inner">{Math.round(progressPct)}%</div>
        </div>
        <div className="cook-meta">
          <span>{Math.round(order.mixProgress)} / {step.target} distance</span>
        </div>
      </div>
    );
  }

  if (step.type === "rhythm") {
    const totalDuration = step.hits[step.hits.length - 1].targetTick + step.hits[step.hits.length - 1].window;
    const beatPct = Math.min(100, (order.prepProgress / totalDuration) * 100);
    const currentHit = step.hits[order.rhythmHitIndex];
    return (
      <div className="restaurant-step-card rhythm-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">{isTouch ? "Tap the highlighted key when the beat reaches the zone." : "Hit each key when the beat reaches its target zone. Misses still move the sequence forward."}</div>
        <div className="rhythm-lane">
          <div className="rhythm-lane-progress" style={{ width: `${beatPct}%` }} />
          {step.hits.map((hit, index) => {
            const left = (hit.targetTick / totalDuration) * 100;
            const width = ((hit.window * 2) / totalDuration) * 100;
            const resultClass = renderRhythmResult(order.rhythmResults[index] ?? "pending", index === order.rhythmHitIndex);
            return (
              <div key={`${hit.key}-${hit.targetTick}`} className={`rhythm-hit rhythm-${resultClass}`} style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }}>
                <span>{hit.key.toUpperCase()}</span>
              </div>
            );
          })}
          <div className="rhythm-cursor" style={{ left: `${beatPct}%` }} />
        </div>
        <div className="rhythm-sequence">
          {step.hits.map((hit, index) => (
            <div key={`${hit.key}-${index}-chip`} className={`rhythm-chip ${renderRhythmResult(order.rhythmResults[index] ?? "pending", index === order.rhythmHitIndex)}`}>
              <span className="keycap">{hit.key.toUpperCase()}</span>
              <span>{order.rhythmResults[index] === "hit" ? "Perfect" : order.rhythmResults[index] === "miss" ? "Miss" : "Ready"}</span>
            </div>
          ))}
        </div>
        <div className="cook-meta">
          <span>{order.rhythmHits}/{step.hits.length} hits</span>
          <span>Beat {(order.prepProgress / 20).toFixed(1)}s</span>
        </div>
        {isTouch && currentHit && (
          <div className="touch-controls">
            <button type="button" className="touch-btn big primary" onClick={() => triggerKey(currentHit.key)}>Hit {currentHit.key.toUpperCase()}</button>
          </div>
        )}
      </div>
    );
  }

  if (step.type === "hold") {
    const fillPct = Math.min(100, order.holdProgress * 100);
    const zoneLeft = step.targetMin * 100;
    const zoneWidth = (step.targetMax - step.targetMin) * 100;
    const inZone = order.holdProgress >= step.targetMin && order.holdProgress <= step.targetMax;
    return (
      <div className="restaurant-step-card hold-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">
          {order.holdStartTick == null
            ? (isTouch ? `Press and hold the button to fill the meter, then release in the green zone.` : `Hold ${step.key.toUpperCase()} to fill the meter, then release in the green zone.`)
            : "Keep holding... release at the sweet spot!"}
        </div>
        <div className="hold-meter">
          <div className="hold-meter-zone" style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }} />
          <div className="hold-meter-fill" style={{ width: `${fillPct}%` }} />
        </div>
        <div className="hold-key-row">
          <span className={`keycap hold-key ${order.holdStartTick != null && !order.holdReleased ? "active" : ""}`}>{step.key.toUpperCase()}</span>
          <span className={`hold-status ${inZone ? "good" : ""}`}>{Math.round(fillPct)}%{inZone ? " — release!" : ""}</span>
        </div>
        {isTouch && (
          <div className="touch-controls">
            <button
              type="button"
              className={`touch-btn big ${order.holdStartTick != null && !order.holdReleased ? (inZone ? "urgent" : "primary") : "primary"}`}
              onPointerDown={(e) => { e.preventDefault(); triggerKeyDown?.(step.key); }}
              onPointerUp={(e) => { e.preventDefault(); triggerKeyUp?.(step.key); }}
              onPointerCancel={(e) => { e.preventDefault(); triggerKeyUp?.(step.key); }}
              onPointerLeave={(e) => { if (order.holdStartTick != null && !order.holdReleased) { e.preventDefault(); triggerKeyUp?.(step.key); } }}
            >
              {order.holdStartTick != null && !order.holdReleased ? "🔒 Holding — release when green" : "👇 Press & hold"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (step.type === "memorize") {
    const showSequence = order.memorizeRevealed;
    const waiting = !showSequence && order.memorizeInputDelay > 0;
    const inputReady = !showSequence && order.memorizeInputDelay <= 0;
    // Collect unique keys from the sequence for touch input pad
    const uniqueKeys = Array.from(new Set(order.memorizeSequence.map((k) => k.toLowerCase())));
    return (
      <div className="restaurant-step-card memorize-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">
          {showSequence
            ? `Memorize the sequence! ${(order.memorizeRevealTimer / 20).toFixed(1)}s remaining.`
            : waiting
              ? `Sequence hidden. Get ready... ${(order.memorizeInputDelay / 20).toFixed(1)}s`
              : order.memorizeInputIndex === 0 && order.memorizeSequence.length > 0
                ? (isTouch ? "Now tap the sequence from memory!" : "Now type the sequence from memory!")
                : (isTouch ? "Repeat the hidden sequence. One wrong tap makes the order incorrect." : "Repeat the hidden sequence from memory. One wrong key makes the order incorrect.")}
        </div>
        <div className={`memorize-sequence ${showSequence ? "revealed" : "hidden"}`}>
          {order.memorizeSequence.map((key, index) => {
            const entered = index < order.memorizeInputIndex;
            return (
              <div key={`${key}-${index}`} className={`memorize-card-key ${entered ? "entered" : ""}`}>
                {showSequence ? key.toUpperCase() : entered ? key.toUpperCase() : "?"}
              </div>
            );
          })}
        </div>
        <div className="cook-meta">
          <span>{showSequence ? "Remember it!" : waiting ? "⏳ Wait..." : inputReady ? `${order.memorizeInputIndex}/${step.sequenceLength} keys entered` : ""}</span>
          <span>{!order.orderCorrect ? "⚠️ No tip" : "Stay sharp"}</span>
        </div>
        {isTouch && inputReady && (
          <div className="touch-controls memorize-pad">
            {uniqueKeys.map((k) => (
              <button key={k} type="button" className="touch-btn keypad" onClick={() => triggerKey(k)}>{k.toUpperCase()}</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const assembleStep = step as Extract<OrderStep, { type: "assemble" }>;

  return (
    <div className="restaurant-step-card">
      <div className="restaurant-step-title">{assembleStep.label}</div>
      <div className="restaurant-step-copy">
        {isTouch ? "Tap an ingredient to add, or Skip to skip." : "Press the key to add, or Space to skip."}
        {!order.orderCorrect && <span className="order-incorrect-badge"> ⚠️ Wrong ingredient!</span>}
      </div>
      <div className="ingredient-sequence">
        {assembleStep.ingredients.map((ingredient, index) => {
          const done = index < order.assembleIndex;
          const current = index === order.assembleIndex;
          const clickable = isTouch && index >= order.assembleIndex;
          return (
            <div
              key={`${ingredient.name}-${index}`}
              className={`ingredient-chip ${done ? "done" : ""} ${current ? "current" : ""} ${clickable ? "touch-tappable" : ""}`}
              onClick={clickable ? () => triggerKey(ingredient.key) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
            >
              <span className="keycap">{ingredient.key.toUpperCase()}</span>
              <span>{ingredient.name}</span>
            </div>
          );
        })}
      </div>
      {isTouch && (
        <div className="touch-controls">
          <button type="button" className="touch-btn" onClick={() => triggerKey(" ")}>⏭️ Skip</button>
        </div>
      )}
    </div>
  );
}

const CHORE_NAMES: Record<string, string> = {
  wash_dishes: "🍽️ Wash the Dishes",
  take_out_trash: "🗑️ Take Out the Trash",
  mop_floor: "🧹 Mop the Floor",
  stack_plates: "🥞 Stack the Plates",
  break_down_recycling: "♻️ Break Down Recycling",
};

function renderChoreInstruction(chore: ActiveChore, isTouch: boolean, triggerKey: (key: string) => void) {
  switch (chore.type) {
    case "wash_dishes":
      return (
        <div className="restaurant-step-card chore-card">
          <div className="restaurant-step-title">{CHORE_NAMES[chore.type]}</div>
          <div className="restaurant-step-copy">{isTouch ? "Scrub the spots off the plate! Drag your finger over the dirty spots." : "Scrub the spots off the plate! Move your mouse over the dirty spots."}</div>
          <div className="chore-interactive chore-dish">
            <div className="dish-plate">
              {chore.dishSpots.map((spot, i) => (
                <div key={i} className={`dish-spot ${spot.scrubbed ? "clean" : ""}`} style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }} />
              ))}
            </div>
          </div>
          <div className="cook-meta">
            <span>{chore.dishSpots.filter((s) => s.scrubbed).length}/{chore.dishSpots.length} spots cleaned</span>
            <span>⏱️ {chore.timer.toFixed(1)}s</span>
          </div>
        </div>
      );

    case "take_out_trash":
      return (
        <div className="restaurant-step-card chore-card">
          <div className="restaurant-step-title">{CHORE_NAMES[chore.type]}</div>
          <div className="restaurant-step-copy">{isTouch ? "Tap the trash bags to take them out!" : "Click the trash bags to take them out!"}</div>
          <div className="chore-interactive chore-trash">
            {chore.trashBags.map((bag, i) => (
              <div key={i} className={`trash-bag ${bag.removed ? "removed" : ""}`} style={{ left: `${bag.x * 100}%`, top: `${bag.y * 100}%` }} />
            ))}
          </div>
          <div className="cook-meta">
            <span>{chore.trashBags.filter((b) => b.removed).length}/{chore.trashBags.length} bags removed</span>
            <span>⏱️ {chore.timer.toFixed(1)}s</span>
          </div>
        </div>
      );

    case "mop_floor": {
      const phaseLabel = chore.mopPhase === "dunk"
        ? (isTouch ? "Tap ↓ Dunk to dip the mop" : "Press ↓ to dunk the mop")
        : chore.mopPhase === "squeeze"
          ? (isTouch ? `Tap ⎵ Squeeze (${chore.mopSqueezeCount}/3)` : `Press Space to squeeze (${chore.mopSqueezeCount}/3)`)
          : (isTouch ? `Tap ← → alternately to mop (${chore.mopSwipeCount}/6)` : `Alternate ← → to mop (${chore.mopSwipeCount}/6)`);
      return (
        <div className="restaurant-step-card chore-card">
          <div className="restaurant-step-title">{CHORE_NAMES[chore.type]}</div>
          <div className="restaurant-step-copy">{phaseLabel}</div>
          <div className="chore-interactive chore-mop">
            <div className={`mop-bucket ${chore.mopPhase === "dunk" ? "active" : ""}`}>🪣</div>
            <div className={`mop-handle ${chore.mopPhase === "mop" ? "mopping" : ""}`}>🧹</div>
            <div className="mop-phase-indicators">
              <span className={chore.mopPhase === "dunk" ? "active" : ""}>↓ Dunk</span>
              <span className={chore.mopPhase === "squeeze" ? "active" : ""}>⎵ Squeeze</span>
              <span className={chore.mopPhase === "mop" ? "active" : ""}>←→ Mop</span>
            </div>
          </div>
          <div className="cook-meta">
            <span>Cycle {chore.mopCycles}/{chore.mopCyclesNeeded}</span>
            <span>⏱️ {chore.timer.toFixed(1)}s</span>
          </div>
          {isTouch && (
            <div className="touch-controls chore-touch">
              {chore.mopPhase === "dunk" && <button type="button" className="touch-btn big primary" onClick={() => triggerKey("ArrowDown")}>⬇️ Dunk</button>}
              {chore.mopPhase === "squeeze" && <button type="button" className="touch-btn big primary" onClick={() => triggerKey(" ")}>⎵ Squeeze</button>}
              {chore.mopPhase === "mop" && (
                <>
                  <button type="button" className="touch-btn big" onClick={() => triggerKey("ArrowLeft")}>⬅️ Left</button>
                  <button type="button" className="touch-btn big" onClick={() => triggerKey("ArrowRight")}>Right ➡️</button>
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    case "stack_plates":
      return (
        <div className="restaurant-step-card chore-card">
          <div className="restaurant-step-title">{CHORE_NAMES[chore.type]}</div>
          <div className="restaurant-step-copy">{isTouch ? "Tap Stack when the plate is aligned!" : "Press Space to stack the plate when it's aligned!"} {chore.plateMissed && "❌ Missed! Try again."}</div>
          <div className="chore-interactive chore-plates">
            <div className="plate-track">
              <div className="plate-target" style={{ left: `${chore.lastPlatePosition * 100}%` }} />
              <div className={`plate-moving ${chore.plateMissed ? "missed" : ""}`} style={{ left: `${chore.platePosition * 100}%` }} />
            </div>
            <div className="plate-stack-count">
              {Array.from({ length: chore.platesNeeded }, (_, i) => (
                <span key={i} className={`plate-icon ${i < chore.platesStacked ? "stacked" : ""}`}>🍽️</span>
              ))}
            </div>
          </div>
          <div className="cook-meta">
            <span>{chore.platesStacked}/{chore.platesNeeded} plates stacked</span>
            <span>⏱️ {chore.timer.toFixed(1)}s</span>
          </div>
          {isTouch && (
            <div className="touch-controls chore-touch">
              <button type="button" className="touch-btn big primary" onClick={() => triggerKey(" ")}>🥞 Stack!</button>
            </div>
          )}
        </div>
      );

    case "break_down_recycling": {
      const phaseLabel = chore.recyclePhase === "click"
        ? (isTouch ? `Tap the box to dismantle (${chore.recycleClicks}/${chore.recycleClicksNeeded})` : `Click to dismantle boxes (${chore.recycleClicks}/${chore.recycleClicksNeeded})`)
        : (isTouch ? `Tap arrow buttons to flatten (${chore.recycleArrows}/${chore.recycleArrowsNeeded})` : `Press arrow keys to flatten (${chore.recycleArrows}/${chore.recycleArrowsNeeded})`);
      return (
        <div className="restaurant-step-card chore-card">
          <div className="restaurant-step-title">{CHORE_NAMES[chore.type]}</div>
          <div className="restaurant-step-copy">{phaseLabel}</div>
          <div className="chore-interactive chore-recycle">
            <div className={`recycle-box ${chore.recyclePhase}`}>
              {chore.recyclePhase === "click" ? "📦" : "📦→📄"}
            </div>
            <div className="recycle-phase-indicators">
              <span className={chore.recyclePhase === "click" ? "active" : ""}>🖱️ Click</span>
              <span className={chore.recyclePhase === "arrows" ? "active" : ""}>⬆⬇⬅➡ Flatten</span>
            </div>
          </div>
          <div className="cook-meta">
            <span>Cycle {chore.recycleCycles}/{chore.recycleCyclesNeeded}</span>
            <span>⏱️ {chore.timer.toFixed(1)}s</span>
          </div>
          {isTouch && chore.recyclePhase === "arrows" && (
            <div className="touch-controls chore-arrows">
              <button type="button" className="touch-btn" onClick={() => triggerKey("ArrowUp")}>⬆️</button>
              <div className="chore-arrows-row">
                <button type="button" className="touch-btn" onClick={() => triggerKey("ArrowLeft")}>⬅️</button>
                <button type="button" className="touch-btn" onClick={() => triggerKey("ArrowDown")}>⬇️</button>
                <button type="button" className="touch-btn" onClick={() => triggerKey("ArrowRight")}>➡️</button>
              </div>
            </div>
          )}
        </div>
      );
    }
  }
}

export function Restaurant({ day, paused, state: rawState, setRestaurantState, onFinish, milestoneTarget, milestoneDaysLeft, netWorth, speed, onSpeedChange, acquiredRestaurantUpgrades, debugFF, onDebugFF, isBossDay, activeChallenges, tradingTickets, restaurantTickets, isPeer, onPeerKey, onPeerKeyUp, onPeerMouse, onPeerChoreClick, currentCounter = 0, onSwitchCounter, localActiveOrderId, consumableInventory, onUseRestaurantItem, localPlayerId = "player", localPlayerName = "You", players, hideShiftSummary, onSchmoozeSuccess }: RestaurantProps) {
  // Backward compat: default counter fields
  const state = useMemo(() => ({
    ...rawState,
    numCounters: rawState.numCounters ?? 1,
    slotsPerCounter: rawState.slotsPerCounter ?? rawState.orderSlots.length,
    playerFocus: rawState.playerFocus ?? {},
  }), [rawState]);

  // Determine which activeOrderId to use for rendering
  const effectiveActiveOrderId = localActiveOrderId !== undefined ? localActiveOrderId : state.activeOrderId;

  const activeOrder = useMemo(
    () => state.orderSlots.find((slot) => slot?.id === effectiveActiveOrderId) ?? null,
    [effectiveActiveOrderId, state.orderSlots],
  );

  // Get slots for the current counter view
  const counterStart = currentCounter * state.slotsPerCounter;
  const counterSlots = state.orderSlots.slice(counterStart, counterStart + state.slotsPerCounter);

  // Cross-counter orders (orders on other counters)
  const crossCounterOrders = useMemo(() => {
    if (state.numCounters <= 1) return [];
    const others: { counterIndex: number; slotIndex: number; order: ActiveOrder; patienceRatio: number }[] = [];
    for (let c = 0; c < state.numCounters; c++) {
      if (c === currentCounter) continue;
      const start = c * state.slotsPerCounter;
      for (let s = 0; s < state.slotsPerCounter; s++) {
        const order = state.orderSlots[start + s];
        if (order && !order.failed && !order.served) {
          others.push({ counterIndex: c, slotIndex: s, order, patienceRatio: order.patienceRemaining / order.menuItem.patience });
        }
      }
    }
    return others;
  }, [state.orderSlots, state.numCounters, state.slotsPerCounter, currentCounter]);

  // Compute active buff IDs for restaurant engine
  const activeBuffIds = useMemo(() => 
    consumableInventory?.activeBuffs.map((b) => b.consumableId) ?? [],
    [consumableInventory?.activeBuffs]
  );

  const tipMultiplier = activeBuffIds.includes("live_band") ? 1.5 : 1;

  // Refs for values used in keydown/keyup/mouse handlers to avoid stale closures
  const isPeerRef = useRef(isPeer);
  isPeerRef.current = isPeer;
  const onPeerKeyRef = useRef(onPeerKey);
  onPeerKeyRef.current = onPeerKey;
  const onPeerKeyUpRef = useRef(onPeerKeyUp);
  onPeerKeyUpRef.current = onPeerKeyUp;
  const onPeerMouseRef = useRef(onPeerMouse);
  onPeerMouseRef.current = onPeerMouse;
  const onPeerChoreClickRef = useRef(onPeerChoreClick);
  onPeerChoreClickRef.current = onPeerChoreClick;
  const onSwitchCounterRef = useRef(onSwitchCounter);
  onSwitchCounterRef.current = onSwitchCounter;
  const currentCounterRef = useRef(currentCounter);
  currentCounterRef.current = currentCounter;
  const tipMultiplierRef = useRef(tipMultiplier);
  tipMultiplierRef.current = tipMultiplier;
  const localPlayerIdRef = useRef(localPlayerId);
  localPlayerIdRef.current = localPlayerId;
  const choreContainerRef = useRef<HTMLDivElement>(null);

  // Detect touch device for showing tap-friendly controls
  const isTouch = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  }, []);

  // Dispatch a synthetic keyboard event so touch buttons flow through the same
  // handlers as physical keys (including peer forwarding, chore focus, etc.)
  const triggerKey = useCallback((key: string) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }, []);
  const triggerKeyDown = useCallback((key: string) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }, []);
  const triggerKeyUp = useCallback((key: string) => {
    window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  }, []);

  useEffect(() => {
    if (isPeer || paused || state.shiftOver) return; // Peers don't tick — they receive state from host
    const interval = window.setInterval(() => {
      setRestaurantState((prev) => (prev ? restaurantTick(prev, (TICK_MS / 1000) * speed, activeBuffIds) : prev));
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [isPeer, paused, setRestaurantState, state.shiftOver, speed, activeBuffIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (paused || state.shiftOver) return;

      const activeElement = document.activeElement;
      const tag = activeElement?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      // Shift+Number: switch counter
      if (event.shiftKey && state.numCounters > 1) {
        // event.key gives symbols when shift is held (e.g. '!'), use event.code instead
        const codeMatch = event.code.match(/^Digit(\d)$/);
        if (codeMatch) {
          const counterNum = Number.parseInt(codeMatch[1], 10);
          if (counterNum >= 1 && counterNum <= state.numCounters) {
            event.preventDefault();
            onSwitchCounterRef.current?.(counterNum - 1);
            return;
          }
        }
      }

      // Peers forward key presses to host
      if (isPeerRef.current && onPeerKeyRef.current) {
        event.preventDefault();
        onPeerKeyRef.current(event.key);
        return;
      }

      // Handle chore interactions (only when chore is focused)
      setRestaurantState((prev) => {
        if (!prev?.activeChore || prev.activeChore.completed || !prev.choreFocused) return prev;
        const updated = handleChoreKeyPress(prev.activeChore, event.key);
        if (updated === prev.activeChore) return prev;
        event.preventDefault();
        return { ...prev, activeChore: updated, servingBlocked: updated.timerExpired && !updated.completed };
      });

      const slotNumber = Number.parseInt(event.key, 10);
      if (!Number.isNaN(slotNumber) && slotNumber >= 1 && slotNumber <= state.slotsPerCounter) {
        event.preventDefault();
        // Map local slot to global index based on current counter
        const globalIndex = currentCounterRef.current * state.slotsPerCounter + (slotNumber - 1);
        setRestaurantState((prev) => {
          if (!prev) return prev;
          // acceptOrder handles chore slot focus too
          const next = acceptOrder(prev, globalIndex);
          if (next.choreFocused) return next;
          const order = prev.orderSlots[globalIndex];
          if (!order) return prev;
          // Schmoozing orders just get selected
          if (order.schmoozing) return { ...prev, activeOrderId: order.id, choreFocused: false };
          if (order.completed) return serveOrder(prev, globalIndex, tipMultiplierRef.current, localPlayerIdRef.current);
          return next.activeOrderId != null ? recordOrderContributor(next, next.activeOrderId, localPlayerIdRef.current) : next;
        });
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setRestaurantState((prev) => {
          if (!prev) return prev;
          const next = handleChopKey(prev, event.key === "ArrowLeft" ? "left" : "right");
          return prev.activeOrderId != null ? recordOrderContributor(next, prev.activeOrderId, localPlayerIdRef.current) : next;
        });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        setRestaurantState((prev) => {
          if (!prev) return prev;
          const activeSlotIndex = prev.orderSlots.findIndex((slot) => slot?.id === prev.activeOrderId);
          const currentOrder = activeSlotIndex >= 0 ? prev.orderSlots[activeSlotIndex] : null;
          if (currentOrder?.completed) return serveOrder(prev, activeSlotIndex, tipMultiplierRef.current, localPlayerIdRef.current);
          const next = handleKeyPress(prev, event.key);
          return prev.activeOrderId != null ? recordOrderContributor(next, prev.activeOrderId, localPlayerIdRef.current) : next;
        });
        return;
      }

      if (/^[a-zA-Z]$/.test(event.key) || event.key === " ") {
        event.preventDefault();
        setRestaurantState((prev) => {
          if (!prev) return prev;
          const next = handleKeyPress(prev, event.key);
          return prev.activeOrderId != null ? recordOrderContributor(next, prev.activeOrderId, localPlayerIdRef.current) : next;
        });
      }
    };

    const handleGlobalKeyUp = (event: KeyboardEvent) => {
      if (paused || state.shiftOver) return;
      if (isPeerRef.current && onPeerKeyUpRef.current) {
        onPeerKeyUpRef.current(event.key);
        return;
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        setRestaurantState((prev) => (prev ? handleKeyUp(prev, event.key) : prev));
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (paused || state.shiftOver) return;
      if (isPeerRef.current && onPeerMouseRef.current) {
        // For dish scrubbing, send normalized coords via chore click action
        if (state.choreFocused && state.activeChore && !state.activeChore.completed && state.activeChore.type === "wash_dishes" && onPeerChoreClickRef.current) {
          const container = choreContainerRef.current?.querySelector(".chore-interactive");
          if (container) {
            const rect = container.getBoundingClientRect();
            const nx = (event.clientX - rect.left) / rect.width;
            const ny = (event.clientY - rect.top) / rect.height;
            onPeerChoreClickRef.current(nx, ny);
          }
        }
        onPeerMouseRef.current(event.clientX, event.clientY);
        return;
      }
      setRestaurantState((prev) => {
        if (!prev) return prev;
        // Handle dish scrubbing chore (only when focused)
        if (prev.choreFocused && prev.activeChore && !prev.activeChore.completed && prev.activeChore.type === "wash_dishes") {
          const container = choreContainerRef.current?.querySelector(".chore-interactive");
          if (container) {
            const rect = container.getBoundingClientRect();
            const updated = handleChoreMouseMove(prev.activeChore, event.clientX, event.clientY, rect as DOMRect);
            if (updated !== prev.activeChore) {
              return { ...prev, activeChore: updated };
            }
          }
        }
        return handleRestaurantMouseMove(prev, event.clientX, event.clientY);
      });
    };

    const handleClick = (event: MouseEvent) => {
      if (paused || state.shiftOver) return;
      // Peers send chore clicks to host with normalized coordinates
      if (isPeerRef.current && onPeerChoreClickRef.current) {
        const container = choreContainerRef.current?.querySelector(".chore-interactive");
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = (event.clientY - rect.top) / rect.height;
        onPeerChoreClickRef.current(nx, ny);
        return;
      }
      setRestaurantState((prev) => {
        if (!prev?.activeChore || prev.activeChore.completed || !prev.choreFocused) return prev;
        const container = choreContainerRef.current?.querySelector(".chore-interactive");
        if (!container) return prev;
        const rect = container.getBoundingClientRect();
        const updated = handleChoreClick(prev.activeChore, event.clientX, event.clientY, rect as DOMRect);
        if (updated === prev.activeChore) return prev;
        return { ...prev, activeChore: updated };
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);

    // Touch device support: forward touch events as mouse events so the mix,
    // wash_dishes, and take_out_trash mini-games work on phones/tablets.
    const handleTouchMove = (event: TouchEvent) => {
      if (paused || state.shiftOver) return;
      const touch = event.touches[0];
      if (!touch) return;
      // Synthesize a MouseEvent-like object so the mousemove handler picks it up.
      handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (paused || state.shiftOver) return;
      const touch = event.touches[0];
      if (!touch) return;
      // Only trigger chore click logic (trash bags etc.); regular UI buttons
      // handle their own onClick so we don't want to double-fire those.
      if (!state.choreFocused || !state.activeChore || state.activeChore.completed) return;
      // Skip if the touch landed on an actual button/interactive control.
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, [role='button'], input, select, textarea, .touch-btn")) return;
      handleClick({ clientX: touch.clientX, clientY: touch.clientY, target } as unknown as MouseEvent);
    };
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchstart", handleTouchStart);
    };
  }, [paused, setRestaurantState, state.orderSlots.length, state.shiftOver, state.numCounters, state.slotsPerCounter, state.choreFocused, state.activeChore]);

  return (
    <div className="restaurant-screen">
      <header className="restaurant-header">
        <div>
          <h1>🍔 SHWENDY'S</h1>
          <p>Day {day} — Shwendy's Shift</p>
          {acquiredRestaurantUpgrades.length > 0 && (
            <div className="upgrade-icons">
              {[...new Set(acquiredRestaurantUpgrades)].map((id) => {
                const card = RESTAURANT_UPGRADE_POOL.find((u) => u.id === id);
                if (!card) return null;
                const count = acquiredRestaurantUpgrades.filter((u) => u === id).length;
                return (
                  <span key={id} className="upgrade-icon" data-tooltip={`${card.name}${count > 1 ? ` x${count}` : ""}: ${card.description}`}>
                    {card.icon}
                  </span>
                );
              })}
            </div>
          )}
          {activeChallenges && activeChallenges.length > 0 && (
            <div className="challenge-indicators">
              {activeChallenges.map((ch) => {
                const def = ALL_CHALLENGES.find((d) => d.id === ch.id);
                if (!def) return null;
                return (
                  <span key={ch.id} className={`challenge-pip ${ch.completed ? "done" : ""}`} data-tooltip={`${def.name}: ${def.description} (${def.tickets}${def.type === "trading" ? "🍔" : "📈"})`}>
                    {def.icon}
                  </span>
                );
              })}
              <span className="ticket-count">📈{tradingTickets ?? 0} 🍔{restaurantTickets ?? 0}</span>
            </div>
          )}
        </div>
        <div className="restaurant-header-stats">
          {milestoneTarget != null && (
            <div className="restaurant-stat-box milestone-stat">
              <span>Target (in {milestoneDaysLeft}d)</span>
              <strong>${milestoneTarget.toLocaleString()}</strong>
            </div>
          )}
          <div className="restaurant-stat-box">
            <span>Net Worth</span>
            <strong>${netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
          <div className="restaurant-stat-box">
            <span>Shift</span>
            <strong>{formatTime(state.shiftTimeRemaining)}</strong>
          </div>
          <div className="restaurant-stat-box">
            <span>Earnings</span>
            <strong>${state.totalEarnings.toFixed(2)}</strong>
          </div>
          {!isBossDay && (
            <div className="speed-controls">
              <button className={speed === 1 ? "active" : ""} onClick={() => onSpeedChange(1)}>1x</button>
              <button className={speed === 2 ? "active" : ""} onClick={() => onSpeedChange(2)}>2x</button>
              <button className={speed === 5 ? "active" : ""} onClick={() => onSpeedChange(5)}>5x</button>
              <button className={speed === 10 ? "active" : ""} onClick={() => onSpeedChange(10)}>10x</button>
              {debugFF && onDebugFF && <button className="debug-ff-btn" onClick={onDebugFF}>⏭</button>}
            </div>
          )}
        </div>
      </header>

      {/* Restaurant consumable items bar */}
      {consumableInventory && (() => {
        const restaurantItems = getPhaseItems(consumableInventory, "restaurant");
        if (restaurantItems.length === 0) return null;
        const grouped = [...new Set(restaurantItems)].map((id) => ({
          id,
          item: getConsumable(id)!,
          count: restaurantItems.filter((i) => i === id).length,
        }));
        return (
          <div className="restaurant-items-bar">
            <span className="items-bar-label">🎒 Items:</span>
            {grouped.map(({ id, item, count }) => (
              <button key={id} className="restaurant-item-btn" onClick={() => onUseRestaurantItem?.(id)} title={item.description}>
                <span>{item.icon}</span>
                <span className="restaurant-item-name">{item.name}{count > 1 ? ` x${count}` : ""}</span>
              </button>
            ))}
          </div>
        );
      })()}

      <section className="restaurant-queue">
        {state.numCounters > 1 && (
          <div className="counter-tabs">
            {Array.from({ length: state.numCounters }, (_, c) => (
              <button
                key={c}
                className={`counter-tab ${c === currentCounter ? "active" : ""}`}
                onClick={() => onSwitchCounter?.(c)}
              >
                Counter {c + 1}
              </button>
            ))}
          </div>
        )}
        {counterSlots.map((order, localIndex) => {
          const globalIndex = counterStart + localIndex;

          // Chore slot rendering
          if (globalIndex === state.choreSlotIndex && state.activeChore && !state.activeChore.completed) {
            const chore = state.activeChore;
            const timerPct = Math.max(0, Math.min(100, (chore.timer / 30) * 100));
            return (
              <button
                key={`slot-${globalIndex}`}
                type="button"
                className={`order-slot chore-slot ${state.choreFocused ? "active" : ""} ${chore.timerExpired ? "chore-expired" : ""}`}
                onClick={() =>
                  isPeer && onPeerKey
                    ? onPeerKey(String(localIndex + 1))
                    : setRestaurantState((prev) => {
                        if (!prev) return prev;
                        return { ...prev, choreFocused: true, activeOrderId: null };
                      })
                }
              >
                <div className="slot-number">{localIndex + 1}</div>
                <div className="slot-main">
                  <div className="slot-title-row">
                    <span className="slot-item">🧹 {CHORE_NAMES[chore.type]}</span>
                    {chore.timerExpired && <span className="slot-ready chore-overdue">⚠️ OVERDUE</span>}
                  </div>
                  <div className="slot-step">
                    {chore.type === "wash_dishes" && `Scrub spots (${chore.dishSpots.filter((s) => s.scrubbed).length}/${chore.dishSpots.length})`}
                    {chore.type === "take_out_trash" && `Remove bags (${chore.trashBags.filter((b) => b.removed).length}/${chore.trashBags.length})`}
                    {chore.type === "mop_floor" && `Mop cycle ${chore.mopCycles}/${chore.mopCyclesNeeded}`}
                    {chore.type === "stack_plates" && `Stack ${chore.platesStacked}/${chore.platesNeeded}`}
                    {chore.type === "break_down_recycling" && `Recycle cycle ${chore.recycleCycles}/${chore.recycleCyclesNeeded}`}
                  </div>
                  {!chore.timerExpired && (
                    <div className="patience-bar chore-timer-bar">
                      <div className="patience-fill" style={{ width: `${timerPct}%` }} />
                    </div>
                  )}
                </div>
              </button>
            );
          }

          if (!order) {
            return (
              <div key={`slot-${globalIndex}`} className="order-slot empty">
                <div className="slot-number">{localIndex + 1}</div>
                <div className="slot-empty-copy">Waiting for next customer…</div>
              </div>
            );
          }

          const patiencePct = order.schmoozing
            ? Math.max(0, Math.min(100, (order.schmoozing.timer / order.schmoozing.timerMax) * 100))
            : Math.max(0, Math.min(100, (order.patienceRemaining / order.menuItem.patience) * 100));
          const currentStep = getCurrentStep(order);
          const miniProgress = getSlotMiniProgress(order);
          // Check if other players are focused on this order
          const focusedByOthers = Object.entries(state.playerFocus || {}).filter(([, orderId]) => orderId === order.id);
          return (
            <button
              key={`slot-${globalIndex}`}
              type="button"
              className={`order-slot ${effectiveActiveOrderId === order.id ? "active" : ""} ${order.completed && !order.schmoozing ? "done" : ""} ${order.failed ? "failed" : ""} ${order.burnt ? "burnt" : ""} ${!order.orderCorrect ? "incorrect" : ""} ${order.isInsider ? "insider" : ""} ${order.schmoozing ? "schmoozing" : ""}`}
              onClick={() =>
                isPeer && onPeerKey
                  ? onPeerKey(String(localIndex + 1))
                  : setRestaurantState((prev) => {
                      if (!prev) return prev;
                      const currentOrder = prev.orderSlots[globalIndex];
                      if (!currentOrder) return prev;
                      // Schmoozing orders just get selected (focused)
                      if (currentOrder.schmoozing) return { ...prev, activeOrderId: currentOrder.id, choreFocused: false };
                      if (currentOrder.completed) return serveOrder(prev, globalIndex, tipMultiplier, localPlayerId);
                      const next = acceptOrder(prev, globalIndex);
                      return next.activeOrderId != null ? recordOrderContributor(next, next.activeOrderId, localPlayerId) : next;
                    })
              }
            >
              <div className="slot-number">{localIndex + 1}</div>
              {focusedByOthers.length > 0 && <div className="slot-player-focus">👤</div>}
              <div className="slot-main">
                <div className="slot-title-row">
                  <span className="slot-item">{order.menuItem.icon} {order.menuItem.name}</span>
                  {order.completed && !order.orderCorrect && <span className="slot-ready incorrect">NO TIP</span>}
                  {order.completed && order.orderCorrect && <span className="slot-ready">DONE!</span>}
                  {order.burnt && <span className="slot-ready burnt">🔥 BURNT</span>}
                  {order.failed && !order.burnt && <span className="slot-ready failed">LEFT</span>}
                </div>
                {(() => {
                  const removedItems: string[] = [];
                  order.menuItem.steps.forEach((orderStep, stepIndex) => {
                    if (orderStep.type !== "assemble") return;
                    const wanted = order.customizations[stepIndex];
                    if (!wanted) return;
                    orderStep.ingredients.forEach((ingredient, ingredientIndex) => {
                      if (!wanted[ingredientIndex]) removedItems.push(ingredient.name);
                    });
                  });
                  return removedItems.length > 0 ? (
                    <div className="slot-customization">No {removedItems.join(", No ")}</div>
                  ) : null;
                })()}
                <div className="slot-step">{currentStep ? getStepStatus(order) : "Serve it up"}</div>
                {miniProgress && (
                  <div className={`slot-mini-meter ${miniProgress.type} ${miniProgress.burnZone ? "burn-zone" : ""}`}>
                    <div className="slot-mini-fill" style={{ width: `${Math.min(100, miniProgress.pct)}%` }} />
                    {(miniProgress.type === "grill" || miniProgress.type === "fry") && currentStep && 'flipAt' in currentStep && currentStep.flipAt != null && !order.flipped && <div className="slot-mini-danger" />}
                  </div>
                )}
                {!order.failed && (
                  <div className="patience-bar">
                    <div className="patience-fill" style={{ width: `${patiencePct}%` }} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
        {/* Cross-counter order indicators */}
        {crossCounterOrders.length > 0 && (
          <div className="cross-counter-indicators">
            {crossCounterOrders.map(({ counterIndex, slotIndex, order, patienceRatio }) => (
              <div
                key={`cc-${counterIndex}-${slotIndex}`}
                className={`cross-counter-pip ${patienceRatio < 0.3 ? "urgent" : ""}`}
                onClick={() => onSwitchCounter?.(counterIndex)}
                title={`Counter ${counterIndex + 1}: ${order.menuItem.name} (${Math.round(patienceRatio * 100)}%)`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="#555" strokeWidth="2" />
                  <circle
                    cx="12" cy="12" r="10" fill="none"
                    stroke={patienceRatio < 0.3 ? "#f44" : patienceRatio < 0.6 ? "#fa0" : "#4f4"}
                    strokeWidth="2"
                    strokeDasharray={`${patienceRatio * 62.8} 62.8`}
                    transform="rotate(-90 12 12)"
                  />
                  <text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">{counterIndex + 1}</text>
                </svg>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Chore alert banner - only show when timer expired and not focused */}
      {state.activeChore && !state.activeChore.completed && state.servingBlocked && !state.choreFocused && (
        <div className="chore-banner blocked">
          <span className="chore-banner-icon">🧹</span>
          <span className="chore-banner-text">
            ⚠️ CHORE OVERDUE — Orders can't be served! Select the chore (slot {state.choreSlotIndex - counterStart + 1}) to complete it!
          </span>
        </div>
      )}

      <section className="restaurant-work-area">
        {/* Show chore instructions when chore is focused */}
        {state.choreFocused && state.activeChore && !state.activeChore.completed ? (
          <div className="chore-work-area" ref={choreContainerRef}>
            {renderChoreInstruction(state.activeChore, isTouch, triggerKey)}
          </div>
        ) : activeOrder ? (
          <>
            <div className="ticket-panel">
              <div className="ticket-header">
                <h2>{activeOrder.menuItem.icon} {activeOrder.menuItem.name}</h2>
                <span>{activeOrder.schmoozing ? "Schmoozing..." : "Customer patience:"} {activeOrder.patienceRemaining.toFixed(1)}s</span>
              </div>
              {activeOrder.schmoozing ? (
                <div className="ticket-steps">
                  <div className="ticket-step complete"><span>✅</span><span>Order served</span></div>
                  {activeOrder.schmoozing.rounds.map((_, i) => {
                    const done = i < activeOrder.schmoozing!.currentRound;
                    const current = i === activeOrder.schmoozing!.currentRound;
                    return (
                      <div key={i} className={`ticket-step ${done ? "complete" : ""} ${current ? "current" : ""}`}>
                        <span>{done ? "✅" : current ? "👉" : "•"}</span>
                        <span>Schmooze round {i + 1}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ticket-steps">
                  {activeOrder.menuItem.steps.map((step, index) => {
                    const complete = index < activeOrder.currentStepIndex || activeOrder.completed;
                    const current = index === activeOrder.currentStepIndex && !activeOrder.completed;
                    return (
                      <div key={`${step.label}-${index}`} className={`ticket-step ${complete ? "complete" : ""} ${current ? "current" : ""}`}>
                        <span>{complete ? "✅" : current ? "👉" : "•"}</span>
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="station-panel">
              {activeOrder.schmoozing ? (
                activeOrder.schmoozing.resultMessage ? (
                <div className="schmooze-inline">
                  <div className="schmooze-inline-header">
                    <span className="schmooze-inline-icon">{activeOrder.schmoozing.success ? "🤫" : "😤"}</span>
                    <span>{activeOrder.schmoozing.resultMessage}</span>
                  </div>
                  {activeOrder.schmoozing.resultTimer != null && (
                    <div className="schmooze-round-label">{(activeOrder.schmoozing.resultTimer / 20).toFixed(1)}s</div>
                  )}
                </div>
                ) : (
                <div className="schmooze-inline">
                  <div className="schmooze-inline-header">
                    <span className="schmooze-inline-icon">🕴️</span>
                    <span>Schmooze the insider! Pick the compliment.</span>
                  </div>
                  <div className="schmooze-round-label">Round {activeOrder.schmoozing.currentRound + 1} of {activeOrder.schmoozing.rounds.length}</div>
                  <div className="schmooze-options">
                    {activeOrder.schmoozing.options.map((opt, i) => (
                      <button
                        key={i}
                        className="schmooze-option"
                        onClick={() => {
                          const slotIndex = state.orderSlots.findIndex((s) => s?.id === activeOrder.id);
                          if (slotIndex < 0) return;
                          setRestaurantState((prev) => {
                            if (!prev) return prev;
                            const result = selectSchmoozeOption(prev, slotIndex, i);
                            if (result.schmoozeSuccess && onSchmoozeSuccess) {
                              // Get the tip and update the result message with it
                              setTimeout(() => {
                                const tip = onSchmoozeSuccess();
                                setRestaurantState((rs) => {
                                  if (!rs) return rs;
                                  const order = rs.orderSlots[slotIndex];
                                  if (!order?.schmoozing?.resultMessage) return rs;
                                  const orderSlots = [...rs.orderSlots];
                                  orderSlots[slotIndex] = {
                                    ...order,
                                    schmoozing: { ...order.schmoozing, resultMessage: `🤫 "${tip.tipText}"` },
                                  };
                                  return { ...rs, orderSlots };
                                });
                              }, 0);
                            }
                            return result.state;
                          });
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
                )
              ) : activeOrder.failed ? (
                <div className="restaurant-step-card fail-card">
                  <div className="restaurant-step-title">{activeOrder.served ? "Insider left" : "Order failed"}</div>
                  <div className="restaurant-step-copy">{activeOrder.served ? "The insider ran out of patience before you could finish schmoozing." : "This customer bounced. Pick another ticket."}</div>
                </div>
              ) : activeOrder.completed ? (
                <div className="restaurant-step-card success-card">
                  <div className="restaurant-step-title">Order ready!</div>
                  <div className="restaurant-step-copy">
                    {state.servingBlocked
                      ? "⚠️ Complete the chore before serving!"
                      : `Press Enter, ${state.orderSlots.findIndex((slot) => slot?.id === activeOrder.id) + 1}, or click the ticket to serve.`}
                  </div>
                </div>
              ) : (
                renderStepInstruction(activeOrder, isTouch, triggerKey, triggerKeyDown, triggerKeyUp)
              )}
            </div>
          </>
        ) : (
          <div className="restaurant-empty-state">
            <h2>{state.shiftOver ? "Shift complete" : "Pick an order"}</h2>
            <p>{state.shiftOver ? "Great work! Let's see how you did." : `Hit 1-${state.slotsPerCounter} or click a ticket to start cooking.${state.numCounters > 1 ? ` Shift+1-${state.numCounters} to switch counters.` : ""}`}</p>
          </div>
        )}
      </section>

      <footer className="restaurant-footer">
        <div className="restaurant-summary-chip"><span>Completed</span><strong>{state.completedOrders}</strong></div>
        <div className="restaurant-summary-chip"><span>Total earnings</span><strong>${state.totalEarnings.toFixed(2)}</strong></div>
        <div className="restaurant-summary-chip"><span>Tips</span><strong>${state.totalTips.toFixed(2)}</strong></div>
      </footer>

      {state.shiftOver && !hideShiftSummary && (() => {
        // Build P&L series from order log
        const playerList = players && players.length > 0
          ? players
          : [{ id: localPlayerId, name: localPlayerName, color: "#ffbb66" }];

        const seriesMap: Record<string, PnLDataPoint[]> = {};
        const cumulative: Record<string, number> = {};
        for (const p of playerList) {
          seriesMap[p.id] = [{ time: 0, value: 0 }];
          cumulative[p.id] = 0;
        }

        for (const entry of state.orderLog) {
          const numContributors = entry.contributors.length || 1;
          const share = entry.payout / numContributors;
          for (const pid of entry.contributors) {
            if (cumulative[pid] === undefined) continue;
            cumulative[pid] += share;
            seriesMap[pid].push({
              time: entry.timestamp,
              value: cumulative[pid],
              entry: {
                timestamp: entry.timestamp,
                playerId: pid,
                playerName: playerList.find((p) => p.id === pid)?.name ?? "",
                action: "buy",
                symbol: "",
                shares: 1,
                price: entry.payout,
                realizedPnL: share,
                label: `${entry.orderIcon} ${entry.orderName} ($${entry.payout.toFixed(2)}${numContributors > 1 ? `, split ${numContributors} ways` : ""})`,
              },
            });
          }
        }

        // Add final point at shift end
        for (const p of playerList) {
          const series = seriesMap[p.id];
          if (series.length > 0 && series[series.length - 1].time < state.shiftDuration) {
            series.push({ time: state.shiftDuration, value: cumulative[p.id] });
          }
        }

        const restaurantSeries: PlayerPnLSeries[] = playerList.map((p) => ({
          playerId: p.id,
          playerName: p.name,
          playerColor: p.color,
          data: seriesMap[p.id] || [{ time: 0, value: 0 }],
        }));

        const hasData = restaurantSeries.some((s) => s.data.length > 1);

        return (
          <div className="restaurant-shift-over">
            <div className="restaurant-shift-card">
              <h2>🏁 Shift Over</h2>
              <div className="shift-over-stats">
                <div><span>Orders served</span><strong>{state.completedOrders}</strong></div>
                <div><span>Food sales + tips</span><strong>${state.totalEarnings.toFixed(2)}</strong></div>
                <div><span>Tips earned</span><strong>${state.totalTips.toFixed(2)}</strong></div>
              </div>
              {hasData && (
                <div className="eod-pnl-graph-section" style={{ margin: "12px 0" }}>
                  <h3 className="eod-graph-title">📊 Shift Earnings</h3>
                  <PnLGraph series={restaurantSeries} width={400} height={160} hideActionLegend />
                </div>
              )}
              <button type="button" onClick={() => onFinish(state.totalEarnings)}>Continue</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
