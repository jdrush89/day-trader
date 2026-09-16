import { getCharacterDefinition, type CharacterSelection } from "../game/characters";

interface CurrentCharacterBadgeProps {
  character: CharacterSelection;
}

export function CurrentCharacterBadge({ character }: CurrentCharacterBadgeProps) {
  const definition = getCharacterDefinition(character.id);

  return (
    <div className="current-character-badge" title={`${definition.name}, level ${character.level}`}>
      <span className="current-character-portrait" aria-hidden="true">{definition.icon}</span>
      <span className="current-character-name">{definition.name}</span>
    </div>
  );
}
