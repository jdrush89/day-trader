import { useEffect, useMemo, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import {
  acceptOrder,
  handleChopKey,
  handleKeyPress,
  handleKeyUp,
  handleMouseMove as handleRestaurantMouseMove,
  restaurantTick,
  serveOrder,
} from "../game/restaurant-engine";
import { ActiveOrder, OrderStep, RestaurantState, RhythmResult } from "../game/restaurant-types";
import { RESTAURANT_UPGRADE_POOL } from "../game/restaurant-upgrades";

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

function renderStepInstruction(order: ActiveOrder) {
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
          {!order.prepStarted && "Press G to start cooking."}
          {order.prepStarted && step.type === "grill" && !order.flipped && !flipReady && !pastFlipZone && !readyToPlate && "Watch the grill and flip on time."}
          {flipReady && "Press F now to flip!"}
          {order.burnt && "🔥 Burnt! This order is lost."}
          {inBurnZone && !order.burnt && `⚠️ Remove NOW! Press G or Enter. Burns in ${burnTimeLeft.toFixed(1)}s`}
          {readyToPlate && !inBurnZone && !order.burnt && "Done! Press G or Enter to remove."}
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
          {step.type === "grill" && <span>{order.flipped ? "✅ Flipped" : "Press F to flip"}</span>}
        </div>
      </div>
    );
  }

  if (step.type === "chop") {
    const progressPct = Math.min(100, (order.chopCount / step.target) * 100);
    return (
      <div className="restaurant-step-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">Alternate ← and → rapidly!</div>
        <div className="task-meter">
          <div className="task-meter-fill chop" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="cook-meta">
          <span>{order.chopCount}/{step.target} chops</span>
          <span>Last: {order.lastChopKey ? order.lastChopKey.toUpperCase() : "—"}</span>
        </div>
      </div>
    );
  }

  if (step.type === "mix") {
    const progressPct = Math.min(100, (order.mixProgress / step.target) * 100);
    return (
      <div className="restaurant-step-card mix-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">{step.label.toLowerCase().includes("toss") ? "Shake the mouse back and forth!" : "Swirl the mouse in circles!"}</div>
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
    return (
      <div className="restaurant-step-card rhythm-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">Hit each key when the beat reaches its target zone. Misses still move the sequence forward.</div>
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
          {order.holdStartTick == null ? `Hold ${step.key.toUpperCase()} to fill the meter, then release in the green zone.` : "Keep holding... release at the sweet spot!"}
        </div>
        <div className="hold-meter">
          <div className="hold-meter-zone" style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }} />
          <div className="hold-meter-fill" style={{ width: `${fillPct}%` }} />
        </div>
        <div className="hold-key-row">
          <span className={`keycap hold-key ${order.holdStartTick != null && !order.holdReleased ? "active" : ""}`}>{step.key.toUpperCase()}</span>
          <span className={`hold-status ${inZone ? "good" : ""}`}>{Math.round(fillPct)}%{inZone ? " — release!" : ""}</span>
        </div>
      </div>
    );
  }

  if (step.type === "memorize") {
    const showSequence = order.memorizeRevealed;
    return (
      <div className="restaurant-step-card memorize-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">
          {showSequence
            ? `Memorize the sequence before it flips away. ${(order.memorizeRevealTimer / 20).toFixed(1)}s remaining.`
            : "Repeat the hidden sequence from memory. One wrong key makes the order incorrect."}
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
          <span>{showSequence ? "Remember it!" : `${order.memorizeInputIndex}/${step.sequenceLength} keys entered`}</span>
          <span>{!order.orderCorrect ? "⚠️ No tip" : "Stay sharp"}</span>
        </div>
      </div>
    );
  }

  const assembleStep = step as Extract<OrderStep, { type: "assemble" }>;

  return (
    <div className="restaurant-step-card">
      <div className="restaurant-step-title">{assembleStep.label}</div>
      <div className="restaurant-step-copy">
        Press the key to add, or Space to skip.
        {!order.orderCorrect && <span className="order-incorrect-badge"> ⚠️ Wrong ingredient!</span>}
      </div>
      <div className="ingredient-sequence">
        {assembleStep.ingredients.map((ingredient, index) => {
          const done = index < order.assembleIndex;
          const current = index === order.assembleIndex;
          return (
            <div key={`${ingredient.name}-${index}`} className={`ingredient-chip ${done ? "done" : ""} ${current ? "current" : ""}`}>
              <span className="keycap">{ingredient.key.toUpperCase()}</span>
              <span>{ingredient.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Restaurant({ day, paused, state, setRestaurantState, onFinish, milestoneTarget, milestoneDaysLeft, netWorth, speed, onSpeedChange, acquiredRestaurantUpgrades, debugFF, onDebugFF }: RestaurantProps) {
  const activeOrder = useMemo(
    () => state.orderSlots.find((slot) => slot?.id === state.activeOrderId) ?? null,
    [state.activeOrderId, state.orderSlots],
  );

  useEffect(() => {
    if (paused || state.shiftOver) return;
    const interval = window.setInterval(() => {
      setRestaurantState((prev) => (prev ? restaurantTick(prev, (TICK_MS / 1000) * speed) : prev));
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [paused, setRestaurantState, state.shiftOver, speed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (paused || state.shiftOver) return;

      const activeElement = document.activeElement;
      const tag = activeElement?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const slotNumber = Number.parseInt(event.key, 10);
      if (!Number.isNaN(slotNumber) && slotNumber >= 1 && slotNumber <= state.orderSlots.length) {
        event.preventDefault();
        const slotIndex = slotNumber - 1;
        setRestaurantState((prev) => {
          if (!prev) return prev;
          const order = prev.orderSlots[slotIndex];
          if (!order) return prev;
          return order.completed ? serveOrder(prev, slotIndex) : acceptOrder(prev, slotIndex);
        });
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setRestaurantState((prev) => (prev ? handleChopKey(prev, event.key === "ArrowLeft" ? "left" : "right") : prev));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        setRestaurantState((prev) => {
          if (!prev) return prev;
          const activeSlotIndex = prev.orderSlots.findIndex((slot) => slot?.id === prev.activeOrderId);
          const currentOrder = activeSlotIndex >= 0 ? prev.orderSlots[activeSlotIndex] : null;
          if (currentOrder?.completed) return serveOrder(prev, activeSlotIndex);
          return handleKeyPress(prev, event.key);
        });
        return;
      }

      if (/^[a-zA-Z]$/.test(event.key) || event.key === " ") {
        event.preventDefault();
        setRestaurantState((prev) => (prev ? handleKeyPress(prev, event.key) : prev));
      }
    };

    const handleGlobalKeyUp = (event: KeyboardEvent) => {
      if (paused || state.shiftOver) return;
      if (/^[a-zA-Z]$/.test(event.key)) {
        setRestaurantState((prev) => (prev ? handleKeyUp(prev, event.key) : prev));
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (paused || state.shiftOver) return;
      setRestaurantState((prev) => (prev ? handleRestaurantMouseMove(prev, event.clientX, event.clientY) : prev));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [paused, setRestaurantState, state.orderSlots.length, state.shiftOver]);

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
          <div className="speed-controls">
            <button className={speed === 1 ? "active" : ""} onClick={() => onSpeedChange(1)}>1x</button>
            <button className={speed === 2 ? "active" : ""} onClick={() => onSpeedChange(2)}>2x</button>
            <button className={speed === 5 ? "active" : ""} onClick={() => onSpeedChange(5)}>5x</button>
            <button className={speed === 10 ? "active" : ""} onClick={() => onSpeedChange(10)}>10x</button>
            {debugFF && onDebugFF && <button className="debug-ff-btn" onClick={onDebugFF}>⏭</button>}
          </div>
        </div>
      </header>

      <section className="restaurant-queue">
        {Array.from({ length: state.orderSlots.length }, (_, index) => {
          const order = state.orderSlots[index];
          if (!order) {
            return (
              <div key={`slot-${index}`} className="order-slot empty">
                <div className="slot-number">{index + 1}</div>
                <div className="slot-empty-copy">Waiting for next customer…</div>
              </div>
            );
          }

          const patiencePct = Math.max(0, Math.min(100, (order.patienceRemaining / order.menuItem.patience) * 100));
          const currentStep = getCurrentStep(order);
          const miniProgress = getSlotMiniProgress(order);
          return (
            <button
              key={`slot-${index}`}
              type="button"
              className={`order-slot ${state.activeOrderId === order.id ? "active" : ""} ${order.completed ? "done" : ""} ${order.failed ? "failed" : ""} ${order.burnt ? "burnt" : ""} ${!order.orderCorrect ? "incorrect" : ""}`}
              onClick={() =>
                setRestaurantState((prev) => {
                  if (!prev) return prev;
                  const currentOrder = prev.orderSlots[index];
                  if (!currentOrder) return prev;
                  return currentOrder.completed ? serveOrder(prev, index) : acceptOrder(prev, index);
                })
              }
            >
              <div className="slot-number">{index + 1}</div>
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
      </section>

      <section className="restaurant-work-area">
        {activeOrder ? (
          <>
            <div className="ticket-panel">
              <div className="ticket-header">
                <h2>{activeOrder.menuItem.icon} {activeOrder.menuItem.name}</h2>
                <span>Customer patience: {activeOrder.patienceRemaining.toFixed(1)}s</span>
              </div>
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
            </div>
            <div className="station-panel">
              {activeOrder.failed ? (
                <div className="restaurant-step-card fail-card">
                  <div className="restaurant-step-title">Order failed</div>
                  <div className="restaurant-step-copy">This customer bounced. Pick another ticket.</div>
                </div>
              ) : activeOrder.completed ? (
                <div className="restaurant-step-card success-card">
                  <div className="restaurant-step-title">Order ready!</div>
                  <div className="restaurant-step-copy">Press Enter, {state.orderSlots.findIndex((slot) => slot?.id === activeOrder.id) + 1}, or click the ticket to serve.</div>
                </div>
              ) : (
                renderStepInstruction(activeOrder)
              )}
            </div>
          </>
        ) : (
          <div className="restaurant-empty-state">
            <h2>{state.shiftOver ? "Shift complete" : "Pick an order"}</h2>
            <p>{state.shiftOver ? "Cash out and head back to the market." : `Hit 1-${state.orderSlots.length} or click a ticket to start cooking.`}</p>
          </div>
        )}
      </section>

      <footer className="restaurant-footer">
        <div className="restaurant-summary-chip"><span>Completed</span><strong>{state.completedOrders}</strong></div>
        <div className="restaurant-summary-chip"><span>Total earnings</span><strong>${state.totalEarnings.toFixed(2)}</strong></div>
        <div className="restaurant-summary-chip"><span>Tips</span><strong>${state.totalTips.toFixed(2)}</strong></div>
      </footer>

      {state.shiftOver && (
        <div className="restaurant-shift-over">
          <div className="restaurant-shift-card">
            <h2>🏁 Shift Over</h2>
            <div className="shift-over-stats">
              <div><span>Orders served</span><strong>{state.completedOrders}</strong></div>
              <div><span>Food sales + tips</span><strong>${state.totalEarnings.toFixed(2)}</strong></div>
              <div><span>Tips earned</span><strong>${state.totalTips.toFixed(2)}</strong></div>
            </div>
            <button type="button" onClick={() => onFinish(state.totalEarnings)}>Back to the market</button>
          </div>
        </div>
      )}
    </div>
  );
}
