import { useCallback, useEffect, useRef, useState } from "react";
import { FishingState, FishingReward, createFishingState, fishingTick, applyReel, castLine } from "../game/fishing";
import { UPGRADE_POOL } from "../game/upgrades";

interface FishingProps {
  day: number;
  acquiredUpgrades: string[];
  onComplete: (reward: FishingReward | null) => void;
}

export function Fishing({ day, acquiredUpgrades, onComplete }: FishingProps) {
  const [state, setState] = useState<FishingState>(createFishingState);
  const [finished, setFinished] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const started = state.phase !== "idle";

  // Tick loop — only run after casting
  useEffect(() => {
    if (finished || !started) return;
    const interval = setInterval(() => {
      setState((prev) => {
        const next = fishingTick(prev, day, acquiredUpgrades);
        if (next.phase === "result" && next.resultTimer <= 0 && !finished) {
          setFinished(true);
        }
        return next;
      });
    }, 50); // 20 ticks/s
    return () => clearInterval(interval);
  }, [day, acquiredUpgrades, finished, started]);

  // Global mouse rotation detection — tracks circular motion anywhere
  // Uses cross product of consecutive movement vectors to detect clockwise turns
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const lastDir = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const processPointer = (clientX: number, clientY: number) => {
      if (state.phase !== "reeling") {
        lastPos.current = null;
        lastDir.current = null;
        return;
      }

      const pos = { x: clientX, y: clientY };
      if (lastPos.current) {
        const dx = pos.x - lastPos.current.x;
        const dy = pos.y - lastPos.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2 && lastDir.current) {
          // Cross product: positive = clockwise turn
          const cross = lastDir.current.dx * dy - lastDir.current.dy * dx;
          if (cross > 0) {
            const power = Math.min(cross / 200, 1.5);
            setState((prev) => applyReel(prev, power));
          }
        }

        if (dist > 2) {
          lastDir.current = { dx: dx / dist, dy: dy / dist };
        }
      }
      lastPos.current = pos;
    };

    // Pointer Events unify mouse + touch + pen and are widely supported.
    // Listening on the document catches every movement anywhere on the page.
    const handlePointerMove = (e: PointerEvent) => {
      if (state.phase === "reeling" && e.pointerType !== "mouse") {
        // Prevent the page from scrolling while the player is swirling.
        e.preventDefault();
      }
      processPointer(e.clientX, e.clientY);
    };
    const handlePointerEnd = () => {
      lastPos.current = null;
      lastDir.current = null;
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [state.phase]);

  const handleCast = useCallback(() => {
    setState((prev) => castLine(prev));
  }, []);

  const handleContinue = useCallback(() => {
    const reward = state.caught && state.currentFish ? state.currentFish.reward : null;
    onComplete(reward);
  }, [state.caught, state.currentFish, onComplete]);

  const fish = state.currentFish?.fish;
  const progressPct = fish ? Math.min(100, (state.overlapTicks / (fish.duration * fish.catchThreshold)) * 100) : 0;

  return (
    <div className={`fishing-container ${state.phase === "reeling" ? "no-touch-scroll" : ""}`} ref={containerRef}>
      <div className="fishing-header">
        <h2>🎣 Fishing</h2>
        {state.phase === "idle" && <p className="fishing-status">Ready to fish! Cast your line when you&apos;re ready.</p>}
        {state.phase === "casting" && <p className="fishing-status">Casting line...</p>}
        {state.phase === "waiting" && <p className="fishing-status">Waiting for a bite...</p>}
        {state.phase === "reeling" && fish && (
          <p className="fishing-status">
            {fish.icon} {fish.name} ({fish.difficulty}) — Swirl clockwise (mouse or finger) to reel!
          </p>
        )}
        {state.phase === "result" && (
          <p className="fishing-status">
            {state.caught ? "🎉 Caught it!" : "💨 It got away..."}
          </p>
        )}
      </div>

      <div className="fishing-game-area">
        {/* Cast button */}
        {state.phase === "idle" && (
          <button className="fishing-cast-btn" onClick={handleCast}>
            🎣 Cast Line
          </button>
        )}

        {/* Vertical meter */}
        {state.phase !== "idle" && !finished && (
        <div className="fishing-meter">
          <div className="fishing-meter-track">
            {state.phase === "reeling" && fish && (
              <div
                className="fishing-fish-indicator"
                style={{
                  bottom: `${(state.fishPosition - fish.size / 2) * 100}%`,
                  height: `${fish.size * 100}%`,
                }}
              >
                <span className="fish-icon">{fish.icon}</span>
              </div>
            )}
            {(state.phase === "reeling" || state.phase === "waiting") && (
              <div
                className="fishing-pole-indicator"
                style={{ bottom: `${(state.polePosition - 0.025) * 100}%` }}
              >
                🎣
              </div>
            )}
          </div>
        </div>
        )}

        {/* Progress bar */}
        {state.phase === "reeling" && fish && (
          <div className="fishing-progress">
            <div className="fishing-progress-label">
              Catch progress: {Math.round(progressPct)}%
            </div>
            <div className="fishing-progress-bar">
              <div className="fishing-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="fishing-time-remaining">
              Time: {((fish.duration - state.totalTicks) / 20).toFixed(1)}s
            </div>
          </div>
        )}

        {/* Result display */}
        {finished && state.currentFish && (
          <div className="fishing-result">
            {state.caught ? (
              <div className="fishing-reward">
                <div className="fishing-reward-fish">
                  {state.currentFish.fish.icon} {state.currentFish.fish.name}
                </div>
                <RewardDisplay reward={state.currentFish.reward} />
              </div>
            ) : (
              <div className="fishing-miss">
                <p>The {state.currentFish.fish.name} got away!</p>
                <p className="fishing-hint">Keep the pole indicator inside the fish zone to fill the catch meter.</p>
              </div>
            )}
            <button className="fishing-continue-btn" onClick={handleContinue}>
              Continue →
            </button>
          </div>
        )}

        {/* Reel hint */}
        {state.phase === "reeling" && (
          <div className="fishing-reel-hint">
            <div className="reel-circle">
              <div className="reel-arrow">↻</div>
            </div>
            <span>Swirl to reel</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RewardDisplay({ reward }: { reward: FishingReward }) {
  switch (reward.type) {
    case "cash":
      return <div className="reward-item">💵 +${reward.amount}</div>;
    case "ticket":
      return <div className="reward-item">🎟️ +1 Store Ticket</div>;
    case "upgrade": {
      const upgrade = UPGRADE_POOL.find((u) => u.id === reward.upgradeId);
      if (!upgrade) return <div className="reward-item">⬆️ Upgrade: {reward.upgradeId}</div>;
      return (
        <div className="reward-item fishing-upgrade-card">
          <div className="fishing-upgrade-icon">{upgrade.icon}</div>
          <div className="fishing-upgrade-info">
            <div className="fishing-upgrade-name">{upgrade.name}</div>
            <div className="fishing-upgrade-desc">{upgrade.description}</div>
          </div>
        </div>
      );
    }
    case "recipe":
      return <div className="reward-item">📖 New Recipe: {reward.recipe?.icon} {reward.recipe?.name}</div>;
    default:
      return null;
  }
}
