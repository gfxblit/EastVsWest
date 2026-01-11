/**
 * Renderer
 * Handles rendering the game state to the canvas
 */

import { CONFIG } from './config.js';
import { getDirectionFromVelocity, AnimationState } from './animationHelper.js';
import { AssetManager } from './AssetManager.js';
import { WorldRenderer } from './WorldRenderer.js';
import { PlayerRenderer } from './PlayerRenderer.js';
import { LootRenderer } from './LootRenderer.js';
import { UIRenderer } from './UIRenderer.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;

    this.assetManager = new AssetManager();
    this.worldRenderer = new WorldRenderer(this.assetManager);
    this.playerRenderer = new PlayerRenderer(this.assetManager);
    this.lootRenderer = new LootRenderer(this.assetManager);
    this.uiRenderer = new UIRenderer();

    this.remoteAnimationStates = new Map(); // Store animation state for remote players
    this.visualStates = new Map(); // Store visual state (like attack animations) for remote players

    // For compatibility with Game class
    this.previousPlayerHealth = this.uiRenderer.previousPlayerHealth;
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

    // Initialize sub-renderers
    this.worldRenderer.init(this.ctx);
    this.playerRenderer.init();
    this.lootRenderer.init();

    // Load sprite sheets for animations
    Promise.all([
      this.assetManager.loadSpriteSheet('walk', CONFIG.ASSETS.SPRITE_SHEET.METADATA, CONFIG.ASSETS.SPRITE_SHEET.PATH),
      this.assetManager.loadSpriteSheet('slash', CONFIG.ASSETS.PLAYER_SLASH.METADATA, CONFIG.ASSETS.PLAYER_SLASH.PATH)
    ]).catch(err => {
        console.warn('Failed to load sprite sheets, using fallback rendering:', err.message);
    });
    
    console.log('Renderer initialized');
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
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
    
    // World Rendering
    if (camera) {
        this.ctx.translate(this.canvas.width / 2 - camera.x, this.canvas.height / 2 - camera.y);
    }
    this.worldRenderer.render(this.ctx, camera, gameState.conflictZone);

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
        this.uiRenderer.checkForHealthChanges(playersSnapshot);
    }

    // Render all players (in world coordinates)
    if (playersSnapshot) {
      this.renderRemotePlayers(playersSnapshot, localPlayer, deltaTime);
    }

    // Render Local Player
    if (localPlayer) {
        this.playerRenderer.render(this.ctx, localPlayer, true);
    }

    // Render Loot
    if (gameState && gameState.loot) {
        this.lootRenderer.render(this.ctx, gameState.loot);
    }

    // UI Rendering
    this.uiRenderer.render(this.ctx, deltaTime, localPlayer, gameState.loot);

    // Restore context transform (for UI elements that should be fixed to screen)
    if (camera) {
        this.ctx.restore();
    }

    // Render edge indicators (in screen space, after camera transform)
    if (camera) {
        this.uiRenderer.renderEdgeIndicators(this.ctx, playersSnapshot, localPlayer, camera, gameState.loot);
    }
  }

  renderRemotePlayers(playersSnapshot, localPlayer, deltaTime) {
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
          equipped_weapon: playerData.equipped_weapon, // Needed for attack VFX
          isAttacking: isAttacking,
          attackAnimTime: visualState ? visualState.attackTimer : 0, // Pass attack timer
          animationState: animState,
        };
        this.playerRenderer.render(this.ctx, player, false);
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
}
