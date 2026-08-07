import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COURT_HEIGHT,
  COURT_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  BALL_RADIUS,
  createTennisState,
  generateTennisReward,
  getSwingAngle,
  setInput,
  tennisScoreLabel,
  tennisTick,
  togglePause,
  triggerDash,
  triggerSwingOrServe,
  TennisState,
} from "../game/tennis";
import { FishingReward } from "../game/fishing";
import { UPGRADE_POOL } from "../game/upgrades";

interface TennisProps {
  acquiredUpgrades: string[];
  onComplete: (reward: FishingReward | null) => void;
  paused: boolean;
  onPause: () => void;
}

const TICK_MS = 25; // 40Hz

export function Tennis({ acquiredUpgrades, onComplete, paused, onPause }: TennisProps) {
  const [state, setState] = useState<TennisState>(createTennisState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [reward, setReward] = useState<FishingReward | null>(null);
  const rewardGenerated = useRef(false);

  // Generate reward once when game ends & player won
  useEffect(() => {
    if (state.phase === "game_over" && state.playerWon && !rewardGenerated.current) {
      rewardGenerated.current = true;
      setReward(generateTennisReward(acquiredUpgrades));
    }
  }, [state.phase, state.playerWon, acquiredUpgrades]);

  // Keyboard handling
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key;
      if (paused) return;
      if (k === " " || k === "Spacebar") {
        e.preventDefault();
        setState((prev) => triggerSwingOrServe(prev));
        return;
      }
      if (k === "Shift" || e.shiftKey && (k === "ArrowUp" || k === "ArrowDown")) {
        setState((prev) => triggerDash(prev));
        // don't return — shift may accompany a movement key
      }
      if (k === "ArrowUp" || k === "w" || k === "W") {
        e.preventDefault();
        setState((prev) => setInput(prev, { up: true }));
      } else if (k === "ArrowDown" || k === "s" || k === "S") {
        e.preventDefault();
        setState((prev) => setInput(prev, { down: true }));
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W") {
        setState((prev) => setInput(prev, { up: false }));
      } else if (k === "ArrowDown" || k === "s" || k === "S") {
        setState((prev) => setInput(prev, { down: false }));
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [paused]);

  useEffect(() => {
    setState((prev) => prev.paused === paused ? prev : togglePause(prev));
  }, [paused]);

  // Tick loop
  useEffect(() => {
    if (state.phase === "game_over") return;
    if (state.paused) return;
    const id = window.setInterval(() => {
      setState((prev) => tennisTick(prev));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.phase, state.paused]);

  // Draw loop (requestAnimationFrame reads latest state via ref)
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) drawCourt(canvas, stateRef.current);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Touch controls: tap top half = up, tap bottom = down, hold to move
  const touchInputRef = useRef<{ up: boolean; down: boolean }>({ up: false, down: false });
  const isTouch = useMemo(
    () => typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window),
    [],
  );
  const onTouchZone = useCallback(
    (dir: "up" | "down", pressed: boolean) => {
      touchInputRef.current[dir] = pressed;
      setState((prev) => setInput(prev, { [dir]: pressed } as Partial<TennisState["input"]>));
    },
    [],
  );

  const handleContinue = useCallback(() => {
    onComplete(reward);
  }, [onComplete, reward]);

  const showReady = state.phase === "ready";
  const showGameOver = state.phase === "game_over";
  const pointScoredMessage = state.phase === "point_scored"
    ? (state.lastScorer === "player" ? "You scored!" : "Opponent scored!")
    : null;

  return (
    <div className="tennis-container">
      <div className="tennis-header">
        <div className="tennis-score">
          <div className="tennis-score-side">
            <div className="tennis-score-label">You</div>
            <div className="tennis-score-value">{tennisScoreLabel(state, "player")}</div>
          </div>
          <div className="tennis-score-sep">—</div>
          <div className="tennis-score-side">
            <div className="tennis-score-label">Opp.</div>
            <div className="tennis-score-value">{tennisScoreLabel(state, "opponent")}</div>
          </div>
        </div>
        <div className="tennis-controls-hint">
          {isTouch
            ? "Tap the top/bottom of the court to move. Tap SWING to hit."
            : "↑/↓ or W/S move · Shift = Dash · Space = Swing/Serve · Esc = Pause"}
        </div>
        <button
          className="tennis-pause-btn"
          onClick={onPause}
          disabled={state.phase === "game_over"}
          aria-label="Pause"
        >
          ⏸ Pause
        </button>
      </div>

      <div className="tennis-court-wrap">
        <canvas
          ref={canvasRef}
          className="tennis-court-canvas"
          width={COURT_WIDTH}
          height={COURT_HEIGHT}
        />
        {isTouch && !showGameOver && (
          <>
            <div
              className="tennis-touch-zone tennis-touch-up"
              onTouchStart={(e) => { e.preventDefault(); onTouchZone("up", true); }}
              onTouchEnd={(e) => { e.preventDefault(); onTouchZone("up", false); }}
              onTouchCancel={() => onTouchZone("up", false)}
            />
            <div
              className="tennis-touch-zone tennis-touch-down"
              onTouchStart={(e) => { e.preventDefault(); onTouchZone("down", true); }}
              onTouchEnd={(e) => { e.preventDefault(); onTouchZone("down", false); }}
              onTouchCancel={() => onTouchZone("down", false)}
            />
          </>
        )}
        {showReady && !state.paused && (
          <div className="tennis-overlay">
            <div className="tennis-overlay-card">
              <h3>🎾 Ready to serve</h3>
              <p>Press <kbd>Space</kbd> to serve. Win this one rally to claim the prize.</p>
              <button className="tennis-btn" onClick={() => setState((prev) => triggerSwingOrServe(prev))}>Serve</button>
            </div>
          </div>
        )}
        {pointScoredMessage && (
          <div className="tennis-overlay tennis-overlay-flash">
            <div className="tennis-overlay-card">
              <h3>{pointScoredMessage}</h3>
            </div>
          </div>
        )}
        {showGameOver && (
          <div className="tennis-overlay">
            <div className="tennis-overlay-card">
              <h3>{state.playerWon ? "🏆 Game — you win!" : "😔 Game — you lose."}</h3>
              {state.playerWon && reward ? (
                <>
                  <div className="tennis-reward"><TennisRewardDisplay reward={reward} /></div>
                </>
              ) : !state.playerWon ? (
                <p>Better luck next time.</p>
              ) : null}
              <button className="tennis-btn" onClick={handleContinue}>Continue →</button>
            </div>
          </div>
        )}
      </div>

      {isTouch && !showGameOver && (
        <div className="tennis-touch-actions">
          <button
            className="tennis-touch-btn"
            onTouchStart={(e) => { e.preventDefault(); setState((prev) => triggerDash(prev)); }}
            onClick={() => setState((prev) => triggerDash(prev))}
          >💨 Dash</button>
          <button
            className="tennis-touch-btn primary"
            onTouchStart={(e) => { e.preventDefault(); setState((prev) => triggerSwingOrServe(prev)); }}
            onClick={() => setState((prev) => triggerSwingOrServe(prev))}
          >🎾 Swing</button>
        </div>
      )}
    </div>
  );
}

function TennisRewardDisplay({ reward }: { reward: FishingReward }) {
  switch (reward.type) {
    case "cash":
      return <div className="reward-item">💵 +${reward.amount}</div>;
    case "ticket":
      return <div className="reward-item">🎟️ Store ticket (+1)</div>;
    case "upgrade": {
      const u = UPGRADE_POOL.find((x) => x.id === reward.upgradeId);
      if (!u) return <div className="reward-item">⬆️ Upgrade: {reward.upgradeId}</div>;
      return (
        <div className="reward-item">
          <div>⬆️ New upgrade: <strong>{u.icon} {u.name}</strong></div>
          <div className="reward-item-desc">{u.description}</div>
        </div>
      );
    }
    default:
      return <div className="reward-item">🎁 Prize</div>;
  }
}

// ==== Canvas rendering ====
function drawCourt(canvas: HTMLCanvasElement, state: TennisState) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Backdrop
  ctx.fillStyle = "#0d2e18";
  ctx.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT);
  // Court lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, COURT_WIDTH - 12, COURT_HEIGHT - 12);
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.moveTo(COURT_WIDTH / 2, 6);
  ctx.lineTo(COURT_WIDTH / 2, COURT_HEIGHT - 6);
  ctx.stroke();
  ctx.setLineDash([]);

  // Net
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.fillRect(COURT_WIDTH / 2 - 1.5, 6, 3, COURT_HEIGHT - 12);

  // Paddles
  drawPaddle(ctx, state.player, "#7ee0ff", true);
  drawPaddle(ctx, state.opponent, "#ff8a8a", false);

  // Ball
  ctx.fillStyle = "#f6ff8a";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  // Small streak in direction of motion
  const spd = Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
  if (spd > 0.1) {
    ctx.strokeStyle = "rgba(246, 255, 138, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(state.ball.x, state.ball.y);
    ctx.lineTo(state.ball.x - state.ball.vx * 1.6, state.ball.y - state.ball.vy * 1.6);
    ctx.stroke();
  }
}

function drawPaddle(
  ctx: CanvasRenderingContext2D,
  paddle: { x: number; y: number; swingTimer: number; dashTimer: number },
  color: string,
  isPlayer: boolean,
) {
  const halfW = PADDLE_WIDTH / 2;
  const halfH = PADDLE_HEIGHT / 2;
  ctx.save();
  // Dash trail
  if (paddle.dashTimer > 0) {
    ctx.fillStyle = "rgba(126, 224, 255, 0.18)";
    ctx.fillRect(paddle.x - halfW - 3, paddle.y - halfH - 6, PADDLE_WIDTH + 6, PADDLE_HEIGHT + 12);
  }
  // Upper two-thirds (fixed)
  ctx.fillStyle = color;
  const upperHeight = PADDLE_HEIGHT * (2 / 3);
  ctx.fillRect(paddle.x - halfW, paddle.y - halfH, PADDLE_WIDTH, upperHeight);

  // Lower third (may be rotated if this is the player and mid-swing)
  const lowerHeight = PADDLE_HEIGHT / 3;
  const pivotX = paddle.x;
  const pivotY = paddle.y + PADDLE_HEIGHT / 6; // top of the lower third

  if (isPlayer && paddle.swingTimer > 0) {
    const angle = getSwingAngle(paddle as unknown as import("../game/tennis").TennisState["player"]);
    ctx.translate(pivotX, pivotY);
    ctx.rotate(angle);
    ctx.fillStyle = "#ffee66";
    // Draw lower third pointing DOWN (0..+lowerHeight in local coords)
    ctx.fillRect(-halfW, 0, PADDLE_WIDTH, lowerHeight);
    // Sweep arc
    ctx.strokeStyle = "rgba(255, 238, 102, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, lowerHeight, 0, Math.PI / 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(paddle.x - halfW, pivotY, PADDLE_WIDTH, lowerHeight);
  }
  ctx.restore();
}
