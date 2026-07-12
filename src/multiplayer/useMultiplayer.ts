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
  // EOD gate
  eodWaitingFor: string[]; // player names still choosing (empty = not waiting)
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
  // EOD gate controls (host only)
  resetEodGate: () => void;
  submitHostChoice: (phase: "upgrades" | "stocks", choice: string) => void;
}

export function useMultiplayer(
  getGameState: () => GameState,
  setGameState: (updater: (prev: GameState) => GameState) => void,
  getRestaurantState: () => RestaurantState | null,
  setRestaurantState: (updater: (prev: RestaurantState | null) => RestaurantState | null) => void,
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
    onPeerStateSync: (sync: GameSync) => void;
    onAllUpgradesChosen: (choices: { playerId: string; upgradeId: string }[]) => void;
    onAllStocksChosen: (choices: { playerId: string; symbol: string }[]) => void;
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
    eodWaitingFor: [],
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
  const appCallbacksRef = useRef(appCallbacks);
  appCallbacksRef.current = appCallbacks;

  // Refs for getters so the host always reads latest state (avoids stale closures)
  const getGameStateRef = useRef(getGameState);
  getGameStateRef.current = getGameState;
  const getRestaurantStateRef = useRef(getRestaurantState);
  getRestaurantStateRef.current = getRestaurantState;
  const getEodPhaseRef = useRef(getEodPhase);
  getEodPhaseRef.current = getEodPhase;
  const getPausedRef = useRef(getPaused);
  getPausedRef.current = getPaused;
  const getSpeedRef = useRef(getSpeed);
  getSpeedRef.current = getSpeed;
  const getBossDayRef = useRef(getBossDay);
  getBossDayRef.current = getBossDay;
  const getBossViewRef = useRef(getBossView);
  getBossViewRef.current = getBossView;

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
      getGameState: () => getGameStateRef.current(),
      setGameState,
      getRestaurantState: () => getRestaurantStateRef.current(),
      setRestaurantState,
      getEodPhase: () => getEodPhaseRef.current(),
      getPaused: () => getPausedRef.current(),
      getSpeed: () => getSpeedRef.current(),
      getBossDay: () => getBossDayRef.current(),
      getBossView: () => getBossViewRef.current(),
      onPlayerJoined: (player) => {
        setState((s) => ({ ...s, players: [...s.players, player] }));
      },
      onPlayerLeft: (playerId) => {
        setState((s) => ({ ...s, players: s.players.filter((p) => p.id !== playerId) }));
      },
      onViewInsider: () => appCallbacksRef.current.onViewInsider(),
      onAcceptLoan: () => appCallbacksRef.current.onAcceptLoan(),
      onDeclineLoan: () => appCallbacksRef.current.onDeclineLoan(),
      onSetSpeed: (speed) => appCallbacksRef.current.onSetSpeed(speed),
      onTogglePause: () => appCallbacksRef.current.onTogglePause(),
      onChooseUpgrade: (id) => appCallbacksRef.current.onChooseUpgrade(id),
      onChooseStock: (symbol) => appCallbacksRef.current.onChooseStock(symbol),
      onChooseRestaurantUpgrade: (id) => appCallbacksRef.current.onChooseRestaurantUpgrade(id),
      onChooseMenuItem: (name) => appCallbacksRef.current.onChooseMenuItem(name),
      onChangeChannel: (monitorId, channel) => appCallbacksRef.current.onChangeChannel(monitorId, channel),
      onSelectStock: (monitorId, symbol) => appCallbacksRef.current.onSelectStock(monitorId, symbol),
      onAllUpgradesChosen: (choices) => {
        appCallbacksRef.current.onAllUpgradesChosen(choices);
      },
      onAllStocksChosen: (choices) => {
        appCallbacksRef.current.onAllStocksChosen(choices);
        setState((s) => ({ ...s, eodWaitingFor: [] }));
      },
    });

    try {
      const roomCode = await host.start();
      host.setHostPlayer(localPlayer);
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
  }, [setGameState, setRestaurantState]);

  const joinGame = useCallback(async (roomCode: string, playerName: string) => {
    setState((s) => ({ ...s, connecting: true, error: null }));

    const peer = new MultiplayerPeer({
      onStateSync: (sync: GameSync) => {
        // Use ref to always call the latest callback (avoids stale closure)
        appCallbacksRef.current.onPeerStateSync(sync);
        // Still update multiplayer state for players/feed
        setState((s) => ({
          ...s,
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
      onEodWaiting: (waitingFor) => {
        setState((s) => ({ ...s, eodWaitingFor: waitingFor }));
      },
      onEodAllReady: () => {
        setState((s) => ({ ...s, eodWaitingFor: [] }));
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
      eodWaitingFor: [],
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

  const resetEodGate = useCallback(() => {
    if (hostRef.current) {
      hostRef.current.resetEodGate();
      setState((s) => ({ ...s, eodWaitingFor: hostRef.current!.eodWaitingFor }));
    }
  }, []);

  const submitHostChoice = useCallback((phase: "upgrades" | "stocks", choice: string) => {
    if (hostRef.current) {
      hostRef.current.submitHostChoice(phase, choice);
      setState((s) => ({ ...s, eodWaitingFor: hostRef.current!.eodWaitingFor }));
    }
  }, []);

  return [state, { hostGame, joinGame, startGame, disconnect, sendAction, resetEodGate, submitHostChoice }];
}
