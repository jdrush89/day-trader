import { GameState } from "../game/types";

interface UpgradeShopProps {
  gameState: GameState;
  onPurchase: (upgradeId: string) => void;
  onClose: () => void;
}

export function UpgradeShop({ gameState, onPurchase, onClose }: UpgradeShopProps) {
  const available = gameState.upgrades.filter((u) => !u.purchased);

  return (
    <div className="upgrade-shop-overlay">
      <div className="upgrade-shop">
        <div className="shop-header">
          <h2>🛒 Upgrade Shop</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="shop-items">
          {available.length === 0 && <p className="empty">All upgrades purchased!</p>}
          {available.map((upgrade) => (
            <div key={upgrade.id} className="upgrade-card">
              <div className="upgrade-info">
                <span className="upgrade-name">{upgrade.name}</span>
                <span className="upgrade-desc">{upgrade.description}</span>
              </div>
              <button
                className="upgrade-buy-btn"
                disabled={gameState.cash < upgrade.cost}
                onClick={() => onPurchase(upgrade.id)}
              >
                ${upgrade.cost}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
