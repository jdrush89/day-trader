import { CHARACTERS, loadCharacterProfiles, xpRequiredForLevel, type CharacterId } from "../game/characters";

interface CharacterSelectProps {
  title?: string;
  selected: CharacterId;
  onSelect: (id: CharacterId) => void;
  onConfirm: () => void;
  onBack: () => void;
  confirmLabel?: string;
}

export function CharacterSelect({ title = "Choose Your Trader", selected, onSelect, onConfirm, onBack, confirmLabel = "Start Run" }: CharacterSelectProps) {
  const profiles = loadCharacterProfiles();
  const selectedCharacter = CHARACTERS.find((character) => character.id === selected)!;
  const profile = profiles[selected];

  return (
    <div className="character-select-screen">
      <div className="character-select-panel">
        <h2>{title}</h2>
        <div className="character-grid">
          {CHARACTERS.map((character) => (
            <button
              key={character.id}
              className={`character-card ${selected === character.id ? "selected" : ""}`}
              onClick={() => onSelect(character.id)}
              aria-pressed={selected === character.id}
            >
              <span className="character-portrait" aria-hidden="true">{character.icon}</span>
              <span className="character-card-name">{character.name}</span>
              <span className="character-card-level">Level {profiles[character.id].level}</span>
            </button>
          ))}
        </div>
        <div className="character-details">
          <div className="character-details-portrait" aria-hidden="true">{selectedCharacter.icon}</div>
          <div>
            <h3>{selectedCharacter.name} <span>Level {profile.level}</span></h3>
            <p>{selectedCharacter.description}</p>
            <p className="character-drawback"><strong>Drawback:</strong> {selectedCharacter.drawback}</p>
            <p className="character-scaling"><strong>Level up:</strong> {selectedCharacter.scaling}</p>
            <div className="character-xp">
              <div style={{ width: `${Math.min(100, profile.xp / xpRequiredForLevel(profile.level) * 100)}%` }} />
              <span>{profile.xp} / {xpRequiredForLevel(profile.level)} XP</span>
            </div>
          </div>
        </div>
        <div className="character-select-actions">
          <button className="character-back-btn" onClick={onBack}>Back</button>
          <button className="character-confirm-btn" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
