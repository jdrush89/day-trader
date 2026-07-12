import { useState } from "react";
import type { Player } from "../multiplayer/types";
import type { MpSaveData } from "../game/save";

interface MultiplayerLobbyProps {
  onHost: (playerName: string) => void;
  onJoin: (roomCode: string, playerName: string) => void;
  onCancel: () => void;
  onReset: () => void;
  connecting: boolean;
  error: string | null;
  roomCode: string | null;
  players: Player[];
  isHost: boolean;
  onStart: () => void;
  mpSaves: MpSaveData[];
  onResume: (save: MpSaveData, playerName: string) => void;
  onDeleteSave: (id: string) => void;
  resumeData: MpSaveData | null;
}

export function MultiplayerLobby({
  onHost,
  onJoin,
  onCancel,
  onReset,
  connecting,
  error,
  roomCode,
  players,
  isHost,
  onStart,
  mpSaves,
  onResume,
  onDeleteSave,
  resumeData,
}: MultiplayerLobbyProps) {
  const [mode, setMode] = useState<"pick" | "host" | "join" | "resume">("pick");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  if (roomCode) {
    // Check if all required players have joined for a resume
    const allPlayersReady = !resumeData || resumeData.players.every(
      (sp) => players.some((p) => p.name === sp.name),
    );
    const neededNames = resumeData?.players.map((p) => p.name) ?? [];

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
          {resumeData && (
            <div className="mp-resume-info">
              <p className="mp-resume-label">Resuming Day {resumeData.gameState.day} — Waiting for players:</p>
              <div className="mp-needed-players">
                {neededNames.map((name) => {
                  const joined = players.some((p) => p.name === name);
                  return (
                    <span key={name} className={`mp-needed-player ${joined ? "joined" : ""}`}>
                      {joined ? "✅" : "⏳"} {name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
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
              disabled={resumeData ? !allPlayersReady : players.length < 2}
            >
              {resumeData
                ? (allPlayersReady ? "Resume Game" : "Waiting for all players...")
                : (players.length < 2 ? "Waiting for players..." : "Start Game")}
            </button>
          ) : (
            <p className="mp-waiting">Waiting for host to start...</p>
          )}
          <button className="mp-cancel-btn" onClick={onCancel}>Leave</button>
        </div>
      </div>
    );
  }

  if (mode === "resume") {
    return (
      <div className="mp-lobby">
        <div className="mp-lobby-card">
          <h2>📂 Saved Games</h2>
          {mpSaves.length === 0 ? (
            <p className="mp-subtitle">No saved multiplayer games.</p>
          ) : (
            <div className="mp-saves-list">
              {mpSaves.sort((a, b) => b.savedAt - a.savedAt).map((save) => (
                <div key={save.id} className="mp-save-card">
                  <div className="mp-save-info">
                    <span className="mp-save-day">Day {save.gameState.day}</span>
                    <span className="mp-save-players">
                      {save.players.map((p) => p.name).join(", ")}
                    </span>
                    <span className="mp-save-date">
                      {new Date(save.savedAt).toLocaleDateString()} {new Date(save.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="mp-save-actions">
                    <button className="mp-save-resume-btn" onClick={() => {
                      // Need a name for the host
                      const savedHost = save.players[0]?.name ?? "Host";
                      setPlayerName(savedHost);
                      onResume(save, savedHost);
                    }}>Resume</button>
                    <button className="mp-save-delete-btn" onClick={() => onDeleteSave(save.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="mp-cancel-btn" onClick={() => setMode("pick")}>Back</button>
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
            {mpSaves.length > 0 && (
              <button className="mp-mode-btn" onClick={() => setMode("resume")}>
                <span className="mp-mode-icon">📂</span>
                <span className="mp-mode-label">Resume Game</span>
                <span className="mp-mode-desc">{mpSaves.length} saved game{mpSaves.length > 1 ? "s" : ""}</span>
              </button>
            )}
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
        <button className="mp-cancel-btn" onClick={() => { onReset(); setMode("pick"); }}>Back</button>
      </div>
    </div>
  );
}
