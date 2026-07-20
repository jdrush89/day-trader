import { useCallback, useState } from "react";
import {
  advanceCasino,
  blackjackHit,
  blackjackStand,
  createCasinoState,
  getBlackjackValue,
  getCardLabel,
  getCasinoMaxBet,
  getRouletteBetLabel,
  setCasinoBet,
  setRouletteBetType,
  setRouletteSingleNumber,
  spinRoulette,
  spinSlots,
  startBlackjack,
  type CasinoState,
  type RouletteBetType,
} from "../game/casino";

interface CasinoProps {
  netWorth: number;
  onComplete: (netChange: number) => void;
}

const ROULETTE_OPTIONS: Array<{ value: RouletteBetType; label: string }> = [
  { value: "red", label: "Red (1:1)" },
  { value: "black", label: "Black (1:1)" },
  { value: "odd", label: "Odd (1:1)" },
  { value: "even", label: "Even (1:1)" },
  { value: "dozen1", label: "1st Dozen 1-12 (2:1)" },
  { value: "dozen2", label: "2nd Dozen 13-24 (2:1)" },
  { value: "dozen3", label: "3rd Dozen 25-36 (2:1)" },
  { value: "single", label: "Single Number (35:1)" },
];

export function Casino({ netWorth, onComplete }: CasinoProps) {
  const [state, setState] = useState<CasinoState>(() => createCasinoState(netWorth));
  const maxBet = getCasinoMaxBet(netWorth);

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
            onTypeChange={(betType) => setState((prev) => setRouletteBetType(prev, betType))}
            onNumberChange={(value) => setState((prev) => setRouletteSingleNumber(prev, value))}
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
  return (
    <div className="casino-game-card">
      <h3>🎰 Slots</h3>
      <p className="casino-game-copy">Match a row for 2x, all rows for 3x, or sneak in a diagonal-only 1.5x.</p>
      <div className="casino-slots-grid">
        {slots.grid.map((row, rowIndex) => row.map((symbol, colIndex) => {
          const rowMatch = slots.matchingRows.includes(rowIndex);
          const mainDiag = slots.matchingDiagonals.includes("main") && rowIndex === colIndex;
          const antiDiag = slots.matchingDiagonals.includes("anti") && rowIndex + colIndex === 2;
          return (
            <div key={`${rowIndex}-${colIndex}`} className={`casino-slot-cell${rowMatch || mainDiag || antiDiag ? " is-winning" : ""}`}>
              {symbol}
            </div>
          );
        }))}
      </div>
      {slots.phase === "betting" ? (
        <button className="casino-action-btn" onClick={onSpin}>{slots.bet > 0 ? "Spin Reels" : "Skip Slots"}</button>
      ) : (
        <>
          <div className="casino-result-copy">{slots.message}</div>
          <div className="casino-result-amount">Result: <strong className={slots.netChange >= 0 ? "casino-positive" : "casino-negative"}>{formatMoney(slots.netChange)}</strong></div>
          <button className="casino-action-btn casino-continue-btn" onClick={onContinue}>To Roulette →</button>
        </>
      )}
    </div>
  );
}

function RouletteView({ state, onTypeChange, onNumberChange, onSpin, onContinue, formatMoney }: { state: CasinoState; onTypeChange: (betType: RouletteBetType) => void; onNumberChange: (value: number) => void; onSpin: () => void; onContinue: () => void; formatMoney: (amount: number) => string; }) {
  const roulette = state.roulette;
  return (
    <div className="casino-game-card">
      <h3>🎡 Roulette</h3>
      <p className="casino-game-copy">Pick your lane: even-money colors/parity, a dozen, or chase a 35:1 straight-up hit.</p>
      {roulette.phase === "betting" && (
        <div className="casino-roulette-controls">
          <label className="casino-field">
            <span>Bet Type</span>
            <select value={roulette.betType} onChange={(event) => onTypeChange(event.target.value as RouletteBetType)}>
              {ROULETTE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {roulette.betType === "single" && (
            <label className="casino-field">
              <span>Number</span>
              <input type="number" min={0} max={36} value={roulette.singleNumber} onChange={(event) => onNumberChange(Number(event.target.value))} />
            </label>
          )}
          <div className="casino-roulette-preview">Current bet: <strong>{getRouletteBetLabel(roulette)}</strong></div>
          <button className="casino-action-btn" onClick={onSpin}>{roulette.bet > 0 ? "Spin Wheel" : "Skip Roulette"}</button>
        </div>
      )}

      {roulette.phase === "result" && (
        <>
          <div className={`casino-roulette-wheel is-${roulette.resultColor ?? "green"}`}>
            <span className="casino-wheel-number">{roulette.resultNumber ?? "—"}</span>
            <span className="casino-wheel-color">{roulette.resultColor ?? "skip"}</span>
          </div>
          <div className="casino-result-copy">{roulette.message}</div>
          <div className="casino-result-amount">Result: <strong className={roulette.netChange >= 0 ? "casino-positive" : "casino-negative"}>{formatMoney(roulette.netChange)}</strong></div>
          <button className="casino-action-btn casino-continue-btn" onClick={onContinue}>Cash Out →</button>
        </>
      )}
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
