export type CasinoStage = "blackjack" | "slots" | "roulette" | "summary";
export type CasinoGame = Exclude<CasinoStage, "summary">;

export interface Card {
  rank: string;
  suit: "♠" | "♥" | "♦" | "♣";
  value: number;
}

export interface BlackjackState {
  phase: "betting" | "player_turn" | "result";
  bet: number;
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  outcome: "win" | "lose" | "push" | "skipped" | null;
  netChange: number;
  message: string;
}

export interface SlotsState {
  phase: "betting" | "result";
  bet: number;
  grid: string[][];
  matchingRows: number[];
  matchingDiagonals: Array<"main" | "anti">;
  payoutMultiplier: number;
  netChange: number;
  message: string;
  outcome: "win" | "lose" | "skipped" | null;
}

export type RouletteBetType = "red" | "black" | "odd" | "even" | "dozen1" | "dozen2" | "dozen3" | "single";
export type RouletteColor = "red" | "black" | "green";

export interface RouletteState {
  phase: "betting" | "result";
  bet: number;
  betType: RouletteBetType;
  singleNumber: number;
  resultNumber: number | null;
  resultColor: RouletteColor | null;
  outcome: "win" | "lose" | "skipped" | null;
  payoutRatio: number;
  netChange: number;
  message: string;
}

export interface CasinoState {
  stage: CasinoStage;
  maxBet: number;
  totalNetChange: number;
  blackjack: BlackjackState;
  slots: SlotsState;
  roulette: RouletteState;
}

const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "💎", "⭐", "🍀"];
const SUITS: Card["suit"][] = ["♠", "♥", "♦", "♣"];
const RANKS = [
  { rank: "A", value: 11 },
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 10 },
  { rank: "Q", value: 10 },
  { rank: "K", value: 10 },
] as const;
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function sanitizeBet(bet: number, maxBet: number): number {
  if (maxBet <= 0) return 0;
  const clamped = Math.max(0, Math.min(maxBet, bet));
  return Math.floor(clamped / 10) * 10;
}

function createEmptyGrid(): string[][] {
  return Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => "❔"));
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const { rank, value } of RANKS) {
      deck.push({ rank, suit, value });
    }
  }
  return shuffle(deck);
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function drawCard(deck: Card[]): { card: Card; deck: Card[] } {
  const [card, ...rest] = deck;
  return { card, deck: rest };
}

export function getCardLabel(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function getBlackjackValue(hand: Card[]): number {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter((card) => card.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function settleBlackjackOutcome(bet: number, playerHand: Card[], dealerHand: Card[]): Pick<BlackjackState, "outcome" | "netChange" | "message"> {
  const playerValue = getBlackjackValue(playerHand);
  const dealerValue = getBlackjackValue(dealerHand);

  if (playerValue > 21) {
    return { outcome: "lose", netChange: -bet, message: "Bust. The house scoops your chips." };
  }
  if (dealerValue > 21) {
    return { outcome: "win", netChange: bet, message: "Dealer busts. You double your bet." };
  }
  if (playerValue > dealerValue) {
    return { outcome: "win", netChange: bet, message: "You beat the dealer and double your bet." };
  }
  if (dealerValue > playerValue) {
    return { outcome: "lose", netChange: -bet, message: "Dealer wins. You lose the bid." };
  }
  return { outcome: "push", netChange: 0, message: "Push. Your chips come right back." };
}

function finishBlackjack(state: CasinoState, blackjack: BlackjackState): CasinoState {
  return {
    ...state,
    blackjack,
    totalNetChange: roundMoney(state.totalNetChange + blackjack.netChange),
  };
}

function finishSlots(state: CasinoState, slots: SlotsState): CasinoState {
  return {
    ...state,
    slots,
    totalNetChange: roundMoney(state.totalNetChange + slots.netChange),
  };
}

function finishRoulette(state: CasinoState, roulette: RouletteState): CasinoState {
  return {
    ...state,
    roulette,
    totalNetChange: roundMoney(state.totalNetChange + roulette.netChange),
  };
}

export function getCasinoMaxBet(netWorth: number): number {
  if (netWorth <= 0) return 0;
  return Math.max(0, Math.floor((netWorth * 0.15) / 10) * 10);
}

export function createCasinoState(netWorth: number): CasinoState {
  const maxBet = getCasinoMaxBet(netWorth);
  return {
    stage: "blackjack",
    maxBet,
    totalNetChange: 0,
    blackjack: {
      phase: "betting",
      bet: 0,
      deck: [],
      playerHand: [],
      dealerHand: [],
      outcome: null,
      netChange: 0,
      message: "",
    },
    slots: {
      phase: "betting",
      bet: 0,
      grid: createEmptyGrid(),
      matchingRows: [],
      matchingDiagonals: [],
      payoutMultiplier: 0,
      netChange: 0,
      message: "",
      outcome: null,
    },
    roulette: {
      phase: "betting",
      bet: 0,
      betType: "red",
      singleNumber: 7,
      resultNumber: null,
      resultColor: null,
      outcome: null,
      payoutRatio: 0,
      netChange: 0,
      message: "",
    },
  };
}

export function setCasinoBet(state: CasinoState, bet: number): CasinoState {
  const sanitized = sanitizeBet(bet, state.maxBet);
  if (state.stage === "blackjack" && state.blackjack.phase === "betting") {
    return { ...state, blackjack: { ...state.blackjack, bet: sanitized } };
  }
  if (state.stage === "slots" && state.slots.phase === "betting") {
    return { ...state, slots: { ...state.slots, bet: sanitized } };
  }
  if (state.stage === "roulette" && state.roulette.phase === "betting") {
    return { ...state, roulette: { ...state.roulette, bet: sanitized } };
  }
  return state;
}

export function startBlackjack(state: CasinoState): CasinoState {
  if (state.stage !== "blackjack" || state.blackjack.phase !== "betting") return state;
  const bet = sanitizeBet(state.blackjack.bet, state.maxBet);
  if (bet <= 0) {
    return finishBlackjack(state, {
      ...state.blackjack,
      bet: 0,
      phase: "result",
      outcome: "skipped",
      netChange: 0,
      message: "You pocketed your chips and skipped blackjack.",
    });
  }

  let deck = buildDeck();
  const firstPlayer = drawCard(deck);
  deck = firstPlayer.deck;
  const firstDealer = drawCard(deck);
  deck = firstDealer.deck;
  const secondPlayer = drawCard(deck);
  deck = secondPlayer.deck;
  const secondDealer = drawCard(deck);
  deck = secondDealer.deck;

  const playerHand = [firstPlayer.card, secondPlayer.card];
  const dealerHand = [firstDealer.card, secondDealer.card];
  const playerValue = getBlackjackValue(playerHand);
  const dealerValue = getBlackjackValue(dealerHand);

  const nextBlackjack: BlackjackState = {
    ...state.blackjack,
    bet,
    deck,
    playerHand,
    dealerHand,
    phase: "player_turn",
    outcome: null,
    netChange: 0,
    message: "Hit or stand?",
  };

  if (playerValue === 21 || dealerValue === 21) {
    const settled = settleBlackjackOutcome(bet, playerHand, dealerHand);
    return finishBlackjack(state, {
      ...nextBlackjack,
      phase: "result",
      ...settled,
    });
  }

  return { ...state, blackjack: nextBlackjack };
}

export function blackjackHit(state: CasinoState): CasinoState {
  if (state.stage !== "blackjack" || state.blackjack.phase !== "player_turn") return state;
  let deck = state.blackjack.deck;
  const draw = drawCard(deck);
  deck = draw.deck;
  const playerHand = [...state.blackjack.playerHand, draw.card];
  const playerValue = getBlackjackValue(playerHand);

  if (playerValue >= 21) {
    return blackjackStand({
      ...state,
      blackjack: {
        ...state.blackjack,
        deck,
        playerHand,
      },
    });
  }

  return {
    ...state,
    blackjack: {
      ...state.blackjack,
      deck,
      playerHand,
      message: "Hit or stand?",
    },
  };
}

export function blackjackStand(state: CasinoState): CasinoState {
  if (state.stage !== "blackjack" || state.blackjack.phase !== "player_turn") return state;
  let deck = state.blackjack.deck;
  const playerHand = state.blackjack.playerHand;
  const dealerHand = [...state.blackjack.dealerHand];

  while (getBlackjackValue(dealerHand) <= 16) {
    const draw = drawCard(deck);
    deck = draw.deck;
    dealerHand.push(draw.card);
  }

  const settled = settleBlackjackOutcome(state.blackjack.bet, playerHand, dealerHand);
  return finishBlackjack(state, {
    ...state.blackjack,
    deck,
    playerHand,
    dealerHand,
    phase: "result",
    ...settled,
  });
}

export function spinSlots(state: CasinoState): CasinoState {
  if (state.stage !== "slots" || state.slots.phase !== "betting") return state;
  const bet = sanitizeBet(state.slots.bet, state.maxBet);
  if (bet <= 0) {
    return finishSlots(state, {
      ...state.slots,
      bet: 0,
      phase: "result",
      outcome: "skipped",
      netChange: 0,
      payoutMultiplier: 0,
      matchingRows: [],
      matchingDiagonals: [],
      message: "You let the slot machine sit this round.",
    });
  }

  const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]));
  const matchingRows = grid
    .map((row, index) => (row.every((symbol) => symbol === row[0]) ? index : -1))
    .filter((index) => index >= 0);
  const matchingDiagonals: Array<"main" | "anti"> = [];
  if (grid[0][0] === grid[1][1] && grid[1][1] === grid[2][2]) matchingDiagonals.push("main");
  if (grid[0][2] === grid[1][1] && grid[1][1] === grid[2][0]) matchingDiagonals.push("anti");

  let payoutMultiplier = 0;
  let netChange = -bet;
  let message = "No lines. The house wins this spin.";
  let outcome: SlotsState["outcome"] = "lose";

  if (matchingRows.length === 3) {
    payoutMultiplier = 3;
    netChange = bet * 2;
    message = "All three rows matched! Triple payout lights up the board.";
    outcome = "win";
  } else if (matchingRows.length >= 1) {
    payoutMultiplier = 2;
    netChange = bet;
    message = "A row matched! You snag a double payout.";
    outcome = "win";
  } else if (matchingDiagonals.length > 0) {
    payoutMultiplier = 1.5;
    netChange = bet * 0.5;
    message = "Diagonal hit! A cheeky 1.5x payout lands.";
    outcome = "win";
  }

  return finishSlots(state, {
    ...state.slots,
    bet,
    phase: "result",
    grid,
    matchingRows,
    matchingDiagonals,
    payoutMultiplier,
    netChange: roundMoney(netChange),
    message,
    outcome,
  });
}

export function setRouletteBetType(state: CasinoState, betType: RouletteBetType): CasinoState {
  if (state.stage !== "roulette" || state.roulette.phase !== "betting") return state;
  return { ...state, roulette: { ...state.roulette, betType } };
}

export function setRouletteSingleNumber(state: CasinoState, singleNumber: number): CasinoState {
  if (state.stage !== "roulette" || state.roulette.phase !== "betting") return state;
  const clamped = Math.max(0, Math.min(36, Math.round(singleNumber)));
  return { ...state, roulette: { ...state.roulette, singleNumber: clamped } };
}

export function getRouletteColor(number: number): RouletteColor {
  if (number === 0) return "green";
  return RED_NUMBERS.has(number) ? "red" : "black";
}

export function getRouletteBetLabel(roulette: RouletteState): string {
  switch (roulette.betType) {
    case "red":
      return "Red";
    case "black":
      return "Black";
    case "odd":
      return "Odd";
    case "even":
      return "Even";
    case "dozen1":
      return "1st Dozen (1-12)";
    case "dozen2":
      return "2nd Dozen (13-24)";
    case "dozen3":
      return "3rd Dozen (25-36)";
    case "single":
      return `Single ${roulette.singleNumber}`;
  }
}

function rouletteWin(roulette: RouletteState, number: number, color: RouletteColor): { won: boolean; payoutRatio: number } {
  switch (roulette.betType) {
    case "single":
      return { won: roulette.singleNumber === number, payoutRatio: 35 };
    case "red":
      return { won: color === "red", payoutRatio: 1 };
    case "black":
      return { won: color === "black", payoutRatio: 1 };
    case "odd":
      return { won: number !== 0 && number % 2 === 1, payoutRatio: 1 };
    case "even":
      return { won: number !== 0 && number % 2 === 0, payoutRatio: 1 };
    case "dozen1":
      return { won: number >= 1 && number <= 12, payoutRatio: 2 };
    case "dozen2":
      return { won: number >= 13 && number <= 24, payoutRatio: 2 };
    case "dozen3":
      return { won: number >= 25 && number <= 36, payoutRatio: 2 };
  }
}

export function spinRoulette(state: CasinoState): CasinoState {
  if (state.stage !== "roulette" || state.roulette.phase !== "betting") return state;
  const bet = sanitizeBet(state.roulette.bet, state.maxBet);
  if (bet <= 0) {
    return finishRoulette(state, {
      ...state.roulette,
      bet: 0,
      phase: "result",
      outcome: "skipped",
      resultNumber: null,
      resultColor: null,
      payoutRatio: 0,
      netChange: 0,
      message: "You stepped away before placing a roulette bet.",
    });
  }

  const resultNumber = Math.floor(Math.random() * 37);
  const resultColor = getRouletteColor(resultNumber);
  const { won, payoutRatio } = rouletteWin(state.roulette, resultNumber, resultColor);
  const netChange = won ? roundMoney(bet * payoutRatio) : -bet;
  const label = getRouletteBetLabel(state.roulette);
  const message = won
    ? `The wheel lands on ${resultNumber}. ${label} hits for ${payoutRatio}:1.`
    : `The wheel lands on ${resultNumber}. ${label} misses.`;

  return finishRoulette(state, {
    ...state.roulette,
    bet,
    phase: "result",
    resultNumber,
    resultColor,
    outcome: won ? "win" : "lose",
    payoutRatio,
    netChange,
    message,
  });
}

export function advanceCasino(state: CasinoState): CasinoState {
  if (state.stage === "blackjack" && state.blackjack.phase === "result") {
    return { ...state, stage: "slots" };
  }
  if (state.stage === "slots" && state.slots.phase === "result") {
    return { ...state, stage: "roulette" };
  }
  if (state.stage === "roulette" && state.roulette.phase === "result") {
    return { ...state, stage: "summary" };
  }
  return state;
}
