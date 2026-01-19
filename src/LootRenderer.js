import { CONFIG } from './config.js';

export class LootRenderer {
  constructor(assetManager) {
    this.assetManager = assetManager;
    this.weaponIcons = new Map();
  }

  init() {
    // Load weapon icons
    if (CONFIG.WEAPONS) {
      Object.values(CONFIG.WEAPONS).forEach(weapon => {
        if (weapon.icon) {
          const iconPath = `${CONFIG.ASSETS.WEAPONS_BASE_URL}${weapon.icon}`;
          this.weaponIcons.set(weapon.id, this.assetManager.createImage(iconPath));
        }
      });
    }
  }

  render(ctx, lootItems) {
    if (!Array.isArray(lootItems)) return;

    for (const loot of lootItems) {
      const icon = this.weaponIcons.get(loot.item_id);

      if (icon && icon.complete && icon.naturalWidth > 0) {
        // Draw weapon icon
        const size = 40;
        ctx.drawImage(
          icon,
          0, 0, icon.naturalWidth, icon.naturalHeight,
          loot.x - size / 2, loot.y - size / 2,
          size, size,
        );
      } else {
        // Fallback to yellow circle
        ctx.fillStyle = '#f9ca24'; // Golden yellow
        ctx.beginPath();
        ctx.arc(loot.x, loot.y, 15, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw item name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(loot.item_id.toUpperCase(), loot.x, loot.y - 25);
    }
  }
}
