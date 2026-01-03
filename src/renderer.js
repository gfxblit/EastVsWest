/**
 * Renderer
 * Handles rendering the game state to the canvas
 */

import { CONFIG } from './config.js';
import { getDirectionFromVelocity, updateAnimationState } from './animationHelper.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
    this.bgImage = null;
    this.bgPattern = null;
    this.spriteSheet = null;
    this.spriteSheetMetadata = null;
    this.spriteSheetLoaded = false;
    this.shadowImage = null;
    this.remoteAnimationStates = new Map(); // Store animation state for remote players
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

    // Load shadow image
    this.shadowImage = this.createImage('shadow.png');

    // Load sprite sheet for animations
    this.loadSpriteSheet().catch(err => {
      console.warn('Failed to load sprite sheet, using fallback rendering:', err.message);
    });

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

  render(gameState, localPlayer = null, playersSnapshot = null, camera = null, deltaTime = 0) {
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

    // Create a render queue for depth-sorted rendering (Y-sorting)
    const renderQueue = [];

    // Add all players to the render queue
    if (playersSnapshot) {
      const snapshotPlayers = playersSnapshot.getPlayers();
      const currentTime = performance.now();
      
      snapshotPlayers.forEach((playerData, playerId) => {
        // Skip local player, we'll handle it below to ensure we use the local state
        if (localPlayer && playerId === localPlayer.id) return;

        const interpolated = this.interpolatePosition(playerData, currentTime);

        let animState = this.remoteAnimationStates.get(playerId);
        if (!animState) {
          animState = this.initAnimationState();
          this.remoteAnimationStates.set(playerId, animState);
        }

        const vx = interpolated.vx;
        const vy = interpolated.vy;
        const direction = getDirectionFromVelocity(vx, vy);
        const isMoving = Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1;

        updateAnimationState(animState, deltaTime, isMoving, direction);

        const player = {
          id: playerId,
          name: playerData.player_name,
          x: interpolated.x,
          y: interpolated.y,
          rotation: interpolated.rotation,
          health: playerData.health,
          isAttacking: playerData.is_attacking || false,
          animationState: animState,
        };
        
        renderQueue.push({
          type: 'player',
          y: player.y,
          data: player,
          isLocal: false
        });
      });

      // Cleanup animation states for players who left
      for (const playerId of this.remoteAnimationStates.keys()) {
        if (!snapshotPlayers.has(playerId)) {
          this.remoteAnimationStates.delete(playerId);
        }
      }
    }

    // Add local player to queue
    if (localPlayer) {
      renderQueue.push({
        type: 'player',
        y: localPlayer.y,
        data: localPlayer,
        isLocal: true
      });
    }

    // Add loot to queue
    for (const loot of gameState.loot) {
      renderQueue.push({
        type: 'loot',
        y: loot.y,
        data: loot
      });
    }

    // Add obstacles to queue
    for (const obstacle of CONFIG.OBSTACLES) {
      renderQueue.push({
        type: 'obstacle',
        y: obstacle.y + obstacle.height, // Sort by the BOTTOM of the obstacle
        data: obstacle
      });
    }

    // Sort queue by Y coordinate (bottom to top rendering)
    renderQueue.sort((a, b) => a.y - b.y);

    // Execute sorted rendering
    for (const item of renderQueue) {
      if (item.type === 'player') {
        this.renderPlayer(item.data, item.isLocal);
      } else if (item.type === 'loot') {
        this.renderLoot(item.data);
      } else if (item.type === 'obstacle') {
        this.renderObstacle(item.data);
      }
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

  renderObstacle(obstacle) {
    this.ctx.fillStyle = obstacle.color || '#555';
    this.ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    
    // Add a simple top highlight/depth effect
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, 10);
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
    // Use sprite sheet animation rendering
    this.renderPlayerWithSpriteSheet(player, isLocal);
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

    try {
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
      await new Promise((resolve, reject) => {
        this.spriteSheet.onload = resolve;
        this.spriteSheet.onerror = reject;
      });

      // Mark sprite sheet as loaded
      this.spriteSheetLoaded = true;
    } catch (error) {
      // Ensure sprite sheet stays null for fallback rendering
      this.spriteSheet = null;
      this.spriteSheetMetadata = null;
      this.spriteSheetLoaded = false;
      throw error;
    }
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
    const size = CONFIG.RENDER.PLAYER_RADIUS * 2;
    const spriteX = player.x - CONFIG.RENDER.PLAYER_RADIUS;
    const spriteY = player.y - CONFIG.RENDER.PLAYER_RADIUS;

    // Render shadow first (beneath player)
    if (this.shadowImage && this.shadowImage.complete && this.shadowImage.naturalWidth > 0) {
      this.ctx.drawImage(
        this.shadowImage,
        spriteX,
        spriteY,
        size,
        size
      );
    }

    // Check if sprite sheet is loaded
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteSheetMetadata) {
      // Fallback: render pink rectangle
      this.ctx.fillStyle = '#ff69b4'; // Pink
      this.ctx.fillRect(
        spriteX,
        spriteY,
        size,
        size
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
      spriteX,
      spriteY,
      size,
      size
    );

    // Add white outline for local player
    if (isLocal) {
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(player.x, player.y, CONFIG.RENDER.PLAYER_RADIUS, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Attack flash
    if (player.isAttacking) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.5;
      this.ctx.fillStyle = '#ffffff';
      
      const arcWidth = 67 * (Math.PI / 180);
      const startAngle = (player.rotation - Math.PI / 2) - (arcWidth / 2);
      const endAngle = (player.rotation - Math.PI / 2) + (arcWidth / 2);

      this.ctx.beginPath();
      this.ctx.moveTo(player.x, player.y);
      this.ctx.arc(player.x, player.y, CONFIG.RENDER.PLAYER_RADIUS + 10, startAngle, endAngle);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
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

  /**
   * Interpolate player position based on history buffer
   * @param {Object} player - Player object with positionHistory
   * @param {number} renderTime - Current frame time
   * @returns {Object} { x, y, rotation, vx, vy }
   */
  interpolatePosition(player, renderTime) {
    // If no history, return current position
    if (!player.positionHistory || player.positionHistory.length < 1) {
      return {
        x: player.position_x || 0,
        y: player.position_y || 0,
        rotation: player.rotation || 0,
        vx: player.velocity_x || 0,
        vy: player.velocity_y || 0
      };
    }

    const targetTime = renderTime - CONFIG.NETWORK.INTERPOLATION_DELAY_MS;
    const history = player.positionHistory;

    // If target time is after newest snapshot, use newest (no extrapolation yet)
    if (targetTime >= history[history.length - 1].timestamp) {
      const newest = history[history.length - 1];
      return { x: newest.x, y: newest.y, rotation: newest.rotation, vx: newest.velocity_x, vy: newest.velocity_y };
    }

    // If target time is before oldest snapshot, use oldest
    if (targetTime <= history[0].timestamp) {
      const oldest = history[0];
      return { x: oldest.x, y: oldest.y, rotation: oldest.rotation, vx: oldest.velocity_x, vy: oldest.velocity_y };
    }

    // Find bracketing snapshots
    let p1 = history[0];
    let p2 = history[1];

    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].timestamp <= targetTime && history[i + 1].timestamp >= targetTime) {
        p1 = history[i];
        p2 = history[i + 1];
        break;
      }
    }

    // Calculate interpolation factor (0 to 1)
    const totalDuration = p2.timestamp - p1.timestamp;
    const t = totalDuration > 0 ? (targetTime - p1.timestamp) / totalDuration : 0;

    // Linear interpolation for position
    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;

    // Linear interpolation for velocity (smoother animation transitions)
    const vx = p1.velocity_x + (p2.velocity_x - p1.velocity_x) * t;
    const vy = p1.velocity_y + (p2.velocity_y - p1.velocity_y) * t;

    // Shortest path interpolation for rotation
    const rotation = this.interpolateRotation(p1.rotation, p2.rotation, t);

    return { x, y, rotation, vx, vy };
  }

  /**
   * Interpolate rotation finding the shortest path
   * @param {number} start - Start angle in radians
   * @param {number} end - End angle in radians
   * @param {number} t - Interpolation factor (0-1)
   * @returns {number} Interpolated angle in radians
   */
  interpolateRotation(start, end, t) {
    const TWO_PI = Math.PI * 2;

    // Normalize angles to 0-2PI
    let normStart = start % TWO_PI;
    if (normStart < 0) normStart += TWO_PI;

    let normEnd = end % TWO_PI;
    if (normEnd < 0) normEnd += TWO_PI;

    // Calculate difference
    let diff = normEnd - normStart;

    // Adjust for shortest path
    if (diff > Math.PI) {
      diff -= TWO_PI;
    } else if (diff < -Math.PI) {
      diff += TWO_PI;
    }

    // Interpolate
    let result = normStart + diff * t;

    // Normalize result
    result = result % TWO_PI;
    if (result < 0) result += TWO_PI;

    return result;
  }
}
