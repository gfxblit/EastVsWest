/**
 * Renderer
 * Handles rendering the game state to the canvas
 */

import { CONFIG } from './config.js';
import { getDirectionFromVelocity, AnimationState } from './animationHelper.js';
import { FloatingText } from './FloatingText.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
    this.bgImage = null;
    this.bgPattern = null;
    this.spriteSheet = null;
    this.spriteSheetMetadata = null;
    this.attackSpriteSheet = null;
    this.attackSpriteSheetMetadata = null;
    this.spriteSheetLoaded = false;
    this.shadowImage = null;
    this.remoteAnimationStates = new Map(); // Store animation state for remote players
    this.floatingTexts = [];
  }

  init() {
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
      console.error('Failed to get 2D context from canvas');
      return;
    }

    // optimizing for pixel art
    this.ctx.imageSmoothingEnabled = false;

    // Size canvas to fill viewport (for responsive mobile support)
    this.resizeCanvas();

    // Load background image
    this.bgImage = this.createImage('game-background.png');
    this.bgImage.onload = () => {
      this.bgPattern = this.ctx.createPattern(this.bgImage, 'repeat');
    };

    // Load shadow image
    this.shadowImage = this.createImage('shadow.png');

    // Load sprite sheets for animations
    this.loadSpriteSheets().catch(err => {
      console.warn('Failed to load sprite sheets, using fallback rendering:', err.message);
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

  addFloatingText(x, y, text, color) {
    // Add random offset to start position (-20 to +20 px)
    // This prevents text from overlapping exactly if spawned at same frame/location
    const offsetX = (Math.random() - 0.5) * 40;
    const offsetY = (Math.random() - 0.5) * 20;
    this.floatingTexts.push(new FloatingText(x + offsetX, y + offsetY, text, color));
  }

  render(gameState, localPlayer = null, playersSnapshot = null, camera = null, deltaTime = 0.016) {
    if (!this.ctx) return;

    if (camera) {
      this.ctx.save();
    }
    
    // Clear the canvas
    this.ctx.fillStyle = CONFIG.CANVAS.BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply camera transform if provided
    if (camera) {
      this.ctx.translate(this.canvas.width / 2 - camera.x, this.canvas.height / 2 - camera.y);
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
      // Use performance.now() if renderTime not provided (fallback)
      const currentTime = performance.now();
      
      snapshotPlayers.forEach((playerData, playerId) => {
        // Skip local player, we'll render it separately
        if (localPlayer && playerId === localPlayer.id) return;

        // Interpolate position and velocity
        const interpolated = playersSnapshot.getInterpolatedPlayerState(playerId, currentTime);
        if (!interpolated) return; // Should not happen given we are iterating over players


        // Get or create persistent animation state for this remote player
        let animState = this.remoteAnimationStates.get(playerId);
        if (!animState) {
          animState = new AnimationState();
          this.remoteAnimationStates.set(playerId, animState);
        }

        // Calculate animation state for remote player based on interpolated velocity
        const vx = interpolated.vx;
        const vy = interpolated.vy;
        const direction = getDirectionFromVelocity(vx, vy);
        const isMoving = Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1;

        // Update animation state
        animState.update(deltaTime, isMoving, direction);

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
        this.renderPlayer(player, false);
      });

      // Cleanup animation states for players who left
      for (const playerId of this.remoteAnimationStates.keys()) {
        if (!snapshotPlayers.has(playerId)) {
          this.remoteAnimationStates.delete(playerId);
        }
      }
    }

        // Render Local Player
        if (localPlayer) {
          this.renderPlayer(localPlayer, true);
        }
        
        // Render Loot
        if (gameState && gameState.loot) {
          this.renderLoot(gameState.loot);
          
          // Draw interaction prompt if near any loot
          if (localPlayer) {
            const nearestLoot = this.findNearestLoot(localPlayer, gameState.loot);
            if (nearestLoot && nearestLoot.distance <= CONFIG.LOOT.PICKUP_RADIUS) {
              this.renderInteractionPrompt(localPlayer, nearestLoot.item);
            }
          }
        }
        
        // Update and Render Floating Texts
        // Iterate backwards to allow removal
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
          const text = this.floatingTexts[i];
          text.update(deltaTime);
          if (text.isExpired()) {
            this.floatingTexts.splice(i, 1);
          } else {
            text.draw(this.ctx);
          }
        }
    
            // Restore context transform (for UI elements that should be fixed to screen)
            if (camera) {
              this.ctx.restore();
            }    // Render edge indicators (in screen space, after camera transform)
    if (camera) {
      this.renderEdgeIndicators(playersSnapshot, localPlayer, camera, gameState.loot);
    }
  }

  renderConflictZone(zone) {
    // Draw danger area outside zone (in world coordinates) using a path with a hole
    // This avoids destination-out which clears the background pattern
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Dark gray dimming
    
    this.ctx.beginPath();
    // Outer rectangle (entire world)
    this.ctx.rect(0, 0, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT);
    // Inner circle (safe zone) - drawn counter-clockwise to create a hole
    this.ctx.arc(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2, true);
    this.ctx.fill();
    this.ctx.restore();

    // Draw zone boundary stroke
    this.ctx.strokeStyle = '#ff6b6b';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  renderPlayer(player, isLocal = false) {
    // Use sprite sheet animation rendering
    this.renderPlayerWithSpriteSheet(player, isLocal);
  }

  renderLoot(lootItems) {
    if (!Array.isArray(lootItems)) return;

    for (const loot of lootItems) {
      // Draw loot circle
      this.ctx.fillStyle = '#f9ca24'; // Golden yellow
      this.ctx.beginPath();
      this.ctx.arc(loot.x, loot.y, 15, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Draw item name
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 14px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(loot.item_id.toUpperCase(), loot.x, loot.y - 20);
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

  renderInteractionPrompt(player, item) {
    const isUnarmed = player.equipped_weapon === 'fist' || !player.equipped_weapon;
    let text = '';
    
    if (isUnarmed) {
      text = `Picking up ${item.item_id}...`;
    } else {
      text = `Press F to swap ${player.equipped_weapon} for ${item.item_id}`;
    }

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.font = 'bold 16px Arial';
    const metrics = this.ctx.measureText(text);
    const padding = 10;
    
    // Draw background bubble
    this.ctx.fillRect(
      player.x - metrics.width / 2 - padding,
      player.y + CONFIG.RENDER.PLAYER_RADIUS + 10,
      metrics.width + padding * 2,
      30
    );

    // Draw text
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      text,
      player.x,
      player.y + CONFIG.RENDER.PLAYER_RADIUS + 30
    );
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
   * Load sprite sheet images and metadata
   * @returns {Promise<void>}
   */
  async loadSpriteSheets() {
    const baseUrl = CONFIG.ASSETS.BASE_URL;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    try {
      // Load Walk Metadata
      const metadataPath = `${normalizedBase}${CONFIG.ASSETS.SPRITE_SHEET.METADATA}`;
      const response = await fetch(metadataPath);
      if (response.ok) {
        this.spriteSheetMetadata = await response.json();
        this.spriteSheet = this.createImage(CONFIG.ASSETS.SPRITE_SHEET.PATH);
        await new Promise((resolve, reject) => {
          this.spriteSheet.onload = resolve;
          this.spriteSheet.onerror = reject;
        });
      }

      // Load Attack Metadata
      const attackMetadataPath = `${normalizedBase}${CONFIG.ASSETS.ATTACK_SPRITE_SHEET.METADATA}`;
      const attackResponse = await fetch(attackMetadataPath);
      if (attackResponse.ok) {
        this.attackSpriteSheetMetadata = await attackResponse.json();
        this.attackSpriteSheet = this.createImage(CONFIG.ASSETS.ATTACK_SPRITE_SHEET.PATH);
        await new Promise((resolve, reject) => {
          this.attackSpriteSheet.onload = resolve;
          this.attackSpriteSheet.onerror = reject;
        });
      }

      // Mark sprite sheets as loaded if at least the walk one is there
      this.spriteSheetLoaded = !!this.spriteSheet;
    } catch (error) {
      console.error('Error loading sprite sheets:', error);
      // Fallback is handled by render checks
      throw error;
    }
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

    const hasAttackSprite = player.isAttacking && 
                            this.attackSpriteSheet && 
                            this.attackSpriteSheet.complete && 
                            this.attackSpriteSheetMetadata;

    // 1. Render Character Base (If NOT attacking, or if attack sprite missing)
    if (!hasAttackSprite) {
      if (this.spriteSheet && this.spriteSheet.complete && this.spriteSheetMetadata) {
        const { currentFrame, lastDirection } = player.animationState;
        const { frameWidth, frameHeight } = this.spriteSheetMetadata;
        
        const sourceX = currentFrame * frameWidth;
        const sourceY = lastDirection * frameHeight;

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
      } else {
        // Fallback: render pink rectangle
        this.ctx.fillStyle = '#ff69b4'; // Pink
        this.ctx.fillRect(
          spriteX,
          spriteY,
          size,
          size
        );
      }
    }

    // 2. Render Attack Animation (If Attacking)
    if (hasAttackSprite) {
      const { frameWidth, frameHeight } = this.attackSpriteSheetMetadata;
      const { lastDirection } = player.animationState;
      
      // Map directions to sprite sheet rows based on attack_raw alphabetical order
      // Sword Rows (Character): 4-7
      // Slash Rows (Effect): 0-3
      // Diagonals: SW (down_left), SE (down_right), NW (up_left), NE (up_right)
      
      let swordRow = 5; // Default SE
      let slashRow = 1; // Default SE
      
      // 0: South, 1: SE, 2: East, 3: NE, 4: North, 5: NW, 6: West, 7: SW
      switch (lastDirection) {
        case 0: // South -> SE
             swordRow = 5; slashRow = 1; break;
        case 1: // SE -> SE
             swordRow = 5; slashRow = 1; break;
        case 2: // East -> SE
             swordRow = 5; slashRow = 1; break;
        case 3: // NE -> NE
             swordRow = 7; slashRow = 3; break;
        case 4: // North -> NE
             swordRow = 7; slashRow = 3; break;
        case 5: // NW -> NW
             swordRow = 6; slashRow = 2; break;
        case 6: // West -> SW
             swordRow = 4; slashRow = 0; break;
        case 7: // SW -> SW
             swordRow = 4; slashRow = 0; break;
      }

      // Calculate attack frame based on time
      let renderFrame = 0;
      if (player.attackStartTime) {
        const elapsed = (performance.now() - player.attackStartTime) / 1000; // seconds
        const duration = CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS;
        const totalFrames = 4; 
        
        let frame = Math.floor((elapsed / duration) * totalFrames);
        if (frame < 0) frame = 0;
        if (frame >= totalFrames) frame = totalFrames - 1;
        
        renderFrame = frame;
      }

      const sourceX = renderFrame * frameWidth;

      // Draw Sword (Character)
      this.ctx.drawImage(
        this.attackSpriteSheet,
        sourceX,
        swordRow * frameHeight,
        frameWidth,
        frameHeight,
        spriteX,
        spriteY,
        size,
        size
      );
      
      // Draw Slash (Effect)
      this.ctx.drawImage(
        this.attackSpriteSheet,
        sourceX,
        slashRow * frameHeight,
        frameWidth,
        frameHeight,
        spriteX,
        spriteY,
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


}
