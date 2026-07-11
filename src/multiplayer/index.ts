export { MultiplayerHost } from "./host";
export { MultiplayerPeer } from "./peer";
export { NetworkManager, generateRoomCode, getPeerId, getPlayerColor } from "./network";
export { useMultiplayer } from "./useMultiplayer";
export type { MultiplayerRole, MultiplayerState, MultiplayerActions } from "./useMultiplayer";
export type { Player, PeerAction, HostMessage, GameSync, ActionFeedItem } from "./types";
