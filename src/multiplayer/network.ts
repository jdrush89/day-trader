import Peer, { DataConnection } from "peerjs";
import type { NetworkMessage } from "./types";

const ROOM_PREFIX = "rogue-daytrader-";
const PLAYER_COLORS = ["#4fc3f7", "#ab47bc", "#66bb6a", "#ffa726", "#ef5350", "#26c6da"];

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
      this.peer = new Peer(id);

      this.peer.on("open", (peerId) => {
        this._peerId = peerId;
        this.setStatus("connected");
        resolve();
      });

      this.peer.on("connection", (conn) => {
        this.setupConnection(conn);
      });

      this.peer.on("error", (err) => {
        const msg = err.type === "unavailable-id" ? "Room code already in use" : err.message;
        this.callbacks.onError(msg);
        this.setStatus("error");
        reject(new Error(msg));
      });

      this.peer.on("disconnected", () => {
        // PeerJS broker disconnect — try to reconnect
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
      this.peer = new Peer();

      this.peer.on("open", (peerId) => {
        this._peerId = peerId;
        const conn = this.peer!.connect(hostId, { reliable: true });
        this.setupConnection(conn);

        conn.on("open", () => {
          this.setStatus("connected");
          resolve();
        });

        conn.on("error", (err) => {
          this.callbacks.onError(`Connection failed: ${err.message}`);
          this.setStatus("error");
          reject(err);
        });
      });

      this.peer.on("error", (err) => {
        const msg = err.type === "peer-unavailable" ? "Room not found" : err.message;
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
    // Peer has exactly one connection — to the host
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
      this.connections.set(conn.peer, conn);
      this.callbacks.onPeerConnected(conn.peer);
    });

    conn.on("data", (data) => {
      this.callbacks.onMessage(conn.peer, data as NetworkMessage);
    });

    conn.on("close", () => {
      this.connections.delete(conn.peer);
      this.callbacks.onPeerDisconnected(conn.peer);
    });

    conn.on("error", (err) => {
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
