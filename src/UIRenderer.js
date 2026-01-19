import { CONFIG } from './config.js';
import { FloatingText } from './FloatingText.js';

export class UIRenderer {
  constructor() {
    this.floatingTexts = [];
    this.previousPlayerHealth = new Map();
  }

  addFloatingText(x, y, text, color) {
    // Add random offset to start position (-20 to +20 px)
    const offsetX = (Math.random() - 0.5) * 40;
    const offsetY = (Math.random() - 0.5) * 20;
    this.floatingTexts.push(new FloatingText(x + offsetX, y + offsetY, text, color));
  }

  checkForHealthChanges(playersSnapshot) {
    if (!playersSnapshot) return;

    const players = playersSnapshot.getPlayers();
    players.forEach(player => {
      const prevHealth = this.previousPlayerHealth.get(player.player_id);
      const currentHealth = player.health;

      if (prevHealth !== undefined && currentHealth !== prevHealth) {
        const diff = currentHealth - prevHealth;
        if (Math.abs(diff) >= 0.1) { // Ignore tiny floating point diffs
          const text = Math.abs(Math.round(diff)).toString();
          const color = diff < 0 ? '#ff0000' : '#00ff00';
          this.addFloatingText(player.position_x, player.position_y - CONFIG.RENDER.PLAYER_RADIUS * 2, text, color);
        }
      }

      this.previousPlayerHealth.set(player.player_id, currentHealth);
    });
  }

  render(ctx, deltaTime, localPlayer, lootItems) {
    // Update and Render Floating Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const text = this.floatingTexts[i];
      text.update(deltaTime);
      if (text.isExpired()) {
        this.floatingTexts.splice(i, 1);
      } else {
        text.draw(ctx);
      }
    }

    // Interaction Prompt
    if (localPlayer) {
      const nearestLoot = this.findNearestLoot(localPlayer, lootItems);
      if (nearestLoot && nearestLoot.distance <= CONFIG.LOOT.PICKUP_RADIUS) {
        this.renderInteractionPrompt(ctx, localPlayer, nearestLoot.item);
      }
    }
  }

  findNearestLoot(player, lootItems) {
    if (!lootItems || lootItems.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    for (const item of lootItems) {
      const dx = player.x - item.x;
      const dy = player.y - item.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearest = item;
      }
    }

    return { item: nearest, distance: minDistance };
  }

  renderInteractionPrompt(ctx, player, item) {
    const isUnarmed = player.equipped_weapon === 'fist' || !player.equipped_weapon;
    let text = '';

    if (isUnarmed) {
      text = `Picking up ${item.item_id}...`;
    } else {
      text = `Press F to swap ${player.equipped_weapon} for ${item.item_id}`;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.font = 'bold 16px Arial';
    const metrics = ctx.measureText(text);
    const padding = 10;

    // Draw background bubble
    ctx.fillRect(
      player.x - metrics.width / 2 - padding,
      player.y + CONFIG.RENDER.PLAYER_RADIUS + 10,
      metrics.width + padding * 2,
      30,
    );

    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(
      text,
      player.x,
      player.y + CONFIG.RENDER.PLAYER_RADIUS + 30,
    );
  }

  renderEdgeIndicators(ctx, playersSnapshot, localPlayer, camera, loot = []) {
    // Render indicators for off-screen players
    if (playersSnapshot) {
      const snapshotPlayers = playersSnapshot.getPlayers();
      snapshotPlayers.forEach((playerData, playerId) => {
        // Skip local player
        if (localPlayer && playerId === localPlayer.id) return;

        const worldX = playerData.position_x;
        const worldY = playerData.position_y;

        const indicator = camera.getEdgeIndicatorPosition(worldX, worldY);
        if (indicator) {
          this.renderEdgeIndicator(ctx, indicator, '#4ecdc4'); // Blue for players
        }
      });
    }

    // Render indicators for off-screen loot
    for (const lootItem of loot) {
      const indicator = camera.getEdgeIndicatorPosition(lootItem.x, lootItem.y);
      if (indicator) {
        this.renderEdgeIndicator(ctx, indicator, '#f9ca24'); // Yellow for loot
      }
    }
  }

  renderEdgeIndicator(ctx, indicator, color) {
    const { x, y, angle } = indicator;
    const size = 10;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Draw arrow
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size / 2, size / 2);
    ctx.lineTo(-size / 2, -size / 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
