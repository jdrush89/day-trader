import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FishingReward } from "../game/fishing";

interface QuickTacToeProps {
  onComplete: (reward: FishingReward | null) => void;
  paused: boolean;
  onPause: () => void;
}

type Cell = "X" | "O" | null;
type Phase = "ready" | "playing" | "game_over";
type EndReason = "time" | "o_won" | null;

const TIME_LIMIT_MS = 30_000;
const CASH_PER_WIN = 5;

// Board grows: level 0 => 3x3 win=3, level 1 => 4x4 win=4, etc.
function boardSize(level: number): number {
  return 3 + level;
}
function winLength(level: number): number {
  return 3 + level;
}
// O drop interval slows with size (starts slow, gets faster).
function oIntervalMs(level: number): number {
  return Math.max(300, 1400 - level * 180);
}

function makeBoard(size: number): Cell[] {
  return Array<Cell>(size * size).fill(null);
}

function idx(r: number, c: number, size: number) {
  return r * size + c;
}

function findWinner(board: Cell[], size: number, need: number): Cell {
  // Check every starting cell in 4 directions
  const dirs: [number, number][] = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // diag \
    [1, -1], // diag /
  ];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const start = board[idx(r, c, size)];
      if (!start) continue;
      for (const [dr, dc] of dirs) {
        const endR = r + dr * (need - 1);
        const endC = c + dc * (need - 1);
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
        let ok = true;
        for (let k = 1; k < need; k++) {
          if (board[idx(r + dr * k, c + dc * k, size)] !== start) { ok = false; break; }
        }
        if (ok) return start;
      }
    }
  }
  return null;
}

function isFull(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

function emptyIndices(board: Cell[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) if (board[i] === null) out.push(i);
  return out;
}

export function QuickTacToe({ onComplete, paused, onPause }: QuickTacToeProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [level, setLevel] = useState(0);
  const [wins, setWins] = useState(0);
  const [board, setBoard] = useState<Cell[]>(() => makeBoard(3));
  const [timeLeftMs, setTimeLeftMs] = useState(TIME_LIMIT_MS);
  const [endReason, setEndReason] = useState<EndReason>(null);
  const [flash, setFlash] = useState<null | "won" | "cat">(null);
  const rewardIssuedRef = useRef(false);

  const size = boardSize(level);
  const need = winLength(level);
  const startTimeRef = useRef<number>(0);
  const elapsedAtPauseRef = useRef<number>(0);

  // Start the round
  const startGame = useCallback(() => {
    setPhase("playing");
    setLevel(0);
    setWins(0);
    setBoard(makeBoard(3));
    setTimeLeftMs(TIME_LIMIT_MS);
    setEndReason(null);
    setFlash(null);
    rewardIssuedRef.current = false;
    startTimeRef.current = performance.now();
    elapsedAtPauseRef.current = 0;
  }, []);

  // Reset board for next level (or same level on cat)
  const nextBoard = useCallback((nextLevel: number) => {
    setLevel(nextLevel);
    setBoard(makeBoard(boardSize(nextLevel)));
  }, []);

  // Timer
  useEffect(() => {
    if (phase !== "playing" || paused) return;
    const id = window.setInterval(() => {
      const elapsed = elapsedAtPauseRef.current + (performance.now() - startTimeRef.current);
      const left = Math.max(0, TIME_LIMIT_MS - elapsed);
      setTimeLeftMs(left);
      if (left <= 0) {
        setPhase("game_over");
        setEndReason("time");
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, paused]);

  // O drop loop
  useEffect(() => {
    if (phase !== "playing" || paused) return;
    const interval = oIntervalMs(level);
    const id = window.setInterval(() => {
      setBoard((prev) => {
        // Do nothing if there's already a winner (safety)
        if (findWinner(prev, size, need)) return prev;
        const empties = emptyIndices(prev);
        if (empties.length === 0) return prev;
        const pick = empties[Math.floor(Math.random() * empties.length)];
        const next = prev.slice();
        next[pick] = "O";
        return next;
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [phase, paused, level, size, need]);

  // Watch for winner / full board
  useEffect(() => {
    if (phase !== "playing") return;
    const w = findWinner(board, size, need);
    if (w === "X") {
      // Player wins a board
      setWins((prev) => prev + 1);
      setFlash("won");
      const nextLvl = level + 1;
      const t = window.setTimeout(() => {
        setFlash(null);
        nextBoard(nextLvl);
      }, 350);
      return () => window.clearTimeout(t);
    }
    if (w === "O") {
      setPhase("game_over");
      setEndReason("o_won");
      return;
    }
    if (isFull(board)) {
      // Cat's game — reset same size
      setFlash("cat");
      const t = window.setTimeout(() => {
        setFlash(null);
        setBoard(makeBoard(size));
      }, 350);
      return () => window.clearTimeout(t);
    }
  }, [board, phase, size, need, level, nextBoard]);

  const previousPausedRef = useRef(paused);

  // Keep the countdown exact while the app-level pause menu is open.
  useEffect(() => {
    if (phase !== "playing" || previousPausedRef.current === paused) {
      previousPausedRef.current = paused;
      return;
    }
    const now = performance.now();
    if (paused) {
      elapsedAtPauseRef.current += now - startTimeRef.current;
    } else {
      startTimeRef.current = now;
    }
    previousPausedRef.current = paused;
  }, [paused, phase]);

  const handleCellClick = useCallback((i: number) => {
    if (phase !== "playing" || paused) return;
    if (flash) return;
    setBoard((prev) => {
      if (prev[i] !== null) return prev;
      const next = prev.slice();
      next[i] = "X";
      return next;
    });
  }, [phase, paused, flash]);

  const handleContinue = useCallback(() => {
    if (rewardIssuedRef.current) return;
    rewardIssuedRef.current = true;
    const amount = wins * CASH_PER_WIN;
    const reward: FishingReward | null = amount > 0 ? { type: "cash", amount } : null;
    onComplete(reward);
  }, [wins, onComplete]);

  const seconds = useMemo(() => (timeLeftMs / 1000).toFixed(1), [timeLeftMs]);

  return (
    <div className="qtt-container">
      <div className="qtt-header">
        <div className="qtt-stat">
          <div className="qtt-stat-label">Time</div>
          <div className={`qtt-stat-value ${timeLeftMs < 5000 ? "warn" : ""}`}>{seconds}s</div>
        </div>
        <div className="qtt-stat">
          <div className="qtt-stat-label">Wins</div>
          <div className="qtt-stat-value">{wins}</div>
        </div>
        <div className="qtt-stat">
          <div className="qtt-stat-label">Board</div>
          <div className="qtt-stat-value">{size}×{size} · {need} in a row</div>
        </div>
        <button
          className="qtt-pause-btn"
          onClick={onPause}
          disabled={phase !== "playing"}
        >
          ⏸ Pause
        </button>
      </div>

      <div className="qtt-board-wrap">
        <div
          className={`qtt-board ${flash ? `qtt-flash-${flash}` : ""}`}
          style={{
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridTemplateRows: `repeat(${size}, 1fr)`,
          }}
        >
          {board.map((cell, i) => (
            <button
              key={i}
              className={`qtt-cell ${cell ? `qtt-cell-${cell.toLowerCase()}` : ""}`}
              onClick={() => handleCellClick(i)}
              disabled={cell !== null || phase !== "playing" || paused}
              aria-label={`cell ${i}`}
            >
              {cell ?? ""}
            </button>
          ))}
        </div>

        {phase === "ready" && (
          <div className="qtt-overlay">
            <div className="qtt-overlay-card">
              <h3>⚡ Quick Tac Toe</h3>
              <p>Win as many boards as you can in 30 seconds!</p>
              <ul className="qtt-rules">
                <li>Tap empty cells to drop an <strong>X</strong>.</li>
                <li>Computer drops <strong>O</strong>s randomly, faster as boards grow.</li>
                <li>Each win: board size and win-length grow by 1.</li>
                <li>Cat's game: same board resets.</li>
                <li>If O gets a line, it's over. +$5 per win.</li>
              </ul>
              <button className="qtt-btn" onClick={startGame}>Start →</button>
            </div>
          </div>
        )}


        {phase === "game_over" && (
          <div className="qtt-overlay">
            <div className="qtt-overlay-card">
              <h3>{endReason === "o_won" ? "😔 O got a line!" : "⏰ Time's up!"}</h3>
              <p>You won <strong>{wins}</strong> board{wins === 1 ? "" : "s"}.</p>
              {wins > 0 ? (
                <div className="qtt-reward">💵 +${wins * CASH_PER_WIN}</div>
              ) : (
                <p className="qtt-nowin">No prize this time.</p>
              )}
              <button className="qtt-btn" onClick={handleContinue}>Continue →</button>
            </div>
          </div>
        )}
      </div>

      {phase === "playing" && !paused && (
        <div className="qtt-hint">Esc / P to pause</div>
      )}
    </div>
  );
}
