import { useState } from "react";
import type { Player } from "../multiplayer/types";

interface MultiplayerLobbyProps {
  onHost: (playerName: string) => void;
  onJoin: (roomCode: string, playerName: string) => void;
  onCancel: () => void;
  connecting: boolean;
  error: string | null;
  roomCode: string | null;
  players: Player[];
  isHost: boolean;
  onStart: () => void;
}

export function MultiplayerLobby({
  onHost,
  onJoin,
  onCancel,
  connecting,
  error,
  roomCode,
  players,
  isHost,
  onStart,
}: MultiplayerLobbyProps) {
  const [mode, setMode] = useState<"pick" | "host" | "join">("pick");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  if (roomCode) {
    // In lobby — show players and room code
    return (
      <div className="mp-lobby">
        <div className="mp-lobby-card">
          <h2>🌐 Multiplayer Lobby</h2>
          <div className="mp-room-code">
            <span className="mp-room-label">Room Code</span>
            <span className="mp-room-value">{roomCode}</span>
            <button
              className="mp-copy-btn"
              onClick={() => {
                navigator.clipboard.writeText(roomCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "✅ Copied!" : "📋 Copy"}
            </button>
          </div>
          <div className="mp-players">
            <h3>Players ({players.length})</h3>
            {players.map((p) => (
              <div key={p.id} className="mp-player-row">
                <span className="mp-player-dot" style={{ backgroundColor: p.color }} />
                <span className="mp-player-name">{p.name}</span>
              </div>
            ))}
          </div>
          {isHost ? (
            <button
              className="mp-start-btn"
              onClick={onStart}
              disabled={players.length < 2}
            >
              {players.length < 2 ? "Waiting for players..." : "Start Game"}
            </button>
          ) : (
            <p className="mp-waiting">Waiting for host to start...</p>
          )}
          <button className="mp-cancel-btn" onClick={onCancel}>Leave</button>
        </div>
      </div>
    );
  }

  if (mode === "pick") {
    return (
      <div className="mp-lobby">
        <div className="mp-lobby-card">
          <h2>🌐 Multiplayer</h2>
          <p className="mp-subtitle">Trade together with friends!</p>
          <div className="mp-mode-buttons">
            <button className="mp-mode-btn" onClick={() => setMode("host")}>
              <span className="mp-mode-icon">🏠</span>
              <span className="mp-mode-label">Host Game</span>
              <span className="mp-mode-desc">Create a room for others to join</span>
            </button>
            <button className="mp-mode-btn" onClick={() => setMode("join")}>
              <span className="mp-mode-icon">🔗</span>
              <span className="mp-mode-label">Join Game</span>
              <span className="mp-mode-desc">Enter a room code to connect</span>
            </button>
          </div>
          <button className="mp-cancel-btn" onClick={onCancel}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-lobby">
      <div className="mp-lobby-card">
        <h2>{mode === "host" ? "🏠 Host Game" : "🔗 Join Game"}</h2>
        {error && <div className="mp-error">{error}</div>}
        <div className="mp-form">
          <label>
            Your Name
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={16}
              autoFocus
            />
          </label>
          {mode === "join" && (
            <label>
              Room Code
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="XXXXX"
                maxLength={5}
              />
            </label>
          )}
          <button
            className="mp-submit-btn"
            disabled={connecting || !playerName.trim() || (mode === "join" && joinCode.length < 5)}
            onClick={() => {
              if (mode === "host") onHost(playerName.trim());
              else onJoin(joinCode.trim(), playerName.trim());
            }}
          >
            {connecting ? "Connecting..." : mode === "host" ? "Create Room" : "Join Room"}
          </button>
        </div>
        <button className="mp-cancel-btn" onClick={() => { setMode("pick"); }}>Back</button>
      </div>
    </div>
  );
}
