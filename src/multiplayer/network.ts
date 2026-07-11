import Peer from "simple-peer-light";
import type { NetworkMessage } from "./types";

const SIGNALING_URL = "wss://rogue-daytrader-signaling.onrender.com";
const PLAYER_COLORS = ["#4fc3f7", "#ab47bc", "#66bb6a", "#ffa726", "#ef5350", "#26c6da"];
const CONNECTION_TIMEOUT_MS = 20000;

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getPeerId(_roomCode: string): string {
  return crypto.randomUUID();
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
  private ws: WebSocket | null = null;
  private peers: Map<string, Peer> = new Map();
  private callbacks: NetworkCallbacks;
  private _status: ConnectionStatus = "disconnected";
  private _peerId: string;
  private _isHost = false;
  private _roomCode: string | null = null; // eslint-disable-line

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
    this._peerId = crypto.randomUUID();
  }

  get status() { return this._status; }
  get peerId() { return this._peerId; }
  get isHost() { return this._isHost; }
  get connectedPeers() { return Array.from(this.peers.keys()); }

  // Host: create a room
  async hostRoom(roomCode: string): Promise<void> {
    this._isHost = true;
    this._roomCode = roomCode;
    await this.connectSignaling();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out creating room"));
        this.setStatus("error");
      }, CONNECTION_TIMEOUT_MS);

      const handler = (e: MessageEvent) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "room_created") {
          clearTimeout(timeout);
          console.log("[MP Host] Room created:", roomCode);
          this.setStatus("connected");
          resolve();
        } else if (msg.type === "error") {
          clearTimeout(timeout);
          reject(new Error(msg.message));
          this.setStatus("error");
        }
        this.ws?.removeEventListener("message", handler);
      };
      this.ws!.addEventListener("message", handler);

      this.ws!.send(JSON.stringify({ type: "create_room", roomCode, peerId: this._peerId }));
    });
  }

  // Peer: join a room
  async joinRoom(roomCode: string): Promise<void> {
    this._isHost = false;
    this._roomCode = roomCode;
    await this.connectSignaling();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out joining room"));
        this.setStatus("error");
      }, CONNECTION_TIMEOUT_MS);

      const handler = (e: MessageEvent) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "room_joined") {
          clearTimeout(timeout);
          console.log("[MP Peer] Joined room:", roomCode, "existing peers:", msg.peers);
          this.setStatus("connected");
          // Initiate WebRTC connections to all existing peers
          for (const existingPeerId of msg.peers) {
            this.createPeerConnection(existingPeerId, true);
          }
          resolve();
        } else if (msg.type === "error") {
          clearTimeout(timeout);
          reject(new Error(msg.message));
          this.setStatus("error");
        }
        this.ws?.removeEventListener("message", handler);
      };
      this.ws!.addEventListener("message", handler);

      this.ws!.send(JSON.stringify({ type: "join_room", roomCode, peerId: this._peerId }));
    });
  }

  // Send to a specific peer via WebRTC data channel
  send(peerId: string, message: NetworkMessage): void {
    const peer = this.peers.get(peerId);
    if (peer && !peer.destroyed) {
      try {
        peer.send(JSON.stringify(message));
      } catch (e) {
        console.warn("[MP] Failed to send to", peerId, e);
      }
    }
  }

  // Broadcast to all connected peers
  broadcast(message: NetworkMessage): void {
    const data = JSON.stringify(message);
    for (const [id, peer] of this.peers) {
      if (!peer.destroyed) {
        try {
          peer.send(data);
        } catch (e) {
          console.warn("[MP] Failed to broadcast to", id, e);
        }
      }
    }
  }

  // Send to host (peer only) — the first connected peer is the host
  sendToHost(message: NetworkMessage): void {
    const firstPeer = this.peers.values().next().value;
    if (firstPeer && !firstPeer.destroyed) {
      try {
        firstPeer.send(JSON.stringify(message));
      } catch (e) {
        console.warn("[MP] Failed to send to host", e);
      }
    }
  }

  disconnect(): void {
    for (const peer of this.peers.values()) {
      peer.destroy();
    }
    this.peers.clear();
    if (this.ws) {
      console.log("[MP] Disconnecting from room", this._roomCode);
      this.ws.close();
      this.ws = null;
    }
    this._isHost = false;
    this._roomCode = null;
    this.setStatus("disconnected");
  }

  private async connectSignaling(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setStatus("connecting");
      this.ws = new WebSocket(SIGNALING_URL);

      this.ws.onopen = () => {
        console.log("[MP] Signaling server connected");
        this.setupSignalingHandlers();
        resolve();
      };

      this.ws.onerror = (e) => {
        console.error("[MP] Signaling error:", e);
        this.callbacks.onError("Failed to connect to signaling server");
        this.setStatus("error");
        reject(new Error("Signaling connection failed"));
      };

      this.ws.onclose = () => {
        if (this._status === "connected") {
          console.warn("[MP] Signaling server disconnected");
          this.callbacks.onError("Lost connection to server");
          this.setStatus("error");
        }
      };
    });
  }

  private setupSignalingHandlers(): void {
    if (!this.ws) return;

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      switch (msg.type) {
        case "peer_joined":
          // New peer joined our room — wait for them to initiate WebRTC
          console.log("[MP] Peer joined room:", msg.peerId);
          break;

        case "peer_left":
          console.log("[MP] Peer left:", msg.peerId);
          this.destroyPeerConnection(msg.peerId);
          break;

        case "signal":
          // Incoming WebRTC signaling data
          this.handleSignal(msg.fromPeerId, msg.signalData);
          break;
      }
    };
  }

  private createPeerConnection(remotePeerId: string, initiator: boolean): void {
    console.log("[MP] Creating peer connection to", remotePeerId, initiator ? "(initiator)" : "(receiver)");

    const peer = new Peer({
      initiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      },
    });

    peer.on("signal", (signalData: any) => {
      // Send signaling data to remote peer via WebSocket relay
      console.log("[MP] Sending signal to", remotePeerId, signalData.type || "candidate");
      this.ws?.send(JSON.stringify({
        type: "signal",
        targetPeerId: remotePeerId,
        fromPeerId: this._peerId,
        signalData,
      }));
    });

    peer.on("connect", () => {
      console.log("[MP] WebRTC connected to", remotePeerId);
      this.callbacks.onPeerConnected(remotePeerId);
    });

    peer.on("data", (data: Uint8Array) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(data)) as NetworkMessage;
        this.callbacks.onMessage(remotePeerId, message);
      } catch (e) {
        console.error("[MP] Failed to parse message from", remotePeerId, e);
      }
    });

    peer.on("close", () => {
      console.log("[MP] Connection closed with", remotePeerId);
      this.peers.delete(remotePeerId);
      this.callbacks.onPeerDisconnected(remotePeerId);
    });

    peer.on("error", (err: any) => {
      console.error("[MP] Peer error with", remotePeerId, err.message);
      this.peers.delete(remotePeerId);
      this.callbacks.onPeerDisconnected(remotePeerId);
    });

    this.peers.set(remotePeerId, peer);
  }

  private handleSignal(fromPeerId: string, signalData: any): void {
    let peer = this.peers.get(fromPeerId);

    if (!peer) {
      // Create a new connection as receiver (non-initiator)
      this.createPeerConnection(fromPeerId, false);
      peer = this.peers.get(fromPeerId)!;
    }

    console.log("[MP] Received signal from", fromPeerId, signalData.type || "candidate");
    peer.signal(signalData);
  }

  private destroyPeerConnection(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.destroy();
      this.peers.delete(peerId);
      this.callbacks.onPeerDisconnected(peerId);
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.callbacks.onStatusChange(status);
  }
}
