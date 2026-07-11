import Peer, { DataConnection } from "peerjs";
import type { NetworkMessage } from "./types";

const ROOM_PREFIX = "rogue-daytrader-";
const PLAYER_COLORS = ["#4fc3f7", "#ab47bc", "#66bb6a", "#ffa726", "#ef5350", "#26c6da"];
const CONNECTION_TIMEOUT_MS = 15000;

// Generate a short room code
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getPeerId(roomCode: string): string {
  return ROOM_PREFIX + roomCode.toUpperCase();
}

export function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface NetworkCallbacks {
  onMessage: (peerId: string, message: NetworkMessage) => void;
  onPeerConnected: (peerId: string) => void;
  onPeerDisconnected: (peerId: string) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  onError: (error: string) => void;
}

// PeerJS config - use default cloud server with explicit settings
const PEER_CONFIG = {
  debug: 1, // minimal logging
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  },
};

export class NetworkManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private callbacks: NetworkCallbacks;
  private _status: ConnectionStatus = "disconnected";
  private _peerId: string | null = null;
  private _isHost = false;

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  get status() { return this._status; }
  get peerId() { return this._peerId; }
  get isHost() { return this._isHost; }
  get connectedPeers() { return Array.from(this.connections.keys()); }

  // Host: create a room with a specific peer ID
  async hostRoom(roomCode: string): Promise<void> {
    this._isHost = true;
    const id = getPeerId(roomCode);

    return new Promise((resolve, reject) => {
      this.setStatus("connecting");
      const timeout = setTimeout(() => {
        this.peer?.destroy();
        this.setStatus("error");
        reject(new Error("Connection timed out — signaling server may be down"));
      }, CONNECTION_TIMEOUT_MS);

      this.peer = new Peer(id, PEER_CONFIG);

      this.peer.on("open", (peerId) => {
        clearTimeout(timeout);
        this._peerId = peerId;
        this.setStatus("connected");
        console.log("[MP Host] Registered as", peerId);
        resolve();
      });

      this.peer.on("connection", (conn) => {
        console.log("[MP Host] Incoming connection from", conn.peer);
        this.setupConnection(conn);
      });

      this.peer.on("error", (err) => {
        clearTimeout(timeout);
        const msg = err.type === "unavailable-id" ? "Room code already in use" : err.message;
        console.error("[MP Host] Error:", err.type, msg);
        this.callbacks.onError(msg);
        this.setStatus("error");
        reject(new Error(msg));
      });

      this.peer.on("disconnected", () => {
        console.warn("[MP Host] Signaling server disconnected, reconnecting...");
        if (this._status === "connected") {
          this.peer?.reconnect();
        }
      });
    });
  }

  // Peer: connect to a host room
  async joinRoom(roomCode: string): Promise<void> {
    this._isHost = false;
    const hostId = getPeerId(roomCode);

    return new Promise((resolve, reject) => {
      this.setStatus("connecting");
      const timeout = setTimeout(() => {
        this.peer?.destroy();
        this.setStatus("error");
        reject(new Error("Connection timed out — could not reach host"));
      }, CONNECTION_TIMEOUT_MS);

      this.peer = new Peer(PEER_CONFIG);

      this.peer.on("open", (peerId) => {
        this._peerId = peerId;
        console.log("[MP Peer] Got ID:", peerId, "— connecting to host:", hostId);
        const conn = this.peer!.connect(hostId, { reliable: true, serialization: "json" });
        this.setupConnection(conn);

        conn.on("open", () => {
          clearTimeout(timeout);
          console.log("[MP Peer] Connected to host!");
          this.setStatus("connected");
          resolve();
        });

        conn.on("error", (err) => {
          clearTimeout(timeout);
          console.error("[MP Peer] Connection error:", err);
          this.callbacks.onError(`Connection failed: ${err.message}`);
          this.setStatus("error");
          reject(err);
        });
      });

      this.peer.on("error", (err) => {
        clearTimeout(timeout);
        const msg = err.type === "peer-unavailable" ? "Room not found — check the code and try again" : err.message;
        console.error("[MP Peer] Error:", err.type, msg);
        this.callbacks.onError(msg);
        this.setStatus("error");
        reject(new Error(msg));
      });
    });
  }

  // Send a message to a specific peer
  send(peerId: string, message: NetworkMessage): void {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(message);
    }
  }

  // Broadcast a message to all connected peers (host only)
  broadcast(message: NetworkMessage): void {
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send(message);
    }
  }

  // Send to host (peer only)
  sendToHost(message: NetworkMessage): void {
    const conn = this.connections.values().next().value;
    if (conn && conn.open) conn.send(message);
  }

  disconnect(): void {
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
    this._peerId = null;
    this._isHost = false;
    this.setStatus("disconnected");
  }

  private setupConnection(conn: DataConnection): void {
    conn.on("open", () => {
      console.log("[MP] Connection opened with", conn.peer);
      this.connections.set(conn.peer, conn);
      this.callbacks.onPeerConnected(conn.peer);
    });

    conn.on("data", (data) => {
      this.callbacks.onMessage(conn.peer, data as NetworkMessage);
    });

    conn.on("close", () => {
      console.log("[MP] Connection closed with", conn.peer);
      this.connections.delete(conn.peer);
      this.callbacks.onPeerDisconnected(conn.peer);
    });

    conn.on("error", (err) => {
      console.error("[MP] Connection error with", conn.peer, err);
      this.callbacks.onError(`Peer connection error: ${err.message}`);
      this.connections.delete(conn.peer);
      this.callbacks.onPeerDisconnected(conn.peer);
    });
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.callbacks.onStatusChange(status);
  }
}
