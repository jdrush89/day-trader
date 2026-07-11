import type { GameState } from "../game/types";
import type { RestaurantState } from "../game/restaurant-types";
import type { PeerAction, Player, ActionFeedItem, GameSync, NetworkMessage } from "./types";
import { NetworkManager, generateRoomCode, getPlayerColor } from "./network";
import { buyStock, sellStock, shortStock, coverShort, placeOrder, cancelOrder, buyOption, sellOption, closeOption, togglePinStock } from "../game/engine";

const MAX_FEED_ITEMS = 20;
const SYNC_INTERVAL_MS = 100; // 10 syncs/sec

export interface HostCallbacks {
  getGameState: () => GameState;
  setGameState: (updater: (prev: GameState) => GameState) => void;
  getRestaurantState: () => RestaurantState | null;
  getEodPhase: () => string;
  getPaused: () => boolean;
  getSpeed: () => number;
  getBossDay: () => boolean;
  getBossView: () => string;
  onPlayerJoined: (player: Player) => void;
  onPlayerLeft: (playerId: string) => void;
  onViewInsider: () => void;
  onAcceptLoan: () => void;
  onDeclineLoan: () => void;
  onSetSpeed: (speed: number) => void;
  onTogglePause: () => void;
  onChooseUpgrade: (id: string) => void;
  onChooseStock: (symbol: string) => void;
  onChooseRestaurantUpgrade: (id: string) => void;
  onChooseMenuItem: (name: string) => void;
  onChangeChannel: (monitorId: number, channel: string) => void;
  onSelectStock: (monitorId: number, symbol: string) => void;
}

export class MultiplayerHost {
  private network: NetworkManager;
  private callbacks: HostCallbacks;
  private players: Map<string, Player> = new Map();
  private actionFeed: ActionFeedItem[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private _roomCode: string;

  constructor(callbacks: HostCallbacks) {
    this.callbacks = callbacks;
    this._roomCode = generateRoomCode();

    this.network = new NetworkManager({
      onMessage: (peerId, msg) => this.handleMessage(peerId, msg),
      onPeerConnected: (peerId) => this.handlePeerConnected(peerId),
      onPeerDisconnected: (peerId) => this.handlePeerDisconnected(peerId),
      onStatusChange: () => {},
      onError: (err) => console.error("[Host]", err),
    });
  }

  get roomCode() { return this._roomCode; }
  get playerList() { return Array.from(this.players.values()); }
  get feed() { return this.actionFeed; }

  async start(): Promise<string> {
    await this.network.hostRoom(this._roomCode);
    this.startSyncLoop();
    return this._roomCode;
  }

  stop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.network.disconnect();
    this.players.clear();
  }

  private startSyncLoop(): void {
    this.syncTimer = setInterval(() => {
      this.broadcastState();
    }, SYNC_INTERVAL_MS);
  }

  private broadcastState(): void {
    const sync: GameSync = {
      type: "game_sync",
      gameState: this.callbacks.getGameState(),
      restaurantState: this.callbacks.getRestaurantState(),
      eodPhase: this.callbacks.getEodPhase(),
      paused: this.callbacks.getPaused(),
      speed: this.callbacks.getSpeed(),
      bossDay: this.callbacks.getBossDay(),
      bossView: this.callbacks.getBossView(),
      players: this.playerList,
      recentActions: this.actionFeed.slice(0, 5),
    };
    this.network.broadcast(sync);
  }

  private handlePeerConnected(_peerId: string): void {
    // Peer connected but hasn't sent join request yet
  }

  private handlePeerDisconnected(peerId: string): void {
    const player = this.players.get(peerId);
    if (player) {
      this.players.delete(peerId);
      this.callbacks.onPlayerLeft(peerId);
      this.network.broadcast({ type: "player_left", playerId: peerId });
      this.addFeedItem(peerId, player.name, `${player.name} disconnected`);
    }
  }

  private handleMessage(peerId: string, msg: NetworkMessage): void {
    // Handle join request
    if ("type" in msg && msg.type === "join_request") {
      const { playerName } = msg as { type: "join_request"; playerName: string };
      const color = getPlayerColor(this.players.size + 1); // +1 for host
      const player: Player = { id: peerId, name: playerName, color };
      this.players.set(peerId, player);
      this.callbacks.onPlayerJoined(player);

      this.network.send(peerId, {
        type: "join_accepted",
        player,
        players: this.playerList,
        roomCode: this._roomCode,
      });

      this.network.broadcast({ type: "player_joined", player });
      this.addFeedItem(peerId, playerName, `${playerName} joined the game`);
      return;
    }

    // Handle game actions
    const player = this.players.get(peerId);
    if (!player) return;

    this.processAction(player, msg as PeerAction);
  }

  private processAction(player: Player, action: PeerAction): void {
    switch (action.type) {
      case "buy_stock":
        this.callbacks.setGameState((s) => buyStock(s, action.symbol, action.shares));
        this.addFeedItem(player.id, player.name, `Bought ${action.shares} ${action.symbol}`);
        break;
      case "sell_stock":
        this.callbacks.setGameState((s) => sellStock(s, action.symbol, action.shares));
        this.addFeedItem(player.id, player.name, `Sold ${action.shares} ${action.symbol}`);
        break;
      case "short_stock":
        this.callbacks.setGameState((s) => shortStock(s, action.symbol, action.shares));
        this.addFeedItem(player.id, player.name, `Shorted ${action.shares} ${action.symbol}`);
        break;
      case "cover_short":
        this.callbacks.setGameState((s) => coverShort(s, action.symbol, action.shares));
        this.addFeedItem(player.id, player.name, `Covered ${action.shares} ${action.symbol}`);
        break;
      case "place_order":
        this.callbacks.setGameState((s) => placeOrder(s, action.symbol, action.side, action.shares, action.orderType, action.limitPrice, action.stopPrice));
        this.addFeedItem(player.id, player.name, `Placed ${action.orderType} ${action.side} on ${action.symbol}`);
        break;
      case "cancel_order":
        this.callbacks.setGameState((s) => cancelOrder(s, action.orderId));
        break;
      case "buy_option":
        this.callbacks.setGameState((s) => buyOption(s, action.symbol, action.optionType, action.strikePrice, action.expirationDays, action.contracts));
        this.addFeedItem(player.id, player.name, `Bought ${action.contracts} ${action.symbol} ${action.optionType}s`);
        break;
      case "sell_option":
        this.callbacks.setGameState((s) => sellOption(s, action.symbol, action.optionType, action.strikePrice, action.expirationDays, action.contracts));
        this.addFeedItem(player.id, player.name, `Sold ${action.contracts} ${action.symbol} ${action.optionType}s`);
        break;
      case "close_option":
        this.callbacks.setGameState((s) => closeOption(s, action.optionId));
        this.addFeedItem(player.id, player.name, `Closed an option`);
        break;
      case "pin_stock":
        this.callbacks.setGameState((s) => togglePinStock(s, action.symbol));
        break;
      case "change_channel":
        this.callbacks.onChangeChannel(action.monitorId, action.channel);
        break;
      case "select_stock":
        this.callbacks.onSelectStock(action.monitorId, action.symbol);
        break;
      case "view_insider":
        this.callbacks.onViewInsider();
        break;
      case "accept_loan":
        this.callbacks.onAcceptLoan();
        break;
      case "decline_loan":
        this.callbacks.onDeclineLoan();
        break;
      case "set_speed":
        this.callbacks.onSetSpeed(action.speed);
        break;
      case "toggle_pause":
        this.callbacks.onTogglePause();
        break;
      case "choose_upgrade":
        this.callbacks.onChooseUpgrade(action.upgradeId);
        break;
      case "choose_stock":
        this.callbacks.onChooseStock(action.symbol);
        break;
      case "choose_restaurant_upgrade":
        this.callbacks.onChooseRestaurantUpgrade(action.upgradeId);
        break;
      case "choose_menu_item":
        this.callbacks.onChooseMenuItem(action.itemName);
        break;
      case "claim_order":
        // Restaurant order claiming — just forward as key press for now
        // The host handles restaurant state locally
        break;
      case "restaurant_key":
        // Peer sent a key press for restaurant mini-game
        // TODO: forward to restaurant engine
        break;
      case "restaurant_mouse":
        // Peer mouse movement for restaurant mixing
        break;
    }
  }

  private addFeedItem(playerId: string, playerName: string, description: string): void {
    this.actionFeed.unshift({ playerId, playerName, description, timestamp: Date.now() });
    if (this.actionFeed.length > MAX_FEED_ITEMS) this.actionFeed.pop();
    this.network.broadcast({ type: "action_feed", item: this.actionFeed[0] });
  }
}
