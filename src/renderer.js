/**
 * Renderer
 * Handles rendering the game state to the canvas
 */

import { CONFIG } from './config.js';
import { getDirectionFromVelocity, getDirectionFromRotation, AnimationState } from './animationHelper.js';
import { FloatingText } from './FloatingText.js';

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
    this.slashImages = {
      up: null,
      down: null,
      left: null,
      right: null
    };
    this.remoteAnimationStates = new Map(); // Store animation state for remote players
    this.visualStates = new Map(); // Store visual state (like attack animations) for remote players
    this.previousPlayerHealth = new Map(); // Store previous health for floating text diffs
    this.floatingTexts = [];
    this.weaponIcons = new Map(); // Store pre-loaded weapon icons
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

    // Load slash VFX images
    this.slashImages.up = this.createImage(CONFIG.ASSETS.VFX.SLASH.UP);
    this.slashImages.down = this.createImage(CONFIG.ASSETS.VFX.SLASH.DOWN);
    this.slashImages.left = this.createImage(CONFIG.ASSETS.VFX.SLASH.LEFT);
    this.slashImages.right = this.createImage(CONFIG.ASSETS.VFX.SLASH.RIGHT);

    // Load weapon icons
    if (CONFIG.WEAPONS) {
      Object.values(CONFIG.WEAPONS).forEach(weapon => {
        if (weapon.icon) {
          const iconPath = `${CONFIG.ASSETS.WEAPONS_BASE_URL}${weapon.icon}`;
          this.weaponIcons.set(weapon.id, this.createImage(iconPath));
        }
      });
    }

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

  addFloatingText(x, y, text, color) {
    // Add random offset to start position (-20 to +20 px)
    // This prevents text from overlapping exactly if spawned at same frame/location
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

  triggerAttackAnimation(playerId) {
    let state = this.visualStates.get(playerId);
    if (!state) {
      state = { isAttacking: false, attackTimer: 0 };
      this.visualStates.set(playerId, state);
    }
    state.isAttacking = true;
    state.attackTimer = CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS;
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

    // Update visual states (attack animations)
    this.visualStates.forEach((state, id) => {
      if (state.isAttacking) {
        state.attackTimer -= deltaTime;
        if (state.attackTimer <= 0) {
          state.isAttacking = false;
        }
      }
    });

    // Check for health changes to spawn floating text
    if (playersSnapshot) {
      this.checkForHealthChanges(playersSnapshot);
    }

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

        // Get visual state (attack animation)
        const visualState = this.visualStates.get(playerId);
        const isAttacking = (visualState && visualState.isAttacking) || playerData.is_attacking || false;

        const player = {
          id: playerId,
          name: playerData.player_name,
          x: interpolated.x,
          y: interpolated.y,
          rotation: interpolated.rotation,
          health: playerData.health,
          isAttacking: isAttacking,
          animationState: animState,
        };
        this.renderPlayer(player, false);
      });

      // Cleanup animation states and visual states for players who left
      for (const playerId of this.remoteAnimationStates.keys()) {
        if (!snapshotPlayers.has(playerId)) {
          this.remoteAnimationStates.delete(playerId);
        }
      }
      for (const playerId of this.visualStates.keys()) {
        if (!snapshotPlayers.has(playerId)) {
          this.visualStates.delete(playerId);
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
      const icon = this.weaponIcons.get(loot.item_id);
      
      if (icon && icon.complete && icon.naturalWidth > 0) {
        // Draw weapon icon
        const size = 40;
        this.ctx.drawImage(
          icon,
          0, 0, icon.naturalWidth, icon.naturalHeight,
          loot.x - size / 2, loot.y - size / 2,
          size, size
        );
      } else {
        // Fallback to yellow circle
        this.ctx.fillStyle = '#f9ca24'; // Golden yellow
        this.ctx.beginPath();
        this.ctx.arc(loot.x, loot.y, 15, 0, Math.PI * 2);
        this.ctx.fill();
      }
      
      // Draw item name
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 14px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(loot.item_id.toUpperCase(), loot.x, loot.y - 25);
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

    // Attack VFX
    if (player.isAttacking) {
      this.renderSlashAnimation(player);
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

  renderSlashAnimation(player) {
    // Total duration of attack animation
    const totalDuration = CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS;
    const remainingTime = player.attackAnimTime;
    const elapsedTime = totalDuration - remainingTime;
    
    // 5 frames total
    const frameCount = 5;
    const frameDuration = totalDuration / frameCount;
    
    let currentFrame = Math.floor(elapsedTime / frameDuration);
    if (currentFrame >= frameCount) currentFrame = frameCount - 1;
    if (currentFrame < 0) currentFrame = 0;

    // Determine direction based on rotation
    // Usage of getDirectionFromRotation from animationHelper logic
    // 0: South, 2: East, 4: North, 6: West
    // We map these to our 4 directional sprites
    const directionIndex = getDirectionFromRotation(player.rotation);
    
    let slashImage = null;
    let offsetX = 0;
    let offsetY = 0;

    // Map 8-way direction to 4-way sprites
    // North (4), NE (3), NW (5) -> UP
    // South (0), SE (1), SW (7) -> DOWN
    // East (2) -> RIGHT
    // West (6) -> LEFT

    if (directionIndex === 4 || directionIndex === 3 || directionIndex === 5) {
      slashImage = this.slashImages.up;
      offsetY = -CONFIG.COMBAT.SLASH_VFX_OFFSET; // Shift up
    } else if (directionIndex === 0 || directionIndex === 1 || directionIndex === 7) {
      slashImage = this.slashImages.down;
      offsetY = CONFIG.COMBAT.SLASH_VFX_OFFSET; // Shift down
    } else if (directionIndex === 2) {
      slashImage = this.slashImages.right;
      offsetX = CONFIG.COMBAT.SLASH_VFX_OFFSET; // Shift right
    } else if (directionIndex === 6) {
      slashImage = this.slashImages.left;
      offsetX = -CONFIG.COMBAT.SLASH_VFX_OFFSET; // Shift left
    }

    if (!slashImage || !slashImage.complete || slashImage.naturalWidth === 0) return;

    const frameWidth = 64;
    const frameHeight = 64;
    
    // Scale up the VFX slightly to look impactful
    const scale = CONFIG.COMBAT.SLASH_VFX_SCALE;
    const drawWidth = frameWidth * scale;
    const drawHeight = frameHeight * scale;

    const sourceX = currentFrame * frameWidth;
    
    // Draw centered on player + offset
    this.ctx.drawImage(
      slashImage,
      sourceX, 0, frameWidth, frameHeight,
      player.x + offsetX - drawWidth / 2,
      player.y + offsetY - drawHeight / 2,
      drawWidth,
      drawHeight
    );
  }
}
