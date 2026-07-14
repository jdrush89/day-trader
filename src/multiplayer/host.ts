import type { GameState } from "../game/types";
import type { RestaurantState } from "../game/restaurant-types";
import type { PeerAction, Player, ActionFeedItem, GameSync, NetworkMessage } from "./types";
import { NetworkManager, generateRoomCode, getPlayerColor } from "./network";
import { buyStock, sellStock, shortStock, coverShort, placeOrder, cancelOrder, buyOption, sellOption, closeOption, togglePinStock } from "../game/engine";
import { handleKeyPress, handleKeyUp, handleMouseMove as handleRestaurantMouseMove, serveOrder, acceptOrder, recordOrderContributor } from "../game/restaurant-engine";
import { handleChopKey } from "../game/restaurant-engine";

const MAX_FEED_ITEMS = 20;
const SYNC_INTERVAL_MS = 100; // 10 syncs/sec

export interface HostCallbacks {
  getGameState: () => GameState;
  setGameState: (updater: (prev: GameState) => GameState) => void;
  getRestaurantState: () => RestaurantState | null;
  setRestaurantState: (updater: (prev: RestaurantState | null) => RestaurantState | null) => void;
  getEodPhase: () => string;
  getPaused: () => boolean;
  getSpeed: () => number;
  getBossDay: () => boolean;
  getBossView: () => string;
  getShowTransition: () => string | null;
  getShowChallengeIntro: () => string | null;
  getShowLoanOffer: () => { amount: number; interestRate: number; dueDay: number; isEmergency: boolean } | null;
  onPlayerJoined: (player: Player) => void;
  onPlayerLeft: (playerId: string) => void;
  onViewInsider: () => void;
  onAcceptLoan: () => void;
  onDeclineLoan: () => void;
  onDismissTransition: () => void;
  onDismissChallengeIntro: (playerId: string) => void;
  onResumeReady: (playerId: string) => void;
  onSetSpeed: (speed: number) => void;
  onTogglePause: () => void;
  onChooseUpgrade: (id: string) => void;
  onChooseStock: (symbol: string) => void;
  onChooseRestaurantUpgrade: (id: string) => void;
  onChooseMenuItem: (name: string) => void;
  onChangeChannel: (monitorId: number, channel: string) => void;
  onSelectStock: (monitorId: number, symbol: string) => void;
  // EOD gate callbacks: called when ALL players have made their choice
  onAllUpgradesChosen: (choices: { playerId: string; upgradeId: string }[]) => void;
  onAllStocksChosen: (choices: { playerId: string; symbol: string }[]) => void;
  onAllRestaurantUpgradesChosen: (choices: { playerId: string; upgradeId: string }[]) => void;
  onAllMenuItemsChosen: (choices: { playerId: string; itemName: string }[]) => void;
  getPlayerSaves?: () => Array<{ name: string; upgrades: string[]; restaurantUpgrades: string[] }> | undefined;
  getMpSaveId?: () => string | undefined;
  onUseConsumable: (consumableId: string) => void;
  onBuyConsumable: (consumableId: string) => void;
  onRecordTrade?: (playerId: string, playerName: string, action: "buy" | "sell" | "short" | "cover" | "buy_option" | "sell_option" | "close_option", symbol: string, shares: number, price: number, timestamp: number) => void;
}

export class MultiplayerHost {
  private network: NetworkManager;
  private callbacks: HostCallbacks;
  private players: Map<string, Player> = new Map();
  private actionFeed: ActionFeedItem[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private _roomCode: string;
  private _hostPlayer: Player | null = null;

  // EOD gate tracking
  private upgradeChoices: Map<string, string> = new Map(); // playerId → upgradeId
  private stockChoices: Map<string, string> = new Map(); // playerId → symbol
  private restaurantUpgradeChoices: Map<string, string> = new Map(); // playerId → upgradeId
  private menuItemChoices: Map<string, string> = new Map(); // playerId → itemName
  private _eodWaitingFor: string[] = []; // player names still choosing
  private _eodGatePhase: "upgrades" | "restaurant-upgrades" | "menu-draft" | null = null;

  // Per-player restaurant state
  private playerActiveOrder: Map<string, number | null> = new Map(); // playerId → activeOrderId
  private playerCounter: Map<string, number> = new Map(); // playerId → current counter index
  private _requiredNames: string[] | null = null; // for resume: only these names can join

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
  get playerList() {
    const list = Array.from(this.players.values());
    if (this._hostPlayer) list.unshift(this._hostPlayer);
    return list;
  }
  get feed() { return this.actionFeed; }
  get eodWaitingFor() { return this._eodWaitingFor; }

  setHostPlayer(player: Player): void {
    this._hostPlayer = player;
  }

  setRequiredNames(names: string[] | null): void {
    this._requiredNames = names;
  }

  // Restaurant counter system
  getPlayerCounter(playerId: string): number {
    return this.playerCounter.get(playerId) ?? 0;
  }

  setPlayerCounter(playerId: string, counter: number): void {
    this.playerCounter.set(playerId, counter);
  }

  getPlayerActiveOrder(playerId: string): number | null {
    return this.playerActiveOrder.get(playerId) ?? null;
  }

  setPlayerActiveOrder(playerId: string, orderId: number | null): void {
    this.playerActiveOrder.set(playerId, orderId);
    // Update playerFocus in restaurant state
    this.callbacks.setRestaurantState((prev) => {
      if (!prev) return prev;
      return { ...prev, playerFocus: { ...prev.playerFocus, [playerId]: orderId } };
    });
  }

  // Get host's own active order (from playerActiveOrder map, not restaurantState.activeOrderId)
  getHostActiveOrder(): number | null {
    if (!this._hostPlayer) return null;
    return this.playerActiveOrder.get(this._hostPlayer.id) ?? null;
  }

  // Called when EOD phase starts — resets tracking
  resetEodGate(): void {
    this.upgradeChoices.clear();
    this.stockChoices.clear();
    this.restaurantUpgradeChoices.clear();
    this.menuItemChoices.clear();
    this._eodWaitingFor = this.playerList.map((p) => p.name);
    this._eodGatePhase = null;
  }

  // Host player submits their own EOD choice
  submitHostChoice(phase: "upgrades" | "stocks" | "restaurant-upgrades" | "menu-draft", choice: string): void {
    if (!this._hostPlayer) return;
    if (phase === "upgrades") {
      this.upgradeChoices.set(this._hostPlayer.id, choice);
    } else if (phase === "stocks") {
      this.stockChoices.set(this._hostPlayer.id, choice);
    } else if (phase === "restaurant-upgrades") {
      this._eodGatePhase = "restaurant-upgrades";
      this.restaurantUpgradeChoices.set(this._hostPlayer.id, choice);
    } else if (phase === "menu-draft") {
      this._eodGatePhase = "menu-draft";
      this.menuItemChoices.set(this._hostPlayer.id, choice);
    }
    this.checkEodGate();
  }

  private checkEodGate(): void {
    const allPlayers = this.playerList;

    if (this._eodGatePhase === "restaurant-upgrades") {
      const remaining = allPlayers.filter((p) => !this.restaurantUpgradeChoices.has(p.id));
      this._eodWaitingFor = remaining.map((p) => p.name);
      this.network.broadcast({ type: "eod_waiting", waitingFor: this._eodWaitingFor });
      if (remaining.length === 0) {
        const choices = Array.from(this.restaurantUpgradeChoices.entries()).map(([playerId, upgradeId]) => ({ playerId, upgradeId }));
        this.callbacks.onAllRestaurantUpgradesChosen(choices);
        this.network.broadcast({ type: "eod_all_ready" });
        this._eodGatePhase = null;
      }
      return;
    }

    if (this._eodGatePhase === "menu-draft") {
      const remaining = allPlayers.filter((p) => !this.menuItemChoices.has(p.id));
      this._eodWaitingFor = remaining.map((p) => p.name);
      this.network.broadcast({ type: "eod_waiting", waitingFor: this._eodWaitingFor });
      if (remaining.length === 0) {
        const choices = Array.from(this.menuItemChoices.entries()).map(([playerId, itemName]) => ({ playerId, itemName }));
        this.callbacks.onAllMenuItemsChosen(choices);
        this.network.broadcast({ type: "eod_all_ready" });
        this._eodGatePhase = null;
      }
      return;
    }

    // Default: trading upgrades + stocks gate
    const remaining = allPlayers.filter((p) => !this.stockChoices.has(p.id));
    this._eodWaitingFor = remaining.map((p) => p.name);
    this.network.broadcast({ type: "eod_waiting", waitingFor: this._eodWaitingFor });

    if (remaining.length === 0) {
      const upgradeList = Array.from(this.upgradeChoices.entries()).map(([playerId, upgradeId]) => ({ playerId, upgradeId }));
      const stockList = Array.from(this.stockChoices.entries()).map(([playerId, symbol]) => ({ playerId, symbol }));
      this.callbacks.onAllUpgradesChosen(upgradeList);
      this.callbacks.onAllStocksChosen(stockList);
      this.network.broadcast({ type: "eod_all_ready" });
    }
  }

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
    let rs = this.callbacks.getRestaurantState();
    // Build playerActiveOrders including host's own
    const activeOrders: Record<string, number | null> = Object.fromEntries(this.playerActiveOrder);
    if (this._hostPlayer) {
      activeOrders[this._hostPlayer.id] = rs?.activeOrderId ?? null;
    }
    // Write playerFocus into restaurant state for UI rendering
    if (rs) {
      rs = { ...rs, playerFocus: activeOrders };
    }
    const sync: GameSync = {
      type: "game_sync",
      gameState: this.callbacks.getGameState(),
      restaurantState: rs,
      eodPhase: this.callbacks.getEodPhase(),
      paused: this.callbacks.getPaused(),
      speed: this.callbacks.getSpeed(),
      bossDay: this.callbacks.getBossDay(),
      bossView: this.callbacks.getBossView(),
      showTransition: this.callbacks.getShowTransition(),
      showChallengeIntro: this.callbacks.getShowChallengeIntro(),
      showLoanOffer: this.callbacks.getShowLoanOffer(),
      players: this.playerList,
      recentActions: this.actionFeed.slice(0, 5),
      playerActiveOrders: activeOrders,
      playerSaves: this.callbacks.getPlayerSaves?.(),
      mpSaveId: this.callbacks.getMpSaveId?.(),
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
    console.log("[Host] Received message from", peerId, (msg as any).type);
    // Handle join request
    if ("type" in msg && msg.type === "join_request") {
      const { playerName } = msg as { type: "join_request"; playerName: string };
      // Validate name for resume games
      if (this._requiredNames) {
        const alreadyJoined = this.playerList.map((p) => p.name);
        const allowed = this._requiredNames.filter((n) => !alreadyJoined.includes(n));
        if (!allowed.includes(playerName)) {
          this.network.send(peerId, {
            type: "join_rejected",
            reason: `This is a resumed game. Required players: ${this._requiredNames.join(", ")}. "${playerName}" is not one of them or has already joined.`,
          });
          return;
        }
      }
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
        this.callbacks.setGameState((s) => {
          const stock = s.stocks.find((st) => st.symbol === action.symbol);
          if (stock) this.callbacks.onRecordTrade?.(player.id, player.name, "buy", action.symbol, action.shares, stock.price, s.timeOfDay);
          return buyStock(s, action.symbol, action.shares);
        });
        this.addFeedItem(player.id, player.name, `Bought ${action.shares} ${action.symbol}`);
        break;
      case "sell_stock":
        this.callbacks.setGameState((s) => {
          const stock = s.stocks.find((st) => st.symbol === action.symbol);
          if (stock) this.callbacks.onRecordTrade?.(player.id, player.name, "sell", action.symbol, action.shares, stock.price, s.timeOfDay);
          return sellStock(s, action.symbol, action.shares);
        });
        this.addFeedItem(player.id, player.name, `Sold ${action.shares} ${action.symbol}`);
        break;
      case "short_stock":
        this.callbacks.setGameState((s) => {
          const stock = s.stocks.find((st) => st.symbol === action.symbol);
          if (stock) this.callbacks.onRecordTrade?.(player.id, player.name, "short", action.symbol, action.shares, stock.price, s.timeOfDay);
          return shortStock(s, action.symbol, action.shares);
        });
        this.addFeedItem(player.id, player.name, `Shorted ${action.shares} ${action.symbol}`);
        break;
      case "cover_short":
        this.callbacks.setGameState((s) => {
          const stock = s.stocks.find((st) => st.symbol === action.symbol);
          if (stock) this.callbacks.onRecordTrade?.(player.id, player.name, "cover", action.symbol, action.shares, stock.price, s.timeOfDay);
          return coverShort(s, action.symbol, action.shares);
        });
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
        this.callbacks.setGameState((s) => {
          const next = buyOption(s, action.symbol, action.optionType, action.strikePrice, action.expirationDays, action.contracts);
          if (next !== s) {
            const newOpt = next.optionsPositions.find((o) => !s.optionsPositions.some((po) => po.id === o.id));
            this.callbacks.onRecordTrade?.(player.id, player.name, "buy_option", action.symbol, action.contracts, newOpt?.premium ?? 0, s.timeOfDay);
          }
          return next;
        });
        this.addFeedItem(player.id, player.name, `Bought ${action.contracts} ${action.symbol} ${action.optionType}s`);
        break;
      case "sell_option":
        this.callbacks.setGameState((s) => {
          const next = sellOption(s, action.symbol, action.optionType, action.strikePrice, action.expirationDays, action.contracts);
          if (next !== s) {
            const newOpt = next.optionsPositions.find((o) => !s.optionsPositions.some((po) => po.id === o.id));
            this.callbacks.onRecordTrade?.(player.id, player.name, "sell_option", action.symbol, action.contracts, newOpt?.premium ?? 0, s.timeOfDay);
          }
          return next;
        });
        this.addFeedItem(player.id, player.name, `Sold ${action.contracts} ${action.symbol} ${action.optionType}s`);
        break;
      case "close_option":
        this.callbacks.setGameState((s) => {
          const next = closeOption(s, action.optionId);
          if (next !== s) {
            const opt = s.optionsPositions.find((o) => o.id === action.optionId);
            const realizedPnL = next.cash - s.cash;
            this.callbacks.onRecordTrade?.(player.id, player.name, "close_option", opt?.symbol ?? "?", 1, realizedPnL, s.timeOfDay);
          }
          return next;
        });
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
      case "use_consumable":
        this.callbacks.onUseConsumable(action.consumableId);
        break;
      case "buy_consumable":
        this.callbacks.onBuyConsumable(action.consumableId);
        break;
      case "accept_loan":
        this.callbacks.onAcceptLoan();
        break;
      case "decline_loan":
        this.callbacks.onDeclineLoan();
        break;
      case "dismiss_transition":
        this.callbacks.onDismissTransition();
        break;
      case "dismiss_challenge_intro":
        this.callbacks.onDismissChallengeIntro(player.id);
        break;
      case "resume_ready":
        this.callbacks.onResumeReady(player.id);
        break;
      case "set_speed":
        this.callbacks.onSetSpeed(action.speed);
        break;
      case "toggle_pause":
        this.callbacks.onTogglePause();
        break;
      case "choose_upgrade":
        // Save upgrade choice (gate fires only after stock is also chosen)
        this.upgradeChoices.set(player.id, action.upgradeId);
        this.addFeedItem(player.id, player.name, `${player.name} chose an upgrade`);
        break;
      case "choose_stock":
        // Save stock choice and check if all players are done
        this.stockChoices.set(player.id, action.symbol);
        this.addFeedItem(player.id, player.name, `${player.name} chose ${action.symbol}`);
        this.checkEodGate();
        break;
      case "choose_restaurant_upgrade":
        // No gate — each player picks independently and moves to menu-draft
        this.addFeedItem(player.id, player.name, `${player.name} chose a kitchen upgrade`);
        break;
      case "choose_menu_item":
        this._eodGatePhase = "menu-draft";
        this.menuItemChoices.set(player.id, action.itemName);
        this.addFeedItem(player.id, player.name, `${player.name} chose a recipe`);
        this.checkEodGate();
        break;
      case "claim_order":
        this.callbacks.setRestaurantState((prev) => {
          if (!prev || prev.shiftOver) return prev;
          const order = prev.orderSlots[action.slotIndex];
          if (!order) return prev;
          // Use player's active order context
          const withPlayerActive = { ...prev, activeOrderId: this.getPlayerActiveOrder(player.id) };
          const result = order.completed ? serveOrder(withPlayerActive, action.slotIndex) : acceptOrder(withPlayerActive, action.slotIndex);
          this.setPlayerActiveOrder(player.id, result.activeOrderId);
          return { ...result, activeOrderId: prev.activeOrderId };
        });
        break;
      case "switch_counter": {
        const numCounters = this.callbacks.getRestaurantState()?.numCounters ?? 1;
        if (action.counter >= 0 && action.counter < numCounters) {
          this.setPlayerCounter(player.id, action.counter);
        }
        break;
      }
      case "restaurant_key": {
        // Process the key press through restaurant engine using player's own activeOrderId
        const key = action.key;
        this.callbacks.setRestaurantState((prev) => {
          if (!prev || prev.shiftOver) return prev;
          const playerActiveId = this.getPlayerActiveOrder(player.id);
          const playerCounterIdx = this.getPlayerCounter(player.id);
          const withPlayerActive = { ...prev, activeOrderId: playerActiveId };

          const slotNumber = Number.parseInt(key, 10);
          if (!Number.isNaN(slotNumber) && slotNumber >= 1 && slotNumber <= prev.slotsPerCounter) {
            // Map local slot number to global index based on player's current counter
            const globalIndex = playerCounterIdx * prev.slotsPerCounter + (slotNumber - 1);
            const order = prev.orderSlots[globalIndex];
            if (!order) return prev;
            let result = order.completed ? serveOrder(withPlayerActive, globalIndex, 1, player.id) : acceptOrder(withPlayerActive, globalIndex);
            if (!order.completed && result.activeOrderId != null) result = recordOrderContributor(result, result.activeOrderId, player.id);
            this.setPlayerActiveOrder(player.id, result.activeOrderId);
            return { ...result, activeOrderId: prev.activeOrderId };
          }
          if (key === "ArrowLeft" || key === "ArrowRight") {
            let result = handleChopKey(withPlayerActive, key === "ArrowLeft" ? "left" : "right");
            if (playerActiveId != null) result = recordOrderContributor(result, playerActiveId, player.id);
            this.setPlayerActiveOrder(player.id, result.activeOrderId);
            return { ...result, activeOrderId: prev.activeOrderId };
          }
          if (key === "Enter") {
            const activeSlotIndex = prev.orderSlots.findIndex((slot) => slot?.id === playerActiveId);
            const currentOrder = activeSlotIndex >= 0 ? prev.orderSlots[activeSlotIndex] : null;
            let result = currentOrder?.completed ? serveOrder(withPlayerActive, activeSlotIndex, 1, player.id) : handleKeyPress(withPlayerActive, key);
            if (!currentOrder?.completed && playerActiveId != null) result = recordOrderContributor(result, playerActiveId, player.id);
            this.setPlayerActiveOrder(player.id, result.activeOrderId);
            return { ...result, activeOrderId: prev.activeOrderId };
          }
          if (/^[a-zA-Z]$/.test(key) || key === " ") {
            let result = handleKeyPress(withPlayerActive, key);
            if (playerActiveId != null) result = recordOrderContributor(result, playerActiveId, player.id);
            this.setPlayerActiveOrder(player.id, result.activeOrderId);
            return { ...result, activeOrderId: prev.activeOrderId };
          }
          return prev;
        });
        break;
      }
      case "restaurant_key_up":
        this.callbacks.setRestaurantState((prev) => {
          if (!prev || prev.shiftOver) return prev;
          if (/^[a-zA-Z]$/.test(action.key)) {
            const playerActiveId = this.getPlayerActiveOrder(player.id);
            const withPlayerActive = { ...prev, activeOrderId: playerActiveId };
            const result = handleKeyUp(withPlayerActive, action.key);
            return { ...result, activeOrderId: prev.activeOrderId };
          }
          return prev;
        });
        break;
      case "restaurant_mouse":
        this.callbacks.setRestaurantState((prev) => {
          if (!prev || prev.shiftOver) return prev;
          const playerActiveId = this.getPlayerActiveOrder(player.id);
          const withPlayerActive = { ...prev, activeOrderId: playerActiveId };
          const result = handleRestaurantMouseMove(withPlayerActive, action.x, action.y);
          return { ...result, activeOrderId: prev.activeOrderId };
        });
        break;
      case "join_request":
        // Handled before processAction is called
        break;
    }
  }

  private addFeedItem(playerId: string, playerName: string, description: string): void {
    this.actionFeed.unshift({ playerId, playerName, description, timestamp: Date.now() });
    if (this.actionFeed.length > MAX_FEED_ITEMS) this.actionFeed.pop();
    this.network.broadcast({ type: "action_feed", item: this.actionFeed[0] });
  }
}
