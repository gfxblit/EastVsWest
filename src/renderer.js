/**
 * Renderer
 * Handles rendering the game state to the canvas
 */

import { CONFIG } from './config.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
  }

  init() {
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
      console.error('Failed to get 2D context from canvas');
      return;
    }
    this.canvas.width = CONFIG.CANVAS.WIDTH;
    this.canvas.height = CONFIG.CANVAS.HEIGHT;

    console.log('Renderer initialized');
  }

  render(gameState, localPlayer = null, playersSnapshot = null) {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.fillStyle = CONFIG.CANVAS.BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Render conflict zone
    this.renderConflictZone(gameState.conflictZone);

    // Render all players
    if (playersSnapshot) {
      // Multiplayer mode: render remote players from snapshot
      const snapshotPlayers = playersSnapshot.getPlayers();
      snapshotPlayers.forEach((playerData, playerId) => {
        // Skip local player, we'll render it separately
        if (localPlayer && playerId === localPlayer.id) return;

        const player = {
          id: playerId,
          name: playerData.player_name,
          x: playerData.position_x,
          y: playerData.position_y,
          rotation: playerData.rotation,
          health: playerData.health,
        };
        this.renderPlayer(player, false);
      });
    }

    // Render local player last (on top, with visual distinction)
    if (localPlayer) {
      this.renderPlayer(localPlayer, true);
    }

    // Render loot
    for (const loot of gameState.loot) {
      this.renderLoot(loot);
    }
  }

  renderConflictZone(zone) {
    // Draw zone boundary
    this.ctx.strokeStyle = '#ff6b6b';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2);
    this.ctx.stroke();

    // Draw danger area outside zone
    this.ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Clear the safe zone
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.arc(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = 'source-over';
  }

  renderPlayer(player, isLocal = false) {
    // Simple player representation as a circle
    // Local player has a different color and a white outline (inspired by Stardew Valley)
    this.ctx.fillStyle = isLocal ? '#6ee7b7' : '#4ecdc4'; // Lighter green for local player
    this.ctx.beginPath();
    this.ctx.arc(player.x, player.y, CONFIG.RENDER.PLAYER_RADIUS, 0, Math.PI * 2);
    this.ctx.fill();

    // Add white outline for local player
    if (isLocal) {
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(player.x, player.y, CONFIG.RENDER.PLAYER_RADIUS, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Health bar above player
    const barWidth = CONFIG.RENDER.HEALTH_BAR_WIDTH;
    const barHeight = CONFIG.RENDER.HEALTH_BAR_HEIGHT;
    const barX = player.x - barWidth / 2;
    const barY = player.y - CONFIG.RENDER.HEALTH_BAR_OFFSET_Y;

    // Background
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health
    this.ctx.fillStyle = '#ff6b6b';
    this.ctx.fillRect(barX, barY, (player.health / 100) * barWidth, barHeight);
  }

  renderLoot(loot) {
    // Simple loot representation as a square
    this.ctx.fillStyle = '#f9ca24';
    this.ctx.fillRect(loot.x - 5, loot.y - 5, 10, 10);
  }
}
