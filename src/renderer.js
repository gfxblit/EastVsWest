/**
 * Renderer
 * Handles rendering the game state to the canvas
 */

import { CONFIG } from './config.js';
import { getDirectionFromVelocity } from './animationHelper.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
    this.bgImage = null;
    this.bgPattern = null;
    this.directionalImages = [];
    this.spriteSheet = null;
    this.spriteSheetMetadata = null;
  }

  init() {
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
      console.error('Failed to get 2D context from canvas');
      return;
    }

    // Size canvas to fill viewport (for responsive mobile support)
    this.resizeCanvas();

    // Load background image
    this.bgImage = this.createImage('game-background.png');
    this.bgImage.onload = () => {
      this.bgPattern = this.ctx.createPattern(this.bgImage, 'repeat');
    };

    // Load directional player images (8 frames)
    for (let i = 0; i < 8; i++) {
      this.directionalImages[i] = this.createImage(`white-male-${i}.png`);
    }

    console.log('Renderer initialized');
  }

  createImage(filename) {
    const img = new Image();
    const baseUrl = CONFIG.ASSETS.BASE_URL;
    // Ensure baseUrl ends with /
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    
    img.onerror = (e) => {
      console.error(`Failed to load image: ${filename}`, img.src, e);
    };
    img.src = `${normalizedBase}${filename}`;
    return img;
  }

  resizeCanvas() {
    // Use full viewport dimensions, adapting to device aspect ratio
    // Works in both portrait and landscape orientations
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  render(gameState, localPlayer = null, playersSnapshot = null, camera = null) {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.fillStyle = CONFIG.CANVAS.BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply camera transform if provided
    if (camera) {
      this.ctx.save();
      // Transform: translate screen center to camera position
      // This makes the camera position appear at the center of the viewport
      this.ctx.translate(
        this.canvas.width / 2 - camera.x,
        this.canvas.height / 2 - camera.y
      );
    }

    // Draw background in world coordinates (after camera transform)
    if (camera) {
      if (this.bgPattern) {
        this.ctx.fillStyle = this.bgPattern;
        this.ctx.fillRect(0, 0, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT);
      } else {
        this.ctx.fillStyle = CONFIG.CANVAS.BACKGROUND_COLOR;
        this.ctx.fillRect(0, 0, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT);
      }
    }

    // Render conflict zone (in world coordinates)
    this.renderConflictZone(gameState.conflictZone);

    // Render all players (in world coordinates)
    if (playersSnapshot) {
      // Multiplayer mode: render remote players from snapshot
      const snapshotPlayers = playersSnapshot.getPlayers();
      snapshotPlayers.forEach((playerData, playerId) => {
        // Skip local player, we'll render it separately
        if (localPlayer && playerId === localPlayer.id) return;

        // Calculate animation state for remote player based on velocity
        const vx = playerData.velocity_x || 0;
        const vy = playerData.velocity_y || 0;
        const direction = getDirectionFromVelocity(vx, vy);
        const isMoving = vx !== 0 || vy !== 0;

        const player = {
          id: playerId,
          name: playerData.player_name,
          x: playerData.position_x,
          y: playerData.position_y,
          rotation: playerData.rotation,
          health: playerData.health,
          animationState: {
            currentFrame: isMoving ? 1 : 0, // Use frame 1 for moving (approximate animation)
            lastDirection: direction !== null ? direction : 0, // Use calculated direction or default to South
            timeAccumulator: 0,
          },
        };
        this.renderPlayer(player, false);
      });
    }

    // Render local player last (on top, with visual distinction)
    if (localPlayer) {
      this.renderPlayer(localPlayer, true);
    }

    // Render loot (in world coordinates)
    for (const loot of gameState.loot) {
      this.renderLoot(loot);
    }

    // Restore transform
    if (camera) {
      this.ctx.restore();
    }

    // Render edge indicators (in screen space, after camera transform)
    if (camera) {
      this.renderEdgeIndicators(playersSnapshot, localPlayer, camera, gameState.loot);
    }
  }

  renderConflictZone(zone) {
    // Draw danger area outside zone (in world coordinates)
    this.ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
    this.ctx.fillRect(0, 0, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT);

    // Clear the safe zone
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.arc(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = 'source-over';

    // Draw zone boundary stroke
    this.ctx.strokeStyle = '#ff6b6b';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  getFrameFromRotation(rotation) {
    // Map rotation (0-2π) to frame (0-7)
    // Frame 0: South (π)
    // Frame 1: South-East (3π/4)
    // Frame 2: East (π/2)
    // Frame 3: North-East (π/4)
    // Frame 4: North (0)
    // Frame 5: North-West (7π/4 or -π/4)
    // Frame 6: West (3π/2 or -π/2)
    // Frame 7: South-West (5π/4 or -3π/4)

    // Each frame covers π/4 radians (45 degrees)
    // Frame boundaries: [North-22.5°, North+22.5°), [NE-22.5°, NE+22.5°), etc.

    // Normalize rotation to 0-2π
    let normalizedRotation = rotation % (2 * Math.PI);
    if (normalizedRotation < 0) {
      normalizedRotation += 2 * Math.PI;
    }

    // Convert rotation to degrees for easier calculation
    const degrees = (normalizedRotation * 180) / Math.PI;

    // Map degrees to frame
    // North (0°) ± 22.5° = [-22.5°, 22.5°] → frame 4
    // NE (45°) ± 22.5° = [22.5°, 67.5°] → frame 3
    // East (90°) ± 22.5° = [67.5°, 112.5°] → frame 2
    // SE (135°) ± 22.5° = [112.5°, 157.5°] → frame 1
    // South (180°) ± 22.5° = [157.5°, 202.5°] → frame 0
    // SW (225°) ± 22.5° = [202.5°, 247.5°] → frame 7
    // West (270°) ± 22.5° = [247.5°, 292.5°] → frame 6
    // NW (315°) ± 22.5° = [292.5°, 337.5°] → frame 5
    // North wrap-around [337.5°, 360°] → frame 4

    if (degrees >= 337.5 || degrees < 22.5) {
      return 4; // North
    } else if (degrees >= 22.5 && degrees < 67.5) {
      return 3; // North-East
    } else if (degrees >= 67.5 && degrees < 112.5) {
      return 2; // East
    } else if (degrees >= 112.5 && degrees < 157.5) {
      return 1; // South-East
    } else if (degrees >= 157.5 && degrees < 202.5) {
      return 0; // South
    } else if (degrees >= 202.5 && degrees < 247.5) {
      return 7; // South-West
    } else if (degrees >= 247.5 && degrees < 292.5) {
      return 6; // West
    } else { // degrees >= 292.5 && degrees < 337.5
      return 5; // North-West
    }
  }

  renderPlayer(player, isLocal = false) {
    // Render player with directional sprite
    const frame = this.getFrameFromRotation(player.rotation || 0);
    const img = this.directionalImages[frame];

    if (img && img.complete && img.naturalWidth > 0) {
      // Draw the directional image centered on player position
      const size = CONFIG.RENDER.PLAYER_RADIUS * 2;
      this.ctx.drawImage(
        img,
        player.x - CONFIG.RENDER.PLAYER_RADIUS,
        player.y - CONFIG.RENDER.PLAYER_RADIUS,
        size,
        size
      );
    }

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
    const barY = player.y - (CONFIG.RENDER.PLAYER_RADIUS + CONFIG.RENDER.HEALTH_BAR_OFFSET_FROM_PLAYER);

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

  renderEdgeIndicators(playersSnapshot, localPlayer, camera, loot = []) {
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
          this.renderEdgeIndicator(indicator, '#4ecdc4'); // Blue for players
        }
      });
    }

    // Render indicators for off-screen loot
    for (const lootItem of loot) {
      const indicator = camera.getEdgeIndicatorPosition(lootItem.x, lootItem.y);
      if (indicator) {
        this.renderEdgeIndicator(indicator, '#f9ca24'); // Yellow for loot
      }
    }
  }

  renderEdgeIndicator(indicator, color) {
    const { x, y, angle } = indicator;
    const size = 10;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);

    // Draw arrow
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(size, 0);
    this.ctx.lineTo(-size / 2, size / 2);
    this.ctx.lineTo(-size / 2, -size / 2);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  /**
   * Load sprite sheet image and metadata
   * @returns {Promise<void>}
   */
  async loadSpriteSheet() {
    const baseUrl = CONFIG.ASSETS.BASE_URL;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    // Load metadata
    const metadataPath = `${normalizedBase}${CONFIG.ASSETS.SPRITE_SHEET.METADATA}`;
    const response = await fetch(metadataPath);

    if (!response.ok) {
      throw new Error(`Failed to load sprite sheet metadata: ${response.statusText}`);
    }

    this.spriteSheetMetadata = await response.json();

    // Load sprite sheet image
    this.spriteSheet = this.createImage(CONFIG.ASSETS.SPRITE_SHEET.PATH);

    // Wait for image to load
    return new Promise((resolve, reject) => {
      this.spriteSheet.onload = resolve;
      this.spriteSheet.onerror = reject;
    });
  }

  /**
   * Initialize animation state for a player
   * @returns {Object} Animation state { currentFrame, timeAccumulator, lastDirection }
   */
  initAnimationState() {
    return {
      currentFrame: 0,
      timeAccumulator: 0,
      lastDirection: 0, // Default to South
    };
  }

  /**
   * Render player using sprite sheet animation
   * @param {Object} player - Player object with position, health, and animationState
   * @param {boolean} isLocal - Whether this is the local player
   */
  renderPlayerWithSpriteSheet(player, isLocal = false) {
    // Check if sprite sheet is loaded
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteSheetMetadata) {
      // Fallback: render pink rectangle
      this.ctx.fillStyle = '#ff69b4'; // Pink
      this.ctx.fillRect(
        player.x - CONFIG.RENDER.PLAYER_RADIUS,
        player.y - CONFIG.RENDER.PLAYER_RADIUS,
        CONFIG.RENDER.PLAYER_RADIUS * 2,
        CONFIG.RENDER.PLAYER_RADIUS * 2
      );
      return;
    }

    const { currentFrame, lastDirection } = player.animationState;
    const { frameWidth, frameHeight } = this.spriteSheetMetadata;

    // Calculate source rectangle (which frame to draw from sprite sheet)
    const sourceX = currentFrame * frameWidth;
    const sourceY = lastDirection * frameHeight;

    // Draw frame from sprite sheet, centered on player position
    this.ctx.drawImage(
      this.spriteSheet,
      sourceX,
      sourceY,
      frameWidth,
      frameHeight,
      player.x - CONFIG.RENDER.PLAYER_RADIUS,
      player.y - CONFIG.RENDER.PLAYER_RADIUS,
      CONFIG.RENDER.PLAYER_RADIUS * 2,
      CONFIG.RENDER.PLAYER_RADIUS * 2
    );

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
    const barY = player.y - (CONFIG.RENDER.PLAYER_RADIUS + CONFIG.RENDER.HEALTH_BAR_OFFSET_FROM_PLAYER);

    // Background
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health
    this.ctx.fillStyle = '#ff6b6b';
    this.ctx.fillRect(barX, barY, (player.health / 100) * barWidth, barHeight);
  }
}
