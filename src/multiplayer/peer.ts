import type { Player, ActionFeedItem, PeerAction, GameSync, HostMessage } from "./types";
import { NetworkManager } from "./network";

export interface PeerCallbacks {
  onStateSync: (state: GameSync) => void;
  onPlayerJoined: (player: Player) => void;
  onPlayerLeft: (playerId: string) => void;
  onActionFeed: (item: ActionFeedItem) => void;
  onGameStart: () => void;
  onLobbyState: (players: Player[], hostName: string, roomCode: string) => void;
  onJoinAccepted: (player: Player, players: Player[], roomCode: string) => void;
  onJoinRejected: (reason: string) => void;
  onDisconnected: () => void;
  onError: (error: string) => void;
  onEodWaiting: (waitingFor: string[]) => void;
  onEodAllReady: () => void;
}

export class MultiplayerPeer {
  private network: NetworkManager;
  private callbacks: PeerCallbacks;
  private _player: Player | null = null;
  private _connected = false;

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks;

    this.network = new NetworkManager({
      onMessage: (_peerId, msg) => this.handleMessage(msg as HostMessage),
      onPeerConnected: () => {},
      onPeerDisconnected: () => {
        this._connected = false;
        this.callbacks.onDisconnected();
      },
      onStatusChange: () => {},
      onError: (err) => this.callbacks.onError(err),
    });
  }

  get player() { return this._player; }
  get connected() { return this._connected; }

  async connect(roomCode: string, playerName: string): Promise<void> {
    await this.network.joinRoom(roomCode);
    this._connected = true;

    // Send join request
    this.network.sendToHost({ type: "join_request", playerName });
  }

  disconnect(): void {
    this.network.disconnect();
    this._connected = false;
    this._player = null;
  }

  // Send an action to the host
  sendAction(action: PeerAction): void {
    if (!this._connected) return;
    this.network.sendToHost(action);
  }

  // Convenience methods for common actions
  buyStock(symbol: string, shares: number): void {
    this.sendAction({ type: "buy_stock", symbol, shares });
  }

  sellStock(symbol: string, shares: number): void {
    this.sendAction({ type: "sell_stock", symbol, shares });
  }

  shortStock(symbol: string, shares: number): void {
    this.sendAction({ type: "short_stock", symbol, shares });
  }

  coverShort(symbol: string, shares: number): void {
    this.sendAction({ type: "cover_short", symbol, shares });
  }

  placeOrder(symbol: string, side: PeerAction & { type: "place_order" } extends infer T ? T extends { side: infer S } ? S : never : never, shares: number, orderType: string, limitPrice?: number, stopPrice?: number): void {
    this.sendAction({ type: "place_order", symbol, side: side as any, shares, orderType: orderType as any, limitPrice, stopPrice });
  }

  cancelOrder(orderId: string): void {
    this.sendAction({ type: "cancel_order", orderId });
  }

  changeChannel(monitorId: number, channel: string): void {
    this.sendAction({ type: "change_channel", monitorId, channel });
  }

  selectStock(monitorId: number, symbol: string): void {
    this.sendAction({ type: "select_stock", monitorId, symbol });
  }

  setSpeed(speed: number): void {
    this.sendAction({ type: "set_speed", speed });
  }

  togglePause(): void {
    this.sendAction({ type: "toggle_pause" });
  }

  viewInsider(): void {
    this.sendAction({ type: "view_insider" });
  }

  chooseUpgrade(upgradeId: string): void {
    this.sendAction({ type: "choose_upgrade", upgradeId });
  }

  chooseStock(symbol: string): void {
    this.sendAction({ type: "choose_stock", symbol });
  }

  chooseRestaurantUpgrade(upgradeId: string): void {
    this.sendAction({ type: "choose_restaurant_upgrade", upgradeId });
  }

  chooseMenuItem(itemName: string): void {
    this.sendAction({ type: "choose_menu_item", itemName });
  }

  acceptLoan(): void {
    this.sendAction({ type: "accept_loan" });
  }

  declineLoan(): void {
    this.sendAction({ type: "decline_loan" });
  }

  sendRestaurantKey(key: string): void {
    this.sendAction({ type: "restaurant_key", key });
  }

  sendRestaurantMouse(x: number, y: number): void {
    this.sendAction({ type: "restaurant_mouse", x, y });
  }

  private handleMessage(msg: HostMessage): void {
    console.log("[Peer] Received message:", msg.type);
    switch (msg.type) {
      case "game_sync":
        this.callbacks.onStateSync(msg);
        break;
      case "player_joined":
        this.callbacks.onPlayerJoined(msg.player);
        break;
      case "player_left":
        this.callbacks.onPlayerLeft(msg.playerId);
        break;
      case "action_feed":
        this.callbacks.onActionFeed(msg.item);
        break;
      case "game_start":
        this.callbacks.onGameStart();
        break;
      case "lobby_state":
        this.callbacks.onLobbyState(msg.players, msg.hostName, msg.roomCode);
        break;
      case "join_accepted":
        this._player = (msg as any).player;
        this.callbacks.onJoinAccepted((msg as any).player, (msg as any).players, (msg as any).roomCode);
        break;
      case "join_rejected":
        this.callbacks.onJoinRejected((msg as any).reason);
        this.disconnect();
        break;
      case "eod_waiting":
        this.callbacks.onEodWaiting((msg as any).waitingFor);
        break;
      case "eod_all_ready":
        this.callbacks.onEodAllReady();
        break;
      case "error":
        this.callbacks.onError(msg.message);
        break;
    }
  }
}
