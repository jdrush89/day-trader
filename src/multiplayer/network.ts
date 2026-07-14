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
  private _onFirstPeerConnected: (() => void) | null = null;
  private _useRelay = false; // Fallback to WebSocket relay when WebRTC fails
  private _relayPeers: Set<string> = new Set(); // Peers connected via relay
  private _hostPeerId: string | null = null; // For peers: the host's peer ID

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
    this._peerId = crypto.randomUUID();
  }

  get status() { return this._status; }
  get peerId() { return this._peerId; }
  get isHost() { return this._isHost; }
  get hostPeerId() { return this._hostPeerId; }
  get connectedPeers() { 
    const webrtcPeers = Array.from(this.peers.keys());
    const relayOnly = Array.from(this._relayPeers).filter(id => !webrtcPeers.includes(id));
    return [...webrtcPeers, ...relayOnly];
  }

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

      let resolved = false;
      const doResolve = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        this.setStatus("connected");
        resolve();
      };

      const handler = (e: MessageEvent) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "room_joined") {
          console.log("[MP Peer] Joined room:", roomCode, "existing peers:", msg.peers);
          const peerIds = msg.peers as string[];
          // Only connect to the host (first peer in the list) — skip other peers
          const hostPeerId = peerIds[0];
          if (hostPeerId) {
            this._hostPeerId = hostPeerId;
            this.createPeerConnection(hostPeerId, true);
          }
          // Wait for host WebRTC connection
          this._onFirstPeerConnected = doResolve;
          // If no peers exist, resolve immediately (host waiting for joiners)
          if (!hostPeerId) {
            doResolve();
          } else {
            // If WebRTC doesn't connect in 8s, fall back to relay
            setTimeout(() => {
              if (!resolved && this.ws?.readyState === 1) {
                console.log("[MP] WebRTC timed out, falling back to relay for host");
                this._useRelay = true;
                if (!(this.peers.get(hostPeerId) as any)?.connected) {
                  this._relayPeers.add(hostPeerId);
                  this.callbacks.onPeerConnected(hostPeerId);
                }
                doResolve();
              }
            }, 8000);
          }
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

  // Send to a specific peer via WebRTC data channel or WebSocket relay
  send(peerId: string, message: NetworkMessage): void {
    const peer = this.peers.get(peerId);
    if (peer && !peer.destroyed && (peer as any).connected) {
      try {
        console.log("[MP] Sending to", peerId, (message as any).type);
        peer.send(JSON.stringify(message));
      } catch (e) {
        console.warn("[MP] Failed to send to", peerId, e);
      }
    } else if (this._useRelay && this._relayPeers.has(peerId) && this.ws?.readyState === 1) {
      // Fallback: relay via signaling server
      this.ws.send(JSON.stringify({ type: "relay", targetPeerId: peerId, data: message }));
    } else if (peer && !peer.destroyed) {
      console.warn("[MP] Peer not yet connected:", peerId);
    } else {
      console.warn("[MP] No peer found for", peerId);
    }
  }

  // Broadcast to all connected peers via WebRTC or relay
  broadcast(message: NetworkMessage): void {
    const data = JSON.stringify(message);
    // Send via WebRTC to directly connected peers
    for (const [id, peer] of this.peers) {
      if (!peer.destroyed && (peer as any).connected) {
        try {
          peer.send(data);
        } catch (e) {
          console.warn("[MP] Failed to broadcast to", id, e);
        }
      }
    }
    // Send via relay to relay-only peers
    if (this._useRelay && this._relayPeers.size > 0 && this.ws?.readyState === 1) {
      for (const peerId of this._relayPeers) {
        // Only relay if not already sent via WebRTC
        const peer = this.peers.get(peerId);
        if (!peer || peer.destroyed || !(peer as any).connected) {
          this.ws.send(JSON.stringify({ type: "relay", targetPeerId: peerId, data: message }));
        }
      }
    }
  }

  // Send to host (peer only) — via WebRTC or relay
  sendToHost(message: NetworkMessage): void {
    const hostId = this._hostPeerId;
    if (!hostId) return;

    const hostPeer = this.peers.get(hostId);
    if (hostPeer && !hostPeer.destroyed && (hostPeer as any).connected) {
      try {
        hostPeer.send(JSON.stringify(message));
      } catch (e) {
        console.warn("[MP] Failed to send to host", e);
      }
    } else if (this._useRelay && this._relayPeers.has(hostId) && this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: "relay", targetPeerId: hostId, data: message }));
    }
  }

  disconnect(): void {
    for (const peer of this.peers.values()) {
      peer.destroy();
    }
    this.peers.clear();
    this._relayPeers.clear();
    this._useRelay = false;
    if (this.ws) {
      console.log("[MP] Disconnecting from room", this._roomCode);
      this.ws.close();
      this.ws = null;
    }
    this._isHost = false;
    this._roomCode = null;
    this._hostPeerId = null;
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
          // Set relay fallback timer — if WebRTC doesn't connect in 8s, use relay
          if (this._isHost) {
            const joinedPeerId = msg.peerId as string;
            setTimeout(() => {
              const peer = this.peers.get(joinedPeerId);
              if ((!peer || peer.destroyed || !(peer as any).connected) && this.ws?.readyState === 1) {
                console.log("[MP Host] WebRTC timed out for", joinedPeerId, "- falling back to relay");
                this._useRelay = true;
                this._relayPeers.add(joinedPeerId);
                this.callbacks.onPeerConnected(joinedPeerId);
              }
            }, 8000);
          }
          break;

        case "peer_left":
          console.log("[MP] Peer left:", msg.peerId);
          this.destroyPeerConnection(msg.peerId);
          break;

        case "signal":
          // Incoming WebRTC signaling data
          this.handleSignal(msg.fromPeerId, msg.signalData);
          break;

        case "relay":
          // Incoming game data relayed via signaling server
          try {
            const message = msg.data as NetworkMessage;
            this.callbacks.onMessage(msg.fromPeerId, message);
          } catch (err) {
            console.error("[MP] Failed to parse relay message:", err);
          }
          break;

        case "broadcast":
          // Incoming broadcast via signaling server
          try {
            const message = msg.data as NetworkMessage;
            this.callbacks.onMessage(msg.fromPeerId, message);
          } catch (err) {
            console.error("[MP] Failed to parse broadcast message:", err);
          }
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
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turns:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
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
      // If already connected via relay, upgrade to WebRTC silently
      if (!this._relayPeers.has(remotePeerId)) {
        this.callbacks.onPeerConnected(remotePeerId);
      } else {
        // Upgrade: remove from relay since WebRTC is now working
        this._relayPeers.delete(remotePeerId);
        console.log("[MP] Upgraded from relay to WebRTC for", remotePeerId);
      }
      if (this._onFirstPeerConnected) {
        this._onFirstPeerConnected();
        this._onFirstPeerConnected = null;
      }
    });

    peer.on("data", (data: any) => {
      try {
        // simple-peer-light sends strings directly, not Uint8Array
        const str = typeof data === "string" ? data : new TextDecoder().decode(data);
        const message = JSON.parse(str) as NetworkMessage;
        this.callbacks.onMessage(remotePeerId, message);
      } catch (e) {
        console.error("[MP] Failed to parse message from", remotePeerId, e);
      }
    });

    peer.on("close", () => {
      console.log("[MP] Connection closed with", remotePeerId);
      this.peers.delete(remotePeerId);
      // If using relay, don't fire disconnect
      if (!this._relayPeers.has(remotePeerId)) {
        this.callbacks.onPeerDisconnected(remotePeerId);
      }
    });

    peer.on("error", (err: any) => {
      console.error("[MP] Peer error with", remotePeerId, err.message);
      this.peers.delete(remotePeerId);
      // Fall back to WebSocket relay instead of disconnecting
      if (this._relayPeers.has(remotePeerId)) {
        // Already set up as relay peer (by timeout), nothing to do
      } else if (this.ws?.readyState === 1) {
        console.log("[MP] Falling back to WebSocket relay for", remotePeerId);
        this._useRelay = true;
        this._relayPeers.add(remotePeerId);
        this.callbacks.onPeerConnected(remotePeerId);
        if (this._onFirstPeerConnected) {
          this._onFirstPeerConnected();
          this._onFirstPeerConnected = null;
        }
      } else {
        this.callbacks.onPeerDisconnected(remotePeerId);
      }
    });

    this.peers.set(remotePeerId, peer);
  }

  private handleSignal(fromPeerId: string, signalData: any): void {
    // Peers should only accept signals from the host — ignore other peers
    if (!this._isHost && this._hostPeerId && fromPeerId !== this._hostPeerId) {
      console.log("[MP] Ignoring signal from non-host peer:", fromPeerId);
      return;
    }

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
    const wasRelay = this._relayPeers.has(peerId);
    if (peer) {
      peer.destroy();
      this.peers.delete(peerId);
    }
    this._relayPeers.delete(peerId);
    if (peer || wasRelay) {
      this.callbacks.onPeerDisconnected(peerId);
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.callbacks.onStatusChange(status);
  }
}
