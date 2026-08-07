/**
 * Tennis Mini-Game Engine
 *
 * A single-point Pong-style tennis rally. Player controls the LEFT paddle with arrow keys or
 * WASD. Shift = dash (short burst of extra speed). Space = swing paddle —
 * the right third of the paddle rotates 90° counter-clockwise briefly and
 * if it strikes the ball during that window, the ball is smacked away at
 * the swing-tangent angle with a large speed boost.
 *
 * Coordinate system: 0..COURT_WIDTH horizontally, 0..COURT_HEIGHT vertically.
 * Origin is top-left. Left player is +x direction; right player is -x direction.
 */

import { FishingReward } from "./fishing";
import { UPGRADE_POOL } from "./upgrades";

// ==== Court dimensions (arbitrary units — renderer scales to canvas) ====
export const COURT_WIDTH = 800;
export const COURT_HEIGHT = 500;

// ==== Paddle dimensions ====
export const PADDLE_WIDTH = 12;
export const PADDLE_HEIGHT = 90;
export const PADDLE_MARGIN = 24; // distance from side wall

// ==== Ball dimensions ====
export const BALL_RADIUS = 8;

// ==== Physics ====
const PADDLE_SPEED = 6;
const DASH_MULTIPLIER = 2.4;
const DASH_DURATION = 8; // ticks (~130ms at 60Hz)
const DASH_COOLDOWN = 40; // ticks between dashes
const SWING_DURATION = 8; // ticks paddle stays swung
const SWING_COOLDOWN = 18;
const SWING_MAX_ANGLE = Math.PI / 2; // 90° counter-clockwise
const AI_SPEED = 4.4;
const AI_REACTION_JITTER = 30; // px of "aim wobble" so the AI isn't perfect
const BALL_INITIAL_SPEED = 5.2;
const BALL_MAX_SPEED = 16;
const BALL_SPEED_UP_ON_PADDLE_HIT = 1.06;
const BALL_SMACK_SPEED_BOOST = 1.6;

// ==== Scoring ====
export type TennisPoint = 0 | 15 | 30 | 40;
export const TENNIS_POINTS: TennisPoint[] = [0, 15, 30, 40];
export const POINTS_TO_WIN = 1;

export type TennisPhase =
  | "ready"          // Waiting for player to press Space to serve
  | "playing"        // Ball is in play
  | "point_scored"   // Brief pause after a point, showing who scored
  | "game_over";     // Someone won the game

export interface Paddle {
  x: number;          // center x
  y: number;          // center y
  vy: number;         // vertical velocity
  dashTimer: number;  // >0 when dashing
  dashCooldown: number;
  swingTimer: number; // >0 when swinging
  swingCooldown: number;
  swingHit: boolean;  // true when this swing has already smacked the ball
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TennisState {
  phase: TennisPhase;
  paused: boolean;
  playerScore: number;    // integer count of points won (0..N)
  opponentScore: number;
  playerAdvantage: boolean;
  opponentAdvantage: boolean;
  playerWon: boolean;
  player: Paddle;
  opponent: Paddle;
  ball: Ball;
  serving: "player" | "opponent";
  pointScoredTimer: number;   // ticks to hold the "point scored" pause
  lastScorer: "player" | "opponent" | null;
  // Input flags reset each tick
  input: {
    up: boolean;
    down: boolean;
    dash: boolean;
    swing: boolean;
  };
  // AI aim wobble (persists between ticks so it moves smoothly)
  aiTargetY: number;
}

// ==== Scoring helpers ====
export function tennisScoreLabel(state: TennisState, side: "player" | "opponent"): string {
  return String(side === "player" ? state.playerScore : state.opponentScore);
}

// ==== Factory ====
export function createTennisState(): TennisState {
  return {
    phase: "ready",
    paused: false,
    playerScore: 0,
    opponentScore: 0,
    playerAdvantage: false,
    opponentAdvantage: false,
    playerWon: false,
    player: {
      x: PADDLE_MARGIN + PADDLE_WIDTH / 2,
      y: COURT_HEIGHT / 2,
      vy: 0,
      dashTimer: 0,
      dashCooldown: 0,
      swingTimer: 0,
      swingCooldown: 0,
      swingHit: false,
    },
    opponent: {
      x: COURT_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH / 2,
      y: COURT_HEIGHT / 2,
      vy: 0,
      dashTimer: 0,
      dashCooldown: 0,
      swingTimer: 0,
      swingCooldown: 0,
      swingHit: false,
    },
    ball: resetBall("player"),
    serving: "player",
    pointScoredTimer: 0,
    lastScorer: null,
    input: { up: false, down: false, dash: false, swing: false },
    aiTargetY: COURT_HEIGHT / 2,
  };
}

function resetBall(serving: "player" | "opponent"): Ball {
  const dir = serving === "player" ? 1 : -1;
  const angle = (Math.random() * 0.6 - 0.3); // -0.3..0.3 radians
  return {
    x: COURT_WIDTH / 2,
    y: COURT_HEIGHT / 2,
    vx: BALL_INITIAL_SPEED * dir * Math.cos(angle),
    vy: BALL_INITIAL_SPEED * Math.sin(angle),
  };
}

// ==== Input ====
export function setInput(state: TennisState, patch: Partial<TennisState["input"]>): TennisState {
  return { ...state, input: { ...state.input, ...patch } };
}

/** Triggered on Space keydown. Serves if ready, otherwise attempts a swing. */
export function triggerSwingOrServe(state: TennisState): TennisState {
  if (state.paused) return state;
  if (state.phase === "ready") {
    return { ...state, phase: "playing" };
  }
  if (state.phase !== "playing") return state;
  if (state.player.swingCooldown > 0 || state.player.swingTimer > 0) return state;
  return {
    ...state,
    player: { ...state.player, swingTimer: SWING_DURATION, swingCooldown: SWING_DURATION + SWING_COOLDOWN, swingHit: false },
  };
}

/** Triggered on Shift keydown. */
export function triggerDash(state: TennisState): TennisState {
  if (state.phase !== "playing") return state;
  if (state.paused) return state;
  if (state.player.dashCooldown > 0 || state.player.dashTimer > 0) return state;
  return {
    ...state,
    player: { ...state.player, dashTimer: DASH_DURATION, dashCooldown: DASH_DURATION + DASH_COOLDOWN },
  };
}

/** Toggle pause. Only meaningful during ready/playing. */
export function togglePause(state: TennisState): TennisState {
  if (state.phase === "game_over" || state.phase === "point_scored") return state;
  return { ...state, paused: !state.paused };
}

// ==== Geometry ====
/**
 * Get the swing angle (radians, 0 = normal vertical paddle, negative =
 * rotated counter-clockwise) at this instant. Returns 0 when not swinging.
 * The rotation eases in and out for a bit of visual polish.
 */
export function getSwingAngle(paddle: Paddle): number {
  if (paddle.swingTimer <= 0) return 0;
  const t = 1 - paddle.swingTimer / SWING_DURATION; // 0..1 through swing
  // Ease: sin curve peaks at t=0.5
  const eased = Math.sin(t * Math.PI);
  return -SWING_MAX_ANGLE * eased;
}

/**
 * Returns the position of the tip of the swung portion (the right 1/3 of
 * the paddle). Used for collision detection with the ball during a swing.
 */
function getSwungTipPosition(paddle: Paddle): { x: number; y: number } | null {
  if (paddle.swingTimer <= 0) return null;
  const angle = getSwingAngle(paddle); // negative (CCW)
  // Right third of paddle has length PADDLE_HEIGHT/3. Pivot is at the top
  // of that third (y = paddle.y + PADDLE_HEIGHT/6, i.e. 1/6 below center).
  // When rotated 90° CCW, the tip is offset horizontally to the right.
  const armLength = PADDLE_HEIGHT / 3;
  const pivotY = paddle.y + PADDLE_HEIGHT / 6;
  const pivotX = paddle.x;
  // Local vector points DOWN (0, +armLength). Rotate by `angle` CCW.
  // Rotation: x' = x cos θ - y sin θ ; y' = x sin θ + y cos θ  (screen y flipped)
  // Since angle is negative for CCW under screen-y-down, sin/cos handle direction.
  const tipX = pivotX + (0 * Math.cos(angle) - armLength * Math.sin(angle));
  const tipY = pivotY + (0 * Math.sin(angle) + armLength * Math.cos(angle));
  return { x: tipX, y: tipY };
}

// ==== Tick ====
export function tennisTick(state: TennisState): TennisState {
  if (state.phase === "game_over") return state;
  if (state.paused) return state;

  if (state.phase === "point_scored") {
    const timer = state.pointScoredTimer - 1;
    if (timer <= 0) {
      return { ...state, pointScoredTimer: 0, phase: "ready" };
    }
    return { ...state, pointScoredTimer: timer };
  }

  // ready or playing — update paddles & ball
  let next = { ...state };
  next.player = updatePlayerPaddle(next.player, next.input);
  next.opponent = updateOpponentPaddle(next);

  if (next.phase !== "playing") return next;

  // Advance ball
  next.ball = { ...next.ball, x: next.ball.x + next.ball.vx, y: next.ball.y + next.ball.vy };

  // Top / bottom wall bounce
  if (next.ball.y - BALL_RADIUS < 0) {
    next.ball.y = BALL_RADIUS;
    next.ball.vy = Math.abs(next.ball.vy);
  } else if (next.ball.y + BALL_RADIUS > COURT_HEIGHT) {
    next.ball.y = COURT_HEIGHT - BALL_RADIUS;
    next.ball.vy = -Math.abs(next.ball.vy);
  }

  // Check swing smacks first (they take precedence over normal paddle hits)
  next = maybeApplySwingHit(next);

  // Paddle collisions
  next.ball = collideWithPaddle(next.ball, next.player, "player");
  next.ball = collideWithPaddle(next.ball, next.opponent, "opponent");

  // Clamp speed
  const speed = Math.sqrt(next.ball.vx * next.ball.vx + next.ball.vy * next.ball.vy);
  if (speed > BALL_MAX_SPEED) {
    const scale = BALL_MAX_SPEED / speed;
    next.ball.vx *= scale;
    next.ball.vy *= scale;
  }

  // Scoring (ball past a wall)
  if (next.ball.x < -BALL_RADIUS) {
    return awardPoint(next, "opponent");
  }
  if (next.ball.x > COURT_WIDTH + BALL_RADIUS) {
    return awardPoint(next, "player");
  }

  return next;
}

function updatePlayerPaddle(paddle: Paddle, input: TennisState["input"]): Paddle {
  const dashMul = paddle.dashTimer > 0 ? DASH_MULTIPLIER : 1;
  let vy = 0;
  if (input.up) vy -= PADDLE_SPEED * dashMul;
  if (input.down) vy += PADDLE_SPEED * dashMul;
  let y = paddle.y + vy;
  y = Math.max(PADDLE_HEIGHT / 2, Math.min(COURT_HEIGHT - PADDLE_HEIGHT / 2, y));
  return {
    ...paddle,
    y,
    vy,
    dashTimer: Math.max(0, paddle.dashTimer - 1),
    dashCooldown: Math.max(0, paddle.dashCooldown - 1),
    swingTimer: Math.max(0, paddle.swingTimer - 1),
    swingCooldown: Math.max(0, paddle.swingCooldown - 1),
    swingHit: paddle.swingTimer - 1 <= 0 ? false : paddle.swingHit,
  };
}

function updateOpponentPaddle(state: TennisState): Paddle {
  const p = state.opponent;
  // Move aim target toward ball y with a wobble so the AI isn't perfect.
  const drift = (Math.random() - 0.5) * AI_REACTION_JITTER * 0.2;
  const target = state.ball.vx > 0 // ball coming toward AI
    ? state.ball.y + drift
    : COURT_HEIGHT / 2 + Math.sin(Date.now() / 900) * 40; // idle wobble at center
  const aiTargetY = state.aiTargetY * 0.85 + target * 0.15;
  const dy = aiTargetY - p.y;
  const step = Math.sign(dy) * Math.min(Math.abs(dy), AI_SPEED);
  let y = p.y + step;
  y = Math.max(PADDLE_HEIGHT / 2, Math.min(COURT_HEIGHT - PADDLE_HEIGHT / 2, y));
  state.aiTargetY = aiTargetY;
  return { ...p, y, vy: step };
}

function collideWithPaddle(ball: Ball, paddle: Paddle, side: "player" | "opponent"): Ball {
  const half = PADDLE_HEIGHT / 2;
  const halfW = PADDLE_WIDTH / 2;
  const inY = ball.y > paddle.y - half - BALL_RADIUS && ball.y < paddle.y + half + BALL_RADIUS;
  if (!inY) return ball;

  if (side === "player") {
    // Player paddle is on the left. Ball hits if moving left and past paddle x.
    if (ball.vx < 0 && ball.x - BALL_RADIUS < paddle.x + halfW && ball.x > paddle.x - halfW) {
      // Reflect. Add spin based on where we hit relative to center.
      const rel = (ball.y - paddle.y) / half; // -1..1
      const newVx = Math.abs(ball.vx) * BALL_SPEED_UP_ON_PADDLE_HIT;
      const newVy = ball.vy + rel * 3;
      return { x: paddle.x + halfW + BALL_RADIUS, y: ball.y, vx: newVx, vy: newVy };
    }
  } else {
    // Opponent paddle is on the right.
    if (ball.vx > 0 && ball.x + BALL_RADIUS > paddle.x - halfW && ball.x < paddle.x + halfW) {
      const rel = (ball.y - paddle.y) / half;
      const newVx = -Math.abs(ball.vx) * BALL_SPEED_UP_ON_PADDLE_HIT;
      const newVy = ball.vy + rel * 3;
      return { x: paddle.x - halfW - BALL_RADIUS, y: ball.y, vx: newVx, vy: newVy };
    }
  }
  return ball;
}

/**
 * If the player is mid-swing and the ball is within the sweep of the
 * right-third-of-paddle arc, smack it: send it at the tangent angle of the
 * arc (roughly the direction the swing is moving) with a big speed boost.
 */
function maybeApplySwingHit(state: TennisState): TennisState {
  const p = state.player;
  if (p.swingTimer <= 0 || p.swingHit) return state;
  const tip = getSwungTipPosition(p);
  if (!tip) return state;
  // Compute the swept arc's bounding rectangle (rough) and check distance
  // from ball to the arm segment (pivot → tip).
  const pivotY = p.y + PADDLE_HEIGHT / 6;
  const pivotX = p.x;
  const dxArm = tip.x - pivotX;
  const dyArm = tip.y - pivotY;
  const armLen = Math.sqrt(dxArm * dxArm + dyArm * dyArm) || 1;
  // Project ball onto arm segment
  const bx = state.ball.x - pivotX;
  const by = state.ball.y - pivotY;
  const t = Math.max(0, Math.min(1, (bx * dxArm + by * dyArm) / (armLen * armLen)));
  const closestX = pivotX + dxArm * t;
  const closestY = pivotY + dyArm * t;
  const distX = state.ball.x - closestX;
  const distY = state.ball.y - closestY;
  const dist = Math.sqrt(distX * distX + distY * distY);
  if (dist > BALL_RADIUS + PADDLE_WIDTH * 0.75) return state;

  // Smack! Send ball in the direction of the swing tangent, which for a
  // CCW rotation is perpendicular to the arm and pointing right/up-ish.
  // Tangent (CCW at tip) = (armY, -armX) normalized.
  const tanX = dyArm / armLen;
  const tanY = -dxArm / armLen;
  const currSpeed = Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
  const speed = Math.min(BALL_MAX_SPEED, Math.max(currSpeed, BALL_INITIAL_SPEED) * BALL_SMACK_SPEED_BOOST);
  // Ensure the ball is sent toward the opponent (positive x).
  const dirX = tanX >= 0 ? tanX : -tanX;
  const dirY = tanX >= 0 ? tanY : -tanY;
  return {
    ...state,
    ball: {
      x: state.ball.x + dirX * 4, // nudge out of paddle
      y: state.ball.y + dirY * 4,
      vx: dirX * speed,
      vy: dirY * speed,
    },
    // Mark the swing as having connected so it can't smack the same ball
    // twice, but keep swingTimer running so the animation still plays out.
    player: { ...p, swingHit: true },
  };
}

function awardPoint(state: TennisState, scorer: "player" | "opponent"): TennisState {
  return {
    ...state,
    playerScore: state.playerScore + (scorer === "player" ? 1 : 0),
    opponentScore: state.opponentScore + (scorer === "opponent" ? 1 : 0),
    playerAdvantage: false,
    opponentAdvantage: false,
    phase: "game_over",
    playerWon: scorer === "player",
    lastScorer: scorer,
  };
}

// ==== Reward ====
export function generateTennisReward(acquiredUpgrades: string[]): FishingReward {
  const roll = Math.random();
  if (roll < 0.5) {
    // Cash
    const amount = 60 + Math.floor(Math.random() * 60);
    return { type: "cash", amount };
  }
  if (roll < 0.75) {
    return { type: "ticket" };
  }
  const available = UPGRADE_POOL.filter((u) => !acquiredUpgrades.includes(u.id));
  if (available.length > 0) {
    const upgrade = available[Math.floor(Math.random() * available.length)];
    return { type: "upgrade", upgradeId: upgrade.id };
  }
  return { type: "cash", amount: 120 };
}
