import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FishingReward } from "../game/fishing";

interface BowlingProps {
  onComplete: (reward: FishingReward | null) => void;
}

// Lane geometry (canvas coords)
const LANE_W = 200;   // playable lane width
const LANE_H = 640;   // canvas height
const GUTTER = 20;    // gutter width on each side
const CANVAS_W = LANE_W + GUTTER * 2;
const FOUL_LINE_Y = LANE_H - 40;    // ball starts here
const PIN_ROW_Y = 90;               // front pin y
const PIN_ROW_SPACING = 26;         // vertical distance between pin rows
const PIN_COL_SPACING = 26;         // horizontal distance between pins in a row
const PIN_RADIUS = 9;
const BALL_RADIUS = 12;
const CASH_PER_POINT = 1;

// Standard 10 pin layout — front to back, and points = pin number.
// Row 1 (front): 1
// Row 2:         2  3
// Row 3:       4  5  6
// Row 4 (back):7  8  9  10
// Points: 1..10 where 10 is back-right (per spec).
type Pin = { id: number; x: number; y: number; standing: boolean; vx: number; vy: number };

function makePins(): Pin[] {
  const laneMidX = GUTTER + LANE_W / 2;
  const pins: Pin[] = [];
  // Rows from BACK to FRONT (ball rolls up-lane toward smaller y).
  // Back row (farthest from ball): 7 8 9 10
  // Then:                          4 5 6
  // Then:                          2 3
  // Front (closest to ball):       1
  const rows: number[][] = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];
  rows.forEach((row, r) => {
    const y = PIN_ROW_Y + r * PIN_ROW_SPACING;
    const totalWidth = (row.length - 1) * PIN_COL_SPACING;
    const startX = laneMidX - totalWidth / 2;
    row.forEach((id, i) => {
      pins.push({ id, x: startX + i * PIN_COL_SPACING, y, standing: true, vx: 0, vy: 0 });
    });
  });
  return pins;
}

type Phase = "aim_position" | "aim_angle" | "aim_power" | "spin" | "rolling" | "between" | "done";

interface BowlingState {
  ballX: number;
  angleDeg: number;      // final angle (0 = straight up-lane, negative = left)
  power: number;         // 0..1
  spin: number;          // -1..+1 (negative = left/CCW, positive = right/CW)
  ballPosX: number;      // live ball position during rolling
  ballPosY: number;
  ballVx: number;
  ballVy: number;
  ballInGutter: boolean;
  ballDone: boolean;
}

const ANGLE_SWEEP_DEG = 22;         // sweeps ±22°
const ANGLE_SWEEP_SPEED = 45;       // deg/sec back and forth
const POWER_SWEEP_SPEED = 1.4;      // 0..1..0 per second
const SPIN_WINDOW_MS = 2500;        // time window for spin input
const BALL_MAX_SPEED = 12;          // px/tick at full power
const FRICTION = 0.995;
const PIN_FRICTION = 0.90;

export function Bowling({ onComplete }: BowlingProps) {
  const [phase, setPhase] = useState<Phase>("aim_position");
  const [ballIndex, setBallIndex] = useState(1); // 1, 2, or 3
  const [pinsAfterPrevBalls, setPinsAfterPrevBalls] = useState<Pin[]>(() => makePins());
  const [pins, setPins] = useState<Pin[]>(() => makePins());
  const [ball, setBall] = useState<BowlingState>({
    ballX: GUTTER + LANE_W / 2,
    angleDeg: 0, power: 0, spin: 0,
    ballPosX: 0, ballPosY: 0, ballVx: 0, ballVy: 0,
    ballInGutter: false, ballDone: false,
  });
  const [totalScore, setTotalScore] = useState(0);
  const [ballScores, setBallScores] = useState<number[]>([]);
  const [isStrike, setIsStrike] = useState(false);
  const [isSpare, setIsSpare] = useState(false);
  const [paused, setPaused] = useState(false);
  const rewardIssued = useRef(false);

  // Meter animation timers
  const angleSweepRef = useRef({ dir: 1, deg: -ANGLE_SWEEP_DEG });
  const powerSweepRef = useRef({ dir: 1, val: 0 });
  const spinStartRef = useRef(0);
  const spinAccumRef = useRef(0); // radians accumulated (signed)
  const spinLastAngleRef = useRef<number | null>(null);
  const spinCenterRef = useRef({ x: 0, y: 0 });

  // Live display values that don't need to trigger re-render on every tick
  const [meterAngle, setMeterAngle] = useState(0);
  const [meterPower, setMeterPower] = useState(0);
  const [spinReading, setSpinReading] = useState(0);
  const [spinTimeLeft, setSpinTimeLeft] = useState(SPIN_WINDOW_MS);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spinAreaRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ phase, ball, pins });
  stateRef.current = { phase, ball, pins };

  // ---- Position phase: arrows to move ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (paused && (e.key === "Escape" || e.key === "p" || e.key === "P")) {
        setPaused(false);
        return;
      }
      if (!paused && (e.key === "Escape" || e.key === "p" || e.key === "P")) {
        if (phase !== "done") { setPaused(true); }
        return;
      }
      if (paused) return;

      if (phase === "aim_position") {
        if (e.key === "ArrowLeft") {
          setBall((b) => ({ ...b, ballX: Math.max(GUTTER + BALL_RADIUS, b.ballX - 6) }));
          e.preventDefault();
        } else if (e.key === "ArrowRight") {
          setBall((b) => ({ ...b, ballX: Math.min(GUTTER + LANE_W - BALL_RADIUS, b.ballX + 6) }));
          e.preventDefault();
        } else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          angleSweepRef.current = { dir: 1, deg: -ANGLE_SWEEP_DEG };
          setPhase("aim_angle");
        }
      } else if (phase === "aim_angle") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          const locked = angleSweepRef.current.deg;
          setBall((b) => ({ ...b, angleDeg: locked }));
          powerSweepRef.current = { dir: 1, val: 0 };
          setPhase("aim_power");
        }
      } else if (phase === "aim_power") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          const locked = powerSweepRef.current.val;
          setBall((b) => ({ ...b, power: Math.max(0.15, locked) }));
          spinStartRef.current = performance.now();
          spinAccumRef.current = 0;
          spinLastAngleRef.current = null;
          setSpinReading(0);
          setSpinTimeLeft(SPIN_WINDOW_MS);
          setPhase("spin");
        }
      } else if (phase === "spin") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          finishSpin();
        }
      } else if (phase === "between") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          startNextBall();
        }
      } else if (phase === "done") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          handleFinish();
        }
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused]);

  // ---- Meter animation ticks ----
  useEffect(() => {
    if (paused) return;
    if (phase !== "aim_angle" && phase !== "aim_power") return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(50, t - last) / 1000;
      last = t;
      if (stateRef.current.phase === "aim_angle") {
        const a = angleSweepRef.current;
        a.deg += a.dir * ANGLE_SWEEP_SPEED * dt;
        if (a.deg > ANGLE_SWEEP_DEG) { a.deg = ANGLE_SWEEP_DEG; a.dir = -1; }
        if (a.deg < -ANGLE_SWEEP_DEG) { a.deg = -ANGLE_SWEEP_DEG; a.dir = 1; }
        setMeterAngle(a.deg);
      } else if (stateRef.current.phase === "aim_power") {
        const p = powerSweepRef.current;
        p.val += p.dir * POWER_SWEEP_SPEED * dt;
        if (p.val > 1) { p.val = 1; p.dir = -1; }
        if (p.val < 0) { p.val = 0; p.dir = 1; }
        setMeterPower(p.val);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused]);

  // ---- Spin window timer ----
  useEffect(() => {
    if (phase !== "spin" || paused) return;
    const id = window.setInterval(() => {
      const elapsed = performance.now() - spinStartRef.current;
      const left = Math.max(0, SPIN_WINDOW_MS - elapsed);
      setSpinTimeLeft(left);
      if (left <= 0) finishSpin();
    }, 50);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused]);

  const finishSpin = useCallback(() => {
    // spinAccum in radians; convert to signed [-1..+1] roughly (2 full turns saturates)
    const turns = spinAccumRef.current / (Math.PI * 2);
    const s = Math.max(-1, Math.min(1, turns / 2));
    setBall((b) => ({ ...b, spin: s }));
    setSpinReading(s);
    launchBall(s);
  }, []);

  // ---- Spin capture: pointer over the spin area ----
  const handleSpinPointerMove = useCallback((e: React.PointerEvent) => {
    if (phase !== "spin" || paused) return;
    const el = spinAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    spinCenterRef.current = { x: cx, y: cy };
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 20) return; // ignore near center
    const angle = Math.atan2(dy, dx);
    const last = spinLastAngleRef.current;
    if (last !== null) {
      let delta = angle - last;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      spinAccumRef.current += delta;
    }
    spinLastAngleRef.current = angle;
    // live display
    const turns = spinAccumRef.current / (Math.PI * 2);
    setSpinReading(Math.max(-1, Math.min(1, turns / 2)));
  }, [phase, paused]);

  // ---- Launch ball with locked settings ----
  const launchBall = useCallback((spin: number) => {
    setBall((b) => {
      const radAngle = (b.angleDeg * Math.PI) / 180;
      const speed = BALL_MAX_SPEED * b.power;
      // Up-lane = -y direction; angle 0 → straight up
      const vx = Math.sin(radAngle) * speed;
      const vy = -Math.cos(radAngle) * speed;
      return {
        ...b,
        spin,
        ballPosX: b.ballX,
        ballPosY: FOUL_LINE_Y,
        ballVx: vx,
        ballVy: vy,
        ballInGutter: false,
        ballDone: false,
      };
    });
    setPhase("rolling");
  }, []);

  // ---- Rolling physics ----
  useEffect(() => {
    if (phase !== "rolling" || paused) return;
    const id = window.setInterval(() => {
      setBall((b) => {
        if (b.ballDone) return b;
        let { ballPosX: x, ballPosY: y, ballVx: vx, ballVy: vy, ballInGutter, spin } = b;
        // Apply spin as a small lateral acceleration proportional to forward speed.
        // Right spin (+) curves the ball to the right.
        const forward = Math.abs(vy);
        if (!ballInGutter) {
          vx += spin * forward * 0.03;
        }
        // Friction
        vx *= FRICTION;
        vy *= FRICTION;
        x += vx;
        y += vy;
        // Gutter check
        if (!ballInGutter) {
          if (x < GUTTER + BALL_RADIUS) {
            x = GUTTER - BALL_RADIUS / 2;
            vx = 0;
            ballInGutter = true;
          } else if (x > GUTTER + LANE_W - BALL_RADIUS) {
            x = GUTTER + LANE_W + BALL_RADIUS / 2;
            vx = 0;
            ballInGutter = true;
          }
        }
        // End conditions
        const goneOff = y < -BALL_RADIUS * 2;
        const stopped = Math.abs(vx) + Math.abs(vy) < 0.2;
        const ballDone = goneOff || (stopped && y < FOUL_LINE_Y);
        return { ...b, ballPosX: x, ballPosY: y, ballVx: vx, ballVy: vy, ballInGutter, ballDone };
      });

      // Ball vs pin collisions (only if ball moving)
      setPins((prev) => {
        const ballNow = stateRef.current.ball;
        if (ballNow.ballDone || ballNow.ballInGutter) return updatePinsPhysics(prev);
        const next = prev.map((p) => ({ ...p }));
        // Ball-pin
        for (const p of next) {
          if (!p.standing) {
            // moving pin
            continue;
          }
          const dx = p.x - ballNow.ballPosX;
          const dy = p.y - ballNow.ballPosY;
          const d2 = dx * dx + dy * dy;
          const r = PIN_RADIUS + BALL_RADIUS;
          if (d2 < r * r) {
            const d = Math.sqrt(d2) || 0.01;
            const nx = dx / d;
            const ny = dy / d;
            // Impart velocity
            const speed = Math.sqrt(ballNow.ballVx * ballNow.ballVx + ballNow.ballVy * ballNow.ballVy);
            p.vx = nx * speed * 1.6 + ballNow.ballVx * 0.3;
            p.vy = ny * speed * 1.6 + ballNow.ballVy * 0.3;
            p.standing = false;
          }
        }
        return updatePinsPhysics(next);
      });
    }, 16);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused]);

  // When the ball is done, resolve the ball
  useEffect(() => {
    if (phase !== "rolling") return;
    if (!ball.ballDone) return;
    // Give pins ~600ms to settle
    const t = window.setTimeout(() => resolveBall(), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ball.ballDone, phase]);

  const resolveBall = useCallback(() => {
    setPins((currentPins) => {
      const knockedNow = currentPins
        .filter((p) => !p.standing && pinsAfterPrevBalls.find((q) => q.id === p.id)?.standing);
      const gained = knockedNow.reduce((s, p) => s + p.id, 0);
      const newTotal = totalScore + gained;
      const newBallScores = [...ballScores, gained];
      setTotalScore(newTotal);
      setBallScores(newBallScores);

      // Determine what to do next based on ball index and knocks
      const allDown = currentPins.every((p) => !p.standing);
      const currentIdx = ballIndex;
      if (currentIdx === 1) {
        if (allDown) {
          // Strike — reset pins, give 2 more balls (fresh rack)
          setIsStrike(true);
          setPinsAfterPrevBalls(makePins());
          setPhase("between");
          return makePins();
        } else {
          // Continue to ball 2 with remaining pins
          setPinsAfterPrevBalls(currentPins.map((p) => ({ ...p })));
          setPhase("between");
          return currentPins;
        }
      } else if (currentIdx === 2) {
        if (allDown) {
          if (isStrike) {
            // Struck 1st, all down on 2nd — one more ball on fresh rack
            setPinsAfterPrevBalls(makePins());
            setPhase("between");
            return makePins();
          } else {
            // Spare — 3rd ball on fresh rack
            setIsSpare(true);
            setPinsAfterPrevBalls(makePins());
            setPhase("between");
            return makePins();
          }
        } else {
          // No strike/spare — done (or if isStrike, we still had 3 balls; carry to ball 3)
          if (isStrike) {
            setPinsAfterPrevBalls(currentPins.map((p) => ({ ...p })));
            setPhase("between");
            return currentPins;
          } else {
            setPhase("done");
            return currentPins;
          }
        }
      } else {
        // Ball 3 — always the last
        setPhase("done");
        return currentPins;
      }
    });
  }, [ballIndex, ballScores, totalScore, isStrike, pinsAfterPrevBalls]);

  const startNextBall = useCallback(() => {
    setBallIndex((i) => i + 1);
    setBall((b) => ({
      ...b,
      ballX: GUTTER + LANE_W / 2,
      angleDeg: 0, power: 0, spin: 0,
      ballPosX: 0, ballPosY: 0, ballVx: 0, ballVy: 0,
      ballInGutter: false, ballDone: false,
    }));
    setPhase("aim_position");
  }, []);

  const handleFinish = useCallback(() => {
    if (rewardIssued.current) return;
    rewardIssued.current = true;
    const cash = totalScore * CASH_PER_POINT;
    const reward: FishingReward | null = cash > 0 ? { type: "cash", amount: cash } : null;
    onComplete(reward);
  }, [totalScore, onComplete]);

  // ---- Canvas rendering ----
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = canvasRef.current;
      if (c) drawLane(c, stateRef.current.ball, stateRef.current.pins, {
        phase: stateRef.current.phase, meterAngle, meterPower,
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [meterAngle, meterPower]);

  const secondsLeft = useMemo(() => (spinTimeLeft / 1000).toFixed(1), [spinTimeLeft]);

  return (
    <div className="bowl-container">
      <div className="bowl-header">
        <div className="bowl-stat">
          <div className="bowl-stat-label">Ball</div>
          <div className="bowl-stat-value">{ballIndex}{isStrike && ballIndex === 1 ? " (X)" : ""}</div>
        </div>
        <div className="bowl-stat">
          <div className="bowl-stat-label">Frame Score</div>
          <div className="bowl-stat-value">{totalScore}</div>
        </div>
        <div className="bowl-stat">
          <div className="bowl-stat-label">This Ball</div>
          <div className="bowl-stat-value">{ballScores[ballScores.length - 1] ?? "—"}</div>
        </div>
        <div className="bowl-stat">
          <div className="bowl-stat-label">Cash</div>
          <div className="bowl-stat-value">${totalScore * CASH_PER_POINT}</div>
        </div>
        <button
          className="bowl-pause-btn"
          onClick={() => phase !== "done" && setPaused((p) => !p)}
          disabled={phase === "done"}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
      </div>

      <div className="bowl-main">
        <div className="bowl-lane-wrap">
          <canvas ref={canvasRef} className="bowl-lane-canvas" width={CANVAS_W} height={LANE_H} />

          {phase === "spin" && !paused && (
            <div
              ref={spinAreaRef}
              className="bowl-spin-zone"
              onPointerMove={handleSpinPointerMove}
              onTouchMove={(e) => {
                if (phase !== "spin" || paused) return;
                const el = spinAreaRef.current;
                if (!el) return;
                const t = e.touches[0];
                if (!t) return;
                // Reuse handleSpinPointerMove logic via synthetic event-ish object
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dx = t.clientX - cx;
                const dy = t.clientY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 20) return;
                const ang = Math.atan2(dy, dx);
                const last = spinLastAngleRef.current;
                if (last !== null) {
                  let delta = ang - last;
                  if (delta > Math.PI) delta -= Math.PI * 2;
                  if (delta < -Math.PI) delta += Math.PI * 2;
                  spinAccumRef.current += delta;
                }
                spinLastAngleRef.current = ang;
                const turns = spinAccumRef.current / (Math.PI * 2);
                setSpinReading(Math.max(-1, Math.min(1, turns / 2)));
                e.preventDefault();
              }}
            >
              <div className="bowl-spin-hint">Swirl mouse / finger here for spin</div>
              <div className="bowl-spin-reading">
                {spinReading > 0.05 ? `↻ RIGHT ${(spinReading * 100).toFixed(0)}%`
                  : spinReading < -0.05 ? `↺ LEFT ${(Math.abs(spinReading) * 100).toFixed(0)}%`
                  : "no spin"}
              </div>
              <div className="bowl-spin-timer">{secondsLeft}s</div>
              <button className="bowl-btn small" onClick={finishSpin}>Release ball ↑</button>
            </div>
          )}

          {phase === "between" && !paused && (
            <div className="bowl-between">
              <div className="bowl-between-card">
                <h3>
                  {isStrike && ballIndex === 1 ? "🎳 STRIKE!" :
                   isSpare && ballIndex === 2 ? "🎯 SPARE!" :
                   `Ball ${ballIndex} done`}
                </h3>
                <p>Knocked down: <strong>{ballScores[ballScores.length - 1]}</strong> points</p>
                <button className="bowl-btn" onClick={startNextBall}>Next Ball →</button>
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="bowl-between">
              <div className="bowl-between-card">
                <h3>🎳 Frame Complete!</h3>
                <p>Total: <strong>{totalScore}</strong> points</p>
                <p className="bowl-cash">💵 +${totalScore * CASH_PER_POINT}</p>
                <button className="bowl-btn" onClick={handleFinish}>Continue →</button>
              </div>
            </div>
          )}

          {paused && (
            <div className="bowl-between">
              <div className="bowl-between-card">
                <h3>⏸ Paused</h3>
                <button className="bowl-btn" onClick={() => setPaused(false)}>Resume</button>
              </div>
            </div>
          )}
        </div>

        <div className="bowl-controls">
          {phase === "aim_position" && (
            <div className="bowl-hint">
              <div className="bowl-hint-title">1. Position</div>
              <div>← / → to move ball</div>
              <div>Space to lock</div>
            </div>
          )}
          {phase === "aim_angle" && (
            <div className="bowl-hint">
              <div className="bowl-hint-title">2. Angle</div>
              <div>Watch the meter</div>
              <div>Space to lock ({meterAngle > 0 ? "+" : ""}{meterAngle.toFixed(0)}°)</div>
            </div>
          )}
          {phase === "aim_power" && (
            <div className="bowl-hint">
              <div className="bowl-hint-title">3. Power</div>
              <div>Time the bar</div>
              <div>Space to lock ({(meterPower * 100).toFixed(0)}%)</div>
            </div>
          )}
          {phase === "spin" && (
            <div className="bowl-hint">
              <div className="bowl-hint-title">4. Spin</div>
              <div>Swirl mouse in the spin zone</div>
              <div>↻ clockwise = right spin</div>
              <div>↺ counter = left spin</div>
              <div>Space to release early</div>
            </div>
          )}
          {phase === "rolling" && (
            <div className="bowl-hint">
              <div className="bowl-hint-title">🎳 Rolling…</div>
            </div>
          )}
          {(phase === "between" || phase === "done") && (
            <div className="bowl-hint">
              <div>Space = continue</div>
            </div>
          )}
          <div className="bowl-key-hint">Esc / P to pause</div>
        </div>
      </div>
    </div>
  );
}

// ==== Pin physics ====
function updatePinsPhysics(pins: Pin[]): Pin[] {
  const next = pins.map((p) => ({ ...p }));
  // Move + friction
  for (const p of next) {
    if (p.standing) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= PIN_FRICTION;
    p.vy *= PIN_FRICTION;
    if (Math.abs(p.vx) + Math.abs(p.vy) < 0.05) { p.vx = 0; p.vy = 0; }
    // gutter walls: let them fly out
  }
  // Pin-pin collisions — knock over any standing pin hit by a moving fallen pin
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i];
      const b = next[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const r = PIN_RADIUS * 2;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d;
        const ny = dy / d;
        // Determine impact based on speeds
        const speedA = Math.abs(a.vx) + Math.abs(a.vy);
        const speedB = Math.abs(b.vx) + Math.abs(b.vy);
        if (a.standing && !b.standing && speedB > 0.2) {
          a.standing = false;
          a.vx = -nx * speedB * 0.7;
          a.vy = -ny * speedB * 0.7;
          // slow the moving pin
          b.vx *= 0.6; b.vy *= 0.6;
        } else if (b.standing && !a.standing && speedA > 0.2) {
          b.standing = false;
          b.vx = nx * speedA * 0.7;
          b.vy = ny * speedA * 0.7;
          a.vx *= 0.6; a.vy *= 0.6;
        } else if (!a.standing && !b.standing) {
          // separate them a bit
          const overlap = r - d;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
        }
      }
    }
  }
  return next;
}

// ==== Canvas drawing ====
function drawLane(
  canvas: HTMLCanvasElement,
  b: BowlingState,
  pins: Pin[],
  meta: { phase: Phase; meterAngle: number; meterPower: number },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_W, LANE_H);
  // Gutters
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, GUTTER, LANE_H);
  ctx.fillRect(GUTTER + LANE_W, 0, GUTTER, LANE_H);
  // Lane wood
  const grad = ctx.createLinearGradient(GUTTER, 0, GUTTER + LANE_W, 0);
  grad.addColorStop(0, "#c98a4d");
  grad.addColorStop(0.5, "#e6a866");
  grad.addColorStop(1, "#c98a4d");
  ctx.fillStyle = grad;
  ctx.fillRect(GUTTER, 0, LANE_W, LANE_H);
  // Board lines
  ctx.strokeStyle = "rgba(60, 30, 10, 0.4)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const x = GUTTER + (LANE_W * i) / 10;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LANE_H); ctx.stroke();
  }
  // Foul line
  ctx.strokeStyle = "#8b0000";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(GUTTER, FOUL_LINE_Y); ctx.lineTo(GUTTER + LANE_W, FOUL_LINE_Y); ctx.stroke();

  // Aiming arrow (during aim phases)
  if (meta.phase === "aim_position" || meta.phase === "aim_angle" || meta.phase === "aim_power") {
    const startX = b.ballX;
    const startY = FOUL_LINE_Y;
    const angleDeg = meta.phase === "aim_angle" ? meta.meterAngle : b.angleDeg;
    const rad = (angleDeg * Math.PI) / 180;
    const len = 60;
    const ex = startX + Math.sin(rad) * len;
    const ey = startY - Math.cos(rad) * len;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Power meter bar (during aim_power)
  if (meta.phase === "aim_power") {
    const barX = GUTTER + LANE_W + 4;
    const barY = 50;
    const barH = LANE_H - 100;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(barX - 12, barY, 8, barH);
    const fillH = barH * meta.meterPower;
    const fillColor = meta.meterPower > 0.85 ? "#ff5555" : meta.meterPower > 0.5 ? "#ffcc55" : "#66ff66";
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX - 12, barY + barH - fillH, 8, fillH);
  }

  // Pins
  for (const p of pins) {
    if (p.x < -PIN_RADIUS || p.x > CANVAS_W + PIN_RADIUS || p.y < -PIN_RADIUS || p.y > LANE_H + PIN_RADIUS) continue;
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 3, PIN_RADIUS, PIN_RADIUS * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    if (p.standing) {
      ctx.fillStyle = "#fff";
    } else {
      ctx.fillStyle = "rgba(200,200,200,0.55)";
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, PIN_RADIUS, 0, Math.PI * 2); ctx.fill();
    // Red stripe
    ctx.strokeStyle = p.standing ? "#c22" : "rgba(200,60,60,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, PIN_RADIUS - 3, 0, Math.PI * 2); ctx.stroke();
    // Pin number
    ctx.fillStyle = p.standing ? "#000" : "rgba(0,0,0,0.5)";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.id), p.x, p.y);
  }

  // Ball
  if (b.ballPosY > 0 && (meta.phase === "rolling" || meta.phase === "between" || meta.phase === "done")) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(b.ballPosX + 2, b.ballPosY + 3, BALL_RADIUS, BALL_RADIUS * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createRadialGradient(b.ballPosX - 4, b.ballPosY - 4, 2, b.ballPosX, b.ballPosY, BALL_RADIUS);
    bg.addColorStop(0, "#6ac8ff");
    bg.addColorStop(1, "#0a4a7a");
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(b.ballPosX, b.ballPosY, BALL_RADIUS, 0, Math.PI * 2); ctx.fill();
  } else {
    // Ball waiting at foul line during aim phases
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(b.ballX + 2, FOUL_LINE_Y + 3, BALL_RADIUS, BALL_RADIUS * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createRadialGradient(b.ballX - 4, FOUL_LINE_Y - 4, 2, b.ballX, FOUL_LINE_Y, BALL_RADIUS);
    bg.addColorStop(0, "#6ac8ff");
    bg.addColorStop(1, "#0a4a7a");
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(b.ballX, FOUL_LINE_Y, BALL_RADIUS, 0, Math.PI * 2); ctx.fill();
  }
}
