import type { GameState, OrderSide, OrderType } from "../game/types";
import type { RestaurantState } from "../game/restaurant-types";

// --- Player identity ---

export interface Player {
  id: string; // PeerJS peer ID
  name: string;
  color: string; // for trade attribution UI
}

// --- Actions sent from peer → host ---

export type PeerAction =
  | { type: "join_request"; playerName: string }
  | { type: "buy_stock"; symbol: string; shares: number }
  | { type: "sell_stock"; symbol: string; shares: number }
  | { type: "short_stock"; symbol: string; shares: number }
  | { type: "cover_short"; symbol: string; shares: number }
  | { type: "place_order"; symbol: string; side: OrderSide; shares: number; orderType: OrderType; limitPrice?: number; stopPrice?: number }
  | { type: "cancel_order"; orderId: string }
  | { type: "buy_option"; symbol: string; optionType: "call" | "put"; strikePrice: number; expirationDays: number; contracts: number }
  | { type: "sell_option"; symbol: string; optionType: "call" | "put"; strikePrice: number; expirationDays: number; contracts: number }
  | { type: "close_option"; optionId: string }
  | { type: "change_channel"; monitorId: number; channel: string }
  | { type: "select_stock"; monitorId: number; symbol: string }
  | { type: "pin_stock"; symbol: string }
  | { type: "claim_order"; slotIndex: number }
  | { type: "switch_counter"; counter: number }
  | { type: "restaurant_key"; key: string }
  | { type: "restaurant_key_up"; key: string }
  | { type: "restaurant_mouse"; x: number; y: number }
  | { type: "choose_upgrade"; upgradeId: string }
  | { type: "choose_stock"; symbol: string }
  | { type: "choose_restaurant_upgrade"; upgradeId: string }
  | { type: "choose_menu_item"; itemName: string }
  | { type: "accept_loan" }
  | { type: "decline_loan" }
  | { type: "dismiss_transition" }
  | { type: "dismiss_challenge_intro" }
  | { type: "resume_ready" }
  | { type: "set_speed"; speed: number }
  | { type: "toggle_pause" }
  | { type: "view_insider" }
  | { type: "use_consumable"; consumableId: string }
  | { type: "buy_consumable"; consumableId: string };

// --- Messages sent from host → peer ---

export interface GameSync {
  type: "game_sync";
  gameState: GameState;
  restaurantState: RestaurantState | null;
  eodPhase: string;
  paused: boolean;
  speed: number;
  bossDay: boolean;
  bossView: string;
  showTransition: string | null;
  showChallengeIntro: string | null;
  showLoanOffer: { amount: number; interestRate: number; dueDay: number; isEmergency: boolean } | null;
  players: Player[];
  recentActions: ActionFeedItem[];
  playerActiveOrders?: Record<string, number | null>; // playerId → their active order ID
  playerSaves?: Array<{ name: string; upgrades: string[]; restaurantUpgrades: string[] }>; // for resume sync
  mpSaveId?: string; // save ID for this game run
}

export interface ActionFeedItem {
  playerId: string;
  playerName: string;
  description: string;
  timestamp: number;
}

export type HostMessage =
  | GameSync
  | { type: "player_joined"; player: Player }
  | { type: "player_left"; playerId: string }
  | { type: "action_feed"; item: ActionFeedItem }
  | { type: "lobby_state"; players: Player[]; hostName: string; roomCode: string }
  | { type: "game_start" }
  | { type: "join_accepted"; player: Player; players: Player[]; roomCode: string }
  | { type: "join_rejected"; reason: string }
  | { type: "error"; message: string }
  | { type: "eod_waiting"; waitingFor: string[] }  // players who haven't chosen yet
  | { type: "eod_all_ready" };  // all players have made their choice, proceeding

// Union of all messages
export type NetworkMessage = PeerAction | HostMessage;
