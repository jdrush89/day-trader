import { useCallback, useEffect, useState } from "react";
import {
  advanceCasino,
  blackjackHit,
  blackjackStand,
  createCasinoState,
  finishSlotsAnimation,
  getBlackjackValue,
  getCardLabel,
  getCasinoMaxBet,
  getRouletteBetLabel,
  getRouletteBetPositionLabel,
  getRouletteColor,
  setCasinoBet,
  spinRoulette,
  spinSlots,
  startBlackjack,
  toggleRouletteBet,
  type CasinoState,
  type RouletteBetType,
} from "../game/casino";

interface CasinoProps {
  netWorth: number;
  onComplete: (netChange: number) => void;
}

const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "💎", "⭐", "🍀"];
const ROULETTE_NUMBER_ROWS = Array.from({ length: 12 }, (_, rowIndex) => [rowIndex * 3 + 1, rowIndex * 3 + 2, rowIndex * 3 + 3]);
const ROULETTE_DOZEN_BETS: Array<{ type: RouletteBetType; label: string }> = [
  { type: "dozen1", label: "1st 12" },
  { type: "dozen2", label: "2nd 12" },
  { type: "dozen3", label: "3rd 12" },
];
const ROULETTE_OUTSIDE_BETS: Array<{ type: RouletteBetType; label: string }> = [
  { type: "half1", label: "1-18" },
  { type: "even", label: "Even" },
  { type: "red", label: "Red" },
  { type: "black", label: "Black" },
  { type: "odd", label: "Odd" },
  { type: "half2", label: "19-36" },
];

function createRandomSlotsGrid(): string[][] {
  return Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]));
}

function isRouletteBetSelected(state: CasinoState["roulette"], betType: RouletteBetType, number?: number): boolean {
  return state.bets.some((bet) => bet.type === betType && bet.number === number);
}

function getRouletteCellStatus(state: CasinoState["roulette"], betType: RouletteBetType, number?: number): "win" | "lose" | null {
  const resolvedBet = state.resolvedBets.find((bet) => bet.type === betType && bet.number === number);
  if (!resolvedBet) return null;
  return resolvedBet.won ? "win" : "lose";
}

export function Casino({ netWorth, onComplete }: CasinoProps) {
  const [state, setState] = useState<CasinoState>(() => createCasinoState(netWorth));
  const maxBet = getCasinoMaxBet(netWorth);

  useEffect(() => {
    if (state.stage !== "slots" || state.slots.phase !== "spinning") return undefined;
    const timeoutId = window.setTimeout(() => {
      setState((prev) => finishSlotsAnimation(prev));
    }, 2000);
    return () => window.clearTimeout(timeoutId);
  }, [state.stage, state.slots.phase]);

  const formatMoney = useCallback((amount: number) => {
    const prefix = amount >= 0 ? "+" : "-";
    return `${prefix}$${Math.abs(amount).toFixed(2)}`;
  }, []);

  const handleBetChange = useCallback((value: number) => {
    setState((prev) => setCasinoBet(prev, value));
  }, []);

  const handleAdvance = useCallback(() => {
    setState((prev) => advanceCasino(prev));
  }, []);

  const currentBet = state.stage === "blackjack"
    ? state.blackjack.bet
    : state.stage === "slots"
      ? state.slots.bet
      : state.stage === "roulette"
        ? state.roulette.bet
        : 0;

  return (
    <div className="casino-container">
      <div className="casino-header">
        <h2>🎰 Casino Night</h2>
        <p className="casino-subtitle">Three quick tables: blackjack, slots, then roulette.</p>
        <div className="casino-stats">
          <div><span>Net Worth:</span> <strong>${netWorth.toFixed(2)}</strong></div>
          <div><span>Max Bet:</span> <strong>${maxBet.toFixed(2)}</strong></div>
          <div><span>Running Total:</span> <strong className={state.totalNetChange >= 0 ? "casino-positive" : "casino-negative"}>{formatMoney(state.totalNetChange)}</strong></div>
        </div>
        <div className="casino-progress">
          {[
            { key: "blackjack", label: "🃏 Blackjack" },
            { key: "slots", label: "🎰 Slots" },
            { key: "roulette", label: "🎡 Roulette" },
          ].map((step, index) => {
            const stages = ["blackjack", "slots", "roulette", "summary"] as const;
            const currentIndex = stages.indexOf(state.stage);
            const stepIndex = index;
            const complete = currentIndex > stepIndex;
            const active = currentIndex === stepIndex;
            return (
              <div key={step.key} className={`casino-progress-step${complete ? " is-complete" : ""}${active ? " is-active" : ""}`}>
                {step.label}
              </div>
            );
          })}
        </div>
      </div>

      {state.stage !== "summary" && (
        <BetPanel
          bet={currentBet}
          maxBet={state.maxBet}
          disabled={state.stage === "blackjack" ? state.blackjack.phase !== "betting" : state.stage === "slots" ? state.slots.phase !== "betting" : state.roulette.phase !== "betting"}
          onChange={handleBetChange}
        />
      )}

      <div className="casino-body">
        {state.stage === "blackjack" && (
          <BlackjackView
            state={state}
            onDeal={() => setState((prev) => startBlackjack(prev))}
            onHit={() => setState((prev) => blackjackHit(prev))}
            onStand={() => setState((prev) => blackjackStand(prev))}
            onContinue={handleAdvance}
          />
        )}

        {state.stage === "slots" && (
          <SlotsView
            state={state}
            onSpin={() => setState((prev) => spinSlots(prev))}
            onContinue={handleAdvance}
            formatMoney={formatMoney}
          />
        )}

        {state.stage === "roulette" && (
          <RouletteView
            state={state}
            onToggleBet={(betType, number) => setState((prev) => toggleRouletteBet(prev, betType, number))}
            onSpin={() => setState((prev) => spinRoulette(prev))}
            onContinue={handleAdvance}
            formatMoney={formatMoney}
          />
        )}

        {state.stage === "summary" && (
          <div className="casino-summary">
            <h3>🏁 Cash Out</h3>
            <div className="casino-summary-grid">
              <SummaryCard title="Blackjack" message={state.blackjack.message} amount={state.blackjack.netChange} formatMoney={formatMoney} />
              <SummaryCard title="Slots" message={state.slots.message} amount={state.slots.netChange} formatMoney={formatMoney} />
              <SummaryCard title="Roulette" message={state.roulette.message} amount={state.roulette.netChange} formatMoney={formatMoney} />
            </div>
            <div className="casino-final-total">
              Final change: <strong className={state.totalNetChange >= 0 ? "casino-positive" : "casino-negative"}>{formatMoney(state.totalNetChange)}</strong>
            </div>
            <button className="casino-action-btn casino-continue-btn" onClick={() => onComplete(state.totalNetChange)}>
              Continue →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BetPanel({ bet, maxBet, disabled, onChange }: { bet: number; maxBet: number; disabled: boolean; onChange: (value: number) => void; }) {
  return (
    <div className="casino-bet-panel">
      <div className="casino-bet-copy">
        <span>Bet: <strong>${bet.toFixed(2)}</strong></span>
        <span>Up to 15% of net worth</span>
      </div>
      <input
        className="casino-bet-slider"
        type="range"
        min={0}
        max={maxBet}
        step={10}
        value={Math.min(bet, maxBet)}
        disabled={disabled || maxBet <= 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {maxBet <= 0 && <div className="casino-note">Your net worth is underwater, so the casino won&apos;t extend more action tonight.</div>}
      {maxBet > 0 && <div className="casino-note">Set to $0 to skip a game.</div>}
    </div>
  );
}

function BlackjackView({ state, onDeal, onHit, onStand, onContinue }: { state: CasinoState; onDeal: () => void; onHit: () => void; onStand: () => void; onContinue: () => void; }) {
  const blackjack = state.blackjack;
  const playerValue = getBlackjackValue(blackjack.playerHand);
  const dealerCards = blackjack.phase === "player_turn"
    ? blackjack.dealerHand.map((card, index) => (index === 0 ? getCardLabel(card) : "🂠"))
    : blackjack.dealerHand.map(getCardLabel);
  const dealerValue = blackjack.phase === "player_turn"
    ? blackjack.dealerHand[0]?.value ?? 0
    : getBlackjackValue(blackjack.dealerHand);

  return (
    <div className="casino-game-card">
      <h3>🃏 Blackjack</h3>
      <p className="casino-game-copy">Standard rules: hit or stand, dealer hits on 16 and stands on 17.</p>
      {blackjack.phase === "betting" && (
        <button className="casino-action-btn" onClick={onDeal}>
          {blackjack.bet > 0 ? "Deal Cards" : "Skip Blackjack"}
        </button>
      )}

      {blackjack.phase !== "betting" && (
        <div className="casino-blackjack-table">
          <div className="casino-hand-block">
            <span className="casino-hand-label">Dealer ({dealerValue})</span>
            <div className="casino-cards">
              {dealerCards.map((card, index) => (
                <div key={`dealer-${index}-${card}`} className="casino-card">{card}</div>
              ))}
            </div>
          </div>
          <div className="casino-hand-block">
            <span className="casino-hand-label">You ({playerValue})</span>
            <div className="casino-cards">
              {blackjack.playerHand.map((card, index) => (
                <div key={`player-${index}-${card.rank}-${card.suit}`} className="casino-card">{getCardLabel(card)}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {blackjack.phase === "player_turn" && (
        <div className="casino-actions-row">
          <button className="casino-action-btn" onClick={onHit}>Hit</button>
          <button className="casino-action-btn casino-secondary-btn" onClick={onStand}>Stand</button>
        </div>
      )}

      {blackjack.phase === "result" && (
        <>
          <div className="casino-result-copy">{blackjack.message}</div>
          <button className="casino-action-btn casino-continue-btn" onClick={onContinue}>To Slots →</button>
        </>
      )}
    </div>
  );
}

function SlotsView({ state, onSpin, onContinue, formatMoney }: { state: CasinoState; onSpin: () => void; onContinue: () => void; formatMoney: (amount: number) => string; }) {
  const slots = state.slots;
  const [displayGrid, setDisplayGrid] = useState<string[][]>(slots.grid);

  useEffect(() => {
    if (slots.phase !== "spinning") {
      setDisplayGrid(slots.grid);
      return undefined;
    }

    setDisplayGrid(createRandomSlotsGrid());
    const intervalId = window.setInterval(() => {
      setDisplayGrid(createRandomSlotsGrid());
    }, 100);
    return () => window.clearInterval(intervalId);
  }, [slots.grid, slots.phase]);

  return (
    <div className="casino-game-card">
      <h3>🎰 Slots</h3>
      <p className="casino-game-copy">Match a row for 2x, all rows for 3x, or sneak in a diagonal-only 1.5x.</p>
      <div className="casino-slots-grid">
        {displayGrid.map((row, rowIndex) => row.map((symbol, colIndex) => {
          const showMatches = slots.phase === "result";
          const rowMatch = showMatches && slots.matchingRows.includes(rowIndex);
          const mainDiag = showMatches && slots.matchingDiagonals.includes("main") && rowIndex === colIndex;
          const antiDiag = showMatches && slots.matchingDiagonals.includes("anti") && rowIndex + colIndex === 2;
          return (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={`casino-slot-cell${rowMatch || mainDiag || antiDiag ? " is-winning" : ""}${slots.phase === "spinning" ? " is-spinning" : ""}`}
            >
              {symbol}
            </div>
          );
        }))}
      </div>
      {slots.phase === "betting" && (
        <button className="casino-action-btn" onClick={onSpin}>{slots.bet > 0 ? "Spin Reels" : "Skip Slots"}</button>
      )}
      {slots.phase === "spinning" && <div className="casino-result-copy">Reels spinning...</div>}
      {slots.phase === "result" && (
        <>
          <div className="casino-result-copy">{slots.message}</div>
          <div className="casino-result-amount">Result: <strong className={slots.netChange >= 0 ? "casino-positive" : "casino-negative"}>{formatMoney(slots.netChange)}</strong></div>
          <button className="casino-action-btn casino-continue-btn" onClick={onContinue}>To Roulette →</button>
        </>
      )}
    </div>
  );
}

function RouletteView({ state, onToggleBet, onSpin, onContinue, formatMoney }: { state: CasinoState; onToggleBet: (betType: RouletteBetType, number?: number) => void; onSpin: () => void; onContinue: () => void; formatMoney: (amount: number) => string; }) {
  const roulette = state.roulette;
  const selectedCount = roulette.bets.length;
  const amountPerPosition = selectedCount > 0 ? roulette.bets[0]?.amount ?? 0 : 0;
  const allocatedBet = amountPerPosition * selectedCount;
  const unallocated = Math.max(0, roulette.bet - allocatedBet);
  const bettingLocked = roulette.phase !== "betting";

  return (
    <div className="casino-game-card">
      <h3>🎡 Roulette</h3>
      <p className="casino-game-copy">Build your board by clicking the table. Your total wager is split evenly across every selected position.</p>
      <div className="casino-roulette-layout">
        <div className="roulette-table">
          <button
            type="button"
            className={`roulette-cell roulette-cell-zero is-green${isRouletteBetSelected(roulette, "single", 0) ? " is-selected" : ""}${roulette.resultNumber === 0 ? " is-winner" : ""}${getRouletteCellStatus(roulette, "single", 0) === "win" ? " is-bet-win" : ""}${getRouletteCellStatus(roulette, "single", 0) === "lose" ? " is-bet-loss" : ""}`}
            onClick={() => onToggleBet("single", 0)}
            disabled={bettingLocked}
          >
            0
          </button>
          <div className="roulette-number-grid">
            {ROULETTE_NUMBER_ROWS.flat().map((number) => {
              const color = getRouletteColor(number);
              const selected = isRouletteBetSelected(roulette, "single", number);
              const resultStatus = getRouletteCellStatus(roulette, "single", number);
              return (
                <button
                  key={number}
                  type="button"
                  className={`roulette-cell is-${color}${selected ? " is-selected" : ""}${roulette.resultNumber === number ? " is-winner" : ""}${resultStatus === "win" ? " is-bet-win" : ""}${resultStatus === "lose" ? " is-bet-loss" : ""}`}
                  onClick={() => onToggleBet("single", number)}
                  disabled={bettingLocked}
                >
                  {number}
                </button>
              );
            })}
          </div>
          <div className="roulette-outside-grid roulette-dozen-grid">
            {ROULETTE_DOZEN_BETS.map((bet) => {
              const resultStatus = getRouletteCellStatus(roulette, bet.type);
              return (
                <button
                  key={bet.type}
                  type="button"
                  className={`roulette-cell roulette-cell-outside${isRouletteBetSelected(roulette, bet.type) ? " is-selected" : ""}${resultStatus === "win" ? " is-bet-win" : ""}${resultStatus === "lose" ? " is-bet-loss" : ""}`}
                  onClick={() => onToggleBet(bet.type)}
                  disabled={bettingLocked}
                >
                  {bet.label}
                </button>
              );
            })}
          </div>
          <div className="roulette-outside-grid roulette-even-money-grid">
            {ROULETTE_OUTSIDE_BETS.map((bet) => {
              const resultStatus = getRouletteCellStatus(roulette, bet.type);
              return (
                <button
                  key={bet.type}
                  type="button"
                  className={`roulette-cell roulette-cell-outside${bet.type === "red" ? " is-red" : bet.type === "black" ? " is-black" : ""}${isRouletteBetSelected(roulette, bet.type) ? " is-selected" : ""}${resultStatus === "win" ? " is-bet-win" : ""}${resultStatus === "lose" ? " is-bet-loss" : ""}`}
                  onClick={() => onToggleBet(bet.type)}
                  disabled={bettingLocked}
                >
                  {bet.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="casino-roulette-preview">
          <div>Selected: <strong>{getRouletteBetLabel(roulette)}</strong></div>
          <div>Per position: <strong>${amountPerPosition.toFixed(2)}</strong>{unallocated > 0 ? <span> • ${unallocated.toFixed(2)} unallocated</span> : null}</div>
        </div>

        {roulette.phase === "betting" && (
          <button className="casino-action-btn" onClick={onSpin} disabled={roulette.bet > 0 && selectedCount === 0}>
            {roulette.bet > 0 ? "Spin Wheel" : "Skip Roulette"}
          </button>
        )}

        {roulette.phase === "result" && (
          <>
            <div className={`casino-roulette-wheel is-${roulette.resultColor ?? "green"}`}>
              <span className="casino-wheel-number">{roulette.resultNumber ?? "—"}</span>
              <span className="casino-wheel-color">{roulette.resultColor ?? "skip"}</span>
            </div>
            <div className="casino-result-copy">{roulette.message}</div>
            <div className="casino-result-amount">Result: <strong className={roulette.netChange >= 0 ? "casino-positive" : "casino-negative"}>{formatMoney(roulette.netChange)}</strong></div>
            {roulette.resolvedBets.length > 0 && (
              <div className="casino-roulette-bets">
                {roulette.resolvedBets.map((bet) => (
                  <div key={`${bet.type}-${bet.number ?? "outside"}`} className={`casino-roulette-bet${bet.won ? " is-win" : " is-loss"}`}>
                    <span>{getRouletteBetPositionLabel(bet)} • ${bet.amount.toFixed(2)}</span>
                    <strong className="casino-roulette-bet-status">{bet.won ? "Won" : "Lost"} {formatMoney(bet.netChange)}</strong>
                  </div>
                ))}
              </div>
            )}
            <button className="casino-action-btn casino-continue-btn" onClick={onContinue}>Cash Out →</button>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ title, message, amount, formatMoney }: { title: string; message: string; amount: number; formatMoney: (amount: number) => string; }) {
  return (
    <div className="casino-summary-card">
      <h4>{title}</h4>
      <p>{message}</p>
      <strong className={amount >= 0 ? "casino-positive" : "casino-negative"}>{formatMoney(amount)}</strong>
    </div>
  );
}
