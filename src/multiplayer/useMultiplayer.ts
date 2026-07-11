import { useState, useCallback, useRef, useEffect } from "react";
import type { GameState } from "../game/types";
import type { RestaurantState } from "../game/restaurant-types";
import type { Player, ActionFeedItem, PeerAction, GameSync } from "./types";
import { MultiplayerHost } from "./host";
import { MultiplayerPeer } from "./peer";
import { getPlayerColor } from "./network";

export type MultiplayerRole = "none" | "host" | "peer";

export interface MultiplayerState {
  role: MultiplayerRole;
  roomCode: string | null;
  players: Player[];
  localPlayer: Player | null;
  actionFeed: ActionFeedItem[];
  connecting: boolean;
  error: string | null;
  gameStarted: boolean;
  // Synced state (peer only)
  syncedGameState: GameState | null;
  syncedRestaurantState: RestaurantState | null;
  syncedEodPhase: string | null;
  syncedPaused: boolean | null;
  syncedSpeed: number | null;
  syncedBossDay: boolean | null;
  syncedBossView: string | null;
}

export interface MultiplayerActions {
  hostGame: (playerName: string) => Promise<void>;
  joinGame: (roomCode: string, playerName: string) => Promise<void>;
  startGame: () => void;
  disconnect: () => void;
  sendAction: (action: PeerAction) => void;
}

export function useMultiplayer(
  getGameState: () => GameState,
  setGameState: (updater: (prev: GameState) => GameState) => void,
  getRestaurantState: () => RestaurantState | null,
  getEodPhase: () => string,
  getPaused: () => boolean,
  getSpeed: () => number,
  getBossDay: () => boolean,
  getBossView: () => string,
  appCallbacks: {
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
  },
): [MultiplayerState, MultiplayerActions] {
  const [state, setState] = useState<MultiplayerState>({
    role: "none",
    roomCode: null,
    players: [],
    localPlayer: null,
    actionFeed: [],
    connecting: false,
    error: null,
    gameStarted: false,
    syncedGameState: null,
    syncedRestaurantState: null,
    syncedEodPhase: null,
    syncedPaused: null,
    syncedSpeed: null,
    syncedBossDay: null,
    syncedBossView: null,
  });

  const hostRef = useRef<MultiplayerHost | null>(null);
  const peerRef = useRef<MultiplayerPeer | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      hostRef.current?.stop();
      peerRef.current?.disconnect();
    };
  }, []);

  const hostGame = useCallback(async (playerName: string) => {
    setState((s) => ({ ...s, connecting: true, error: null }));

    const localPlayer: Player = { id: "host", name: playerName, color: getPlayerColor(0) };

    const host = new MultiplayerHost({
      getGameState,
      setGameState,
      getRestaurantState,
      getEodPhase,
      getPaused,
      getSpeed,
      getBossDay,
      getBossView,
      onPlayerJoined: (player) => {
        setState((s) => ({ ...s, players: [...s.players, player] }));
      },
      onPlayerLeft: (playerId) => {
        setState((s) => ({ ...s, players: s.players.filter((p) => p.id !== playerId) }));
      },
      onViewInsider: appCallbacks.onViewInsider,
      onAcceptLoan: appCallbacks.onAcceptLoan,
      onDeclineLoan: appCallbacks.onDeclineLoan,
      onSetSpeed: appCallbacks.onSetSpeed,
      onTogglePause: appCallbacks.onTogglePause,
      onChooseUpgrade: appCallbacks.onChooseUpgrade,
      onChooseStock: appCallbacks.onChooseStock,
      onChooseRestaurantUpgrade: appCallbacks.onChooseRestaurantUpgrade,
      onChooseMenuItem: appCallbacks.onChooseMenuItem,
      onChangeChannel: appCallbacks.onChangeChannel,
      onSelectStock: appCallbacks.onSelectStock,
    });

    try {
      const roomCode = await host.start();
      hostRef.current = host;
      setState((s) => ({
        ...s,
        role: "host",
        roomCode,
        players: [localPlayer],
        localPlayer,
        connecting: false,
      }));
    } catch (err: any) {
      setState((s) => ({ ...s, connecting: false, error: err.message }));
    }
  }, [getGameState, setGameState, getRestaurantState, getEodPhase, getPaused, getSpeed, getBossDay, getBossView, appCallbacks]);

  const joinGame = useCallback(async (roomCode: string, playerName: string) => {
    setState((s) => ({ ...s, connecting: true, error: null }));

    const peer = new MultiplayerPeer({
      onStateSync: (sync: GameSync) => {
        setState((s) => ({
          ...s,
          syncedGameState: sync.gameState,
          syncedRestaurantState: sync.restaurantState,
          syncedEodPhase: sync.eodPhase,
          syncedPaused: sync.paused,
          syncedSpeed: sync.speed,
          syncedBossDay: sync.bossDay,
          syncedBossView: sync.bossView,
          players: sync.players,
          actionFeed: sync.recentActions,
        }));
      },
      onPlayerJoined: (player) => {
        setState((s) => ({ ...s, players: [...s.players, player] }));
      },
      onPlayerLeft: (playerId) => {
        setState((s) => ({ ...s, players: s.players.filter((p) => p.id !== playerId) }));
      },
      onActionFeed: (item) => {
        setState((s) => ({
          ...s,
          actionFeed: [item, ...s.actionFeed].slice(0, 20),
        }));
      },
      onGameStart: () => {
        setState((s) => ({ ...s, gameStarted: true }));
      },
      onLobbyState: (players, _hostName, _roomCode) => {
        setState((s) => ({ ...s, players }));
      },
      onJoinAccepted: (player, players, code) => {
        setState((s) => ({
          ...s,
          localPlayer: player,
          players,
          roomCode: code,
          connecting: false,
        }));
      },
      onJoinRejected: (reason) => {
        setState((s) => ({ ...s, error: reason, connecting: false }));
      },
      onDisconnected: () => {
        setState((s) => ({ ...s, role: "none", roomCode: null, error: "Disconnected from host", gameStarted: false }));
        peerRef.current = null;
      },
      onError: (err) => {
        setState((s) => ({ ...s, error: err, connecting: false }));
      },
    });

    try {
      await peer.connect(roomCode, playerName);
      peerRef.current = peer;
      setState((s) => ({ ...s, role: "peer", roomCode, connecting: false }));
    } catch (err: any) {
      setState((s) => ({ ...s, connecting: false, error: err.message }));
    }
  }, []);

  const startGame = useCallback(() => {
    if (hostRef.current) {
      setState((s) => ({ ...s, gameStarted: true }));
      // Broadcast game start to all peers
      hostRef.current["network"].broadcast({ type: "game_start" });
    }
  }, []);

  const disconnect = useCallback(() => {
    hostRef.current?.stop();
    peerRef.current?.disconnect();
    hostRef.current = null;
    peerRef.current = null;
    setState({
      role: "none",
      roomCode: null,
      players: [],
      localPlayer: null,
      actionFeed: [],
      connecting: false,
      error: null,
      gameStarted: false,
      syncedGameState: null,
      syncedRestaurantState: null,
      syncedEodPhase: null,
      syncedPaused: null,
      syncedSpeed: null,
      syncedBossDay: null,
      syncedBossView: null,
    });
  }, []);

  const sendAction = useCallback((action: PeerAction) => {
    if (peerRef.current) {
      peerRef.current.sendAction(action);
    }
  }, []);

  return [state, { hostGame, joinGame, startGame, disconnect, sendAction }];
}
