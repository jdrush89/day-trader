import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import {
  acceptOrder,
  handleChopKey,
  handleKeyPress,
  handleMouseMove as handleRestaurantMouseMove,
  nextWantedIndex,
  restaurantTick,
  serveOrder,
} from "../game/restaurant-engine";
import { ActiveOrder, OrderStep, RestaurantState } from "../game/restaurant-types";

const TICK_MS = 50;

interface RestaurantProps {
  day: number;
  paused: boolean;
  state: RestaurantState;
  setRestaurantState: Dispatch<SetStateAction<RestaurantState | null>>;
  onFinish: (earnings: number) => void;
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
  return null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function renderStepInstruction(order: ActiveOrder) {
  const step = getCurrentStep(order);
  if (!step) return null;

  if (step.type === "grill" || step.type === "fry") {
    const rawPct = (order.prepProgress / step.duration) * 100;
    const progressPct = Math.min(130, rawPct);
    const flipPct = step.type === "grill" && step.flipAt != null ? (step.flipAt / step.duration) * 100 : null;
    const flipReady = step.type === "grill" && step.flipAt != null && !order.flipped && Math.abs(order.prepProgress - step.flipAt) <= step.flipWindow;
    const readyToPlate = order.prepProgress >= step.duration;
    const inBurnZone = rawPct > 100 && rawPct <= 130;
    const burnTimeLeft = ((step.duration * 1.3 - order.prepProgress) / 20);

    return (
      <div className="restaurant-step-card">
        <div className="restaurant-step-title">{step.label}</div>
        <div className="restaurant-step-copy">
          {!order.prepStarted && "Press G to start cooking."}
          {order.prepStarted && step.type === "grill" && !order.flipped && !flipReady && !readyToPlate && "Watch the grill and flip on time."}
          {flipReady && "Press F now to flip!"}
          {order.burnt && "🔥 Burnt! This order is lost."}
          {inBurnZone && !order.burnt && `⚠️ Remove NOW! Burns in ${burnTimeLeft.toFixed(1)}s`}
          {readyToPlate && !inBurnZone && !order.burnt && "Press Enter to take it off the heat."}
          {order.prepStarted && step.type === "fry" && !readyToPlate && "Keep an eye on the fryer."}
        </div>
        <div className={`cook-meter ${inBurnZone ? "burn-warning" : ""}`}>
          <div className="cook-meter-fill" style={{ width: `${Math.min(100, progressPct)}%` }} />
          <div className="cook-meter-burn-zone" />
          {inBurnZone && <div className="cook-meter-burn-fill" style={{ width: `${((rawPct - 100) / 30) * 100}%` }} />}
          {flipPct != null && <div className="cook-meter-flip" style={{ left: `${flipPct}%` }} />}
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
        <div className="restaurant-step-copy">Swirl the mouse in circles!</div>
        <div className="mix-ring" style={{ ['--mix-progress' as string]: `${progressPct}%` }}>
          <div className="mix-ring-inner">{Math.round(progressPct)}%</div>
        </div>
        <div className="cook-meta">
          <span>{Math.round(order.mixProgress)} / {step.target} distance</span>
        </div>
      </div>
    );
  }

  const assembleStep = step as Extract<OrderStep, { type: "assemble" }>;
  const wanted = order.customizations[order.currentStepIndex];
  const activeIdx = wanted ? nextWantedIndex(order, order.assembleIndex) : order.assembleIndex;

  return (
    <div className="restaurant-step-card">
      <div className="restaurant-step-title">{assembleStep.label}</div>
      <div className="restaurant-step-copy">
        Press the highlighted ingredients in order.
        {!order.orderCorrect && <span className="order-incorrect-badge"> ⚠️ Wrong ingredient added!</span>}
      </div>
      <div className="ingredient-sequence">
        {assembleStep.ingredients.map((ing, index) => {
          const isWanted = !wanted || wanted[index];
          const done = isWanted && index < activeIdx;
          const skipped = !isWanted && index < activeIdx;
          const active = isWanted && index === activeIdx;
          return (
            <div key={`${ing.name}-${index}`} className={`ingredient-chip ${done ? "done" : ""} ${active ? "active" : ""} ${skipped ? "skipped" : ""}`}>
              <span className="keycap">{ing.key.toUpperCase()}</span>
              <span>{ing.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Restaurant({ day, paused, state, setRestaurantState, onFinish }: RestaurantProps) {
  const activeOrder = useMemo(
    () => state.orderSlots.find((slot) => slot?.id === state.activeOrderId) ?? null,
    [state.activeOrderId, state.orderSlots],
  );

  useEffect(() => {
    if (paused || state.shiftOver) return;
    const interval = window.setInterval(() => {
      setRestaurantState((prev) => (prev ? restaurantTick(prev, TICK_MS / 1000) : prev));
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [paused, setRestaurantState, state.shiftOver]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (paused || state.shiftOver) return;

      const activeElement = document.activeElement;
      const tag = activeElement?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (/^[1-5]$/.test(event.key)) {
        event.preventDefault();
        const slotIndex = Number(event.key) - 1;
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
          // If active order is completed, Enter serves it
          const activeSlotIdx = prev.orderSlots.findIndex((slot) => slot?.id === prev.activeOrderId);
          const active = activeSlotIdx >= 0 ? prev.orderSlots[activeSlotIdx] : null;
          if (active?.completed) return serveOrder(prev, activeSlotIdx);
          // Otherwise pass Enter to the step handler (e.g., take off grill)
          return handleKeyPress(prev, event.key);
        });
        return;
      }

      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        setRestaurantState((prev) => (prev ? handleKeyPress(prev, event.key) : prev));
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (paused || state.shiftOver) return;
      setRestaurantState((prev) => (prev ? handleRestaurantMouseMove(prev, event.clientX, event.clientY) : prev));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [paused, setRestaurantState, state.shiftOver]);

  return (
    <div className="restaurant-screen">
      <header className="restaurant-header">
        <div>
          <h1>🍔 SHWENDY'S</h1>
          <p>Day {day} — Shwendy's Shift</p>
        </div>
        <div className="restaurant-header-stats">
          <div className="restaurant-stat-box">
            <span>Shift</span>
            <strong>{formatTime(state.shiftTimeRemaining)}</strong>
          </div>
          <div className="restaurant-stat-box">
            <span>Earnings</span>
            <strong>${state.totalEarnings.toFixed(2)}</strong>
          </div>
        </div>
      </header>

      <section className="restaurant-queue">
        {Array.from({ length: 5 }, (_, index) => {
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
              onClick={() => setRestaurantState((prev) => {
                if (!prev) return prev;
                const currentOrder = prev.orderSlots[index];
                if (!currentOrder) return prev;
                return currentOrder.completed ? serveOrder(prev, index) : acceptOrder(prev, index);
              })}
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
                  // Show customization notes (e.g., "No lettuce, No tomato")
                  const removedItems: string[] = [];
                  order.menuItem.steps.forEach((step, si) => {
                    if (step.type !== "assemble") return;
                    const wanted = order.customizations[si];
                    if (!wanted) return;
                    step.ingredients.forEach((ing, ii) => {
                      if (!wanted[ii]) removedItems.push(ing.name);
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
                    {(miniProgress.type === "grill" || miniProgress.type === "fry") && (
                      <div className="slot-mini-danger" />
                    )}
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
            <p>{state.shiftOver ? "Cash out and head back to the market." : "Hit 1-5 or click a ticket to start cooking."}</p>
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
