/**
 * Game Logic
 * Manages game state and core game logic for Conflict Zone: East vs West
 */

import { CONFIG } from './config.js';
import { getDirectionFromVelocity, updateAnimationState } from './animationHelper.js';

export class Game {
  constructor() {
    this.state = {
      conflictZone: {
        centerX: CONFIG.WORLD.WIDTH / 2,
        centerY: CONFIG.WORLD.HEIGHT / 2,
        radius: CONFIG.ZONE.INITIAL_RADIUS,
      },
      loot: [],
      gameTime: 0,
      phase: 0,
      isRunning: false,
    };
    this.localPlayer = null;
    this.playersSnapshot = null;
    this.network = null;
    this.lastPositionSendTime = 0;
    this.lastSentState = null;
    this.healthUpdateAccumulator = 0;
  }

  init(playersSnapshot = null, network = null) {
    this.playersSnapshot = playersSnapshot;
    this.network = network;
    this.state.isRunning = true;

    // Initialize local player
    if (playersSnapshot && network) {
      // Multiplayer mode: get local player from snapshot
      const snapshotPlayers = playersSnapshot.getPlayers();
      const localPlayerData = snapshotPlayers.get(network.playerId);

      if (localPlayerData) {
        this.localPlayer = {
          id: network.playerId,
          name: localPlayerData.player_name,
          x: localPlayerData.position_x,
          y: localPlayerData.position_y,
          rotation: localPlayerData.rotation,
          health: localPlayerData.health,
          weapon: localPlayerData.equipped_weapon || null,
          armor: localPlayerData.equipped_armor || null,
          velocity: {
            x: localPlayerData.velocity_x || 0,
            y: localPlayerData.velocity_y || 0
          },
          animationState: {
            currentFrame: 0,
            timeAccumulator: 0,
            lastDirection: 0, // Default to South
          },
        };

        // Initialize lastSentState to prevent unnecessary initial send
        this.lastSentState = {
          x: localPlayerData.position_x,
          y: localPlayerData.position_y,
          rotation: localPlayerData.rotation,
          health: localPlayerData.health,
          vx: localPlayerData.velocity_x || 0,
          vy: localPlayerData.velocity_y || 0,
        };
      }
    } else {
      // Single player test mode
      this.localPlayer = {
        id: 'player-1',
        x: CONFIG.WORLD.WIDTH / 2,
        y: CONFIG.WORLD.HEIGHT / 2,
        health: 100,
        weapon: null,
        armor: null,
        velocity: { x: 0, y: 0 },
        rotation: 0,
        animationState: {
          currentFrame: 0,
          timeAccumulator: 0,
          lastDirection: 0, // Default to South
        },
      };
    }
  }

  update(deltaTime) {
    if (!this.state.isRunning) return;

    this.state.gameTime += deltaTime;

    // Update conflict zone
    this.updateConflictZone(deltaTime);

    // Update local player
    if (this.localPlayer) {
      this.updateLocalPlayer(deltaTime);
    }

    // Host-authoritative health update
    if (this.network?.isHost) {
      this.updateAllPlayersHealth(deltaTime);
    }

    // Send position update for local player in multiplayer mode
    if (this.playersSnapshot && this.network) {
      this.sendLocalPlayerPosition();
    }
  }

  updateConflictZone(deltaTime) {
    // Start shrinking after initial delay
    if (this.state.gameTime > CONFIG.GAME.INITIAL_ZONE_SHRINK_DELAY_SECONDS) {
      const shrinkRate = CONFIG.ZONE.BASE_SHRINK_RATE * Math.pow(CONFIG.ZONE.SHRINK_RATE_MULTIPLIER, this.state.phase);
      this.state.conflictZone.radius = Math.max(
        CONFIG.ZONE.MIN_RADIUS,
        this.state.conflictZone.radius - shrinkRate * deltaTime
      );
    }
  }

  updateLocalPlayer(deltaTime) {
    // Update player position based on velocity
    this.localPlayer.x += this.localPlayer.velocity.x * deltaTime;
    this.localPlayer.y += this.localPlayer.velocity.y * deltaTime;

    // Calculate direction from velocity for animation
    const isMoving = this.localPlayer.velocity.x !== 0 || this.localPlayer.velocity.y !== 0;
    const direction = getDirectionFromVelocity(this.localPlayer.velocity.x, this.localPlayer.velocity.y);

    // Update animation state using helper function
    updateAnimationState(this.localPlayer.animationState, deltaTime, isMoving, direction);

    // Update rotation based on velocity (if moving)
    if (this.localPlayer.velocity.x !== 0 || this.localPlayer.velocity.y !== 0) {
      // atan2 gives angle in standard math convention (0 = east, counter-clockwise)
      // Convert to game convention (0 = north, clockwise) by adding π/2
      this.localPlayer.rotation = Math.atan2(this.localPlayer.velocity.y, this.localPlayer.velocity.x) + Math.PI / 2;
      // Normalize to 0-2π range
      if (this.localPlayer.rotation < 0) {
        this.localPlayer.rotation += 2 * Math.PI;
      } else if (this.localPlayer.rotation >= 2 * Math.PI) {
        this.localPlayer.rotation -= 2 * Math.PI;
      }
    }

    // Keep player within world bounds
    this.localPlayer.x = Math.max(0, Math.min(CONFIG.WORLD.WIDTH, this.localPlayer.x));
    this.localPlayer.y = Math.max(0, Math.min(CONFIG.WORLD.HEIGHT, this.localPlayer.y));

    // Sync health from snapshot if available (Client sync)
    if (this.playersSnapshot && this.network) {
      const snapshotData = this.playersSnapshot.getPlayers().get(this.network.playerId);
      if (snapshotData && snapshotData.health !== undefined) {
        this.localPlayer.health = snapshotData.health;
      }
    }
  }

  /** @authority HOST */
  updateAllPlayersHealth(deltaTime) {
    if (!this.network?.isHost || !this.playersSnapshot) return;

    // Accumulate time since last update
    this.healthUpdateAccumulator += deltaTime;

    // Throttle updates to match network simulation interval
    const updateIntervalSeconds = CONFIG.NETWORK.GAME_SIMULATION_INTERVAL_MS / 1000;
    if (this.healthUpdateAccumulator < updateIntervalSeconds) {
      return;
    }

    const updates = [];
    const players = this.playersSnapshot.getPlayers();

    // Calculate damage per second based on phase
    const damagePerSecond = CONFIG.ZONE.DAMAGE_PER_SECOND +
      (CONFIG.ZONE.DAMAGE_INCREASE_PER_PHASE * this.state.phase);
    
    // Apply damage for the accumulated time
    const damageAmount = damagePerSecond * this.healthUpdateAccumulator;

    for (const [playerId, player] of players) {
      // Check if player is outside conflict zone
      const distanceFromCenter = Math.sqrt(
        Math.pow(player.position_x - this.state.conflictZone.centerX, 2) +
        Math.pow(player.position_y - this.state.conflictZone.centerY, 2)
      );

      if (distanceFromCenter > this.state.conflictZone.radius) {
        // Apply damage
        const currentHealth = player.health !== undefined ? player.health : 100;
        const newHealth = Math.max(0, currentHealth - damageAmount);

        if (newHealth !== currentHealth) {
          // Update snapshot directly so subsequent ticks use new value
          player.health = newHealth;

          updates.push({
            player_id: playerId,
            health: newHealth
          });
        }
      }
    }

    if (updates.length > 0) {
      this.network.broadcastPlayerStateUpdate(updates);
    }

    // Reset accumulator after processing
    this.healthUpdateAccumulator = 0;
  }

  sendLocalPlayerPosition() {
    if (!this.localPlayer) return;

    // Throttle to configured interval
    const now = Date.now();
    const minInterval = CONFIG.NETWORK.GAME_SIMULATION_INTERVAL_MS;
    if (now - this.lastPositionSendTime < minInterval) {
      return;
    }

    // Only send if position/rotation/health/velocity changed
    const currentState = {
      x: this.localPlayer.x,
      y: this.localPlayer.y,
      rotation: this.localPlayer.rotation,
      health: this.localPlayer.health,
      vx: this.localPlayer.velocity.x,
      vy: this.localPlayer.velocity.y,
    };

    if (this.lastSentState &&
        Math.abs(this.lastSentState.x - currentState.x) < Number.EPSILON &&
        Math.abs(this.lastSentState.y - currentState.y) < Number.EPSILON &&
        Math.abs(this.lastSentState.rotation - currentState.rotation) < Number.EPSILON &&
        Math.abs(this.lastSentState.health - currentState.health) < Number.EPSILON &&
        Math.abs(this.lastSentState.vx - currentState.vx) < Number.EPSILON &&
        Math.abs(this.lastSentState.vy - currentState.vy) < Number.EPSILON) {
      return; // No change, don't send
    }

    // Send movement update (including health and velocity) using flattened format
    this.network.sendMovementUpdate({
      position_x: this.localPlayer.x,
      position_y: this.localPlayer.y,
      rotation: this.localPlayer.rotation,
      velocity_x: this.localPlayer.velocity.x,
      velocity_y: this.localPlayer.velocity.y,
      health: this.localPlayer.health,
    });

    // Remember last sent state and time
    this.lastSentState = currentState;
    this.lastPositionSendTime = now;
  }

  handleInput(inputState) {
    if (!this.localPlayer) return;

    // Update player velocity based on input
    // Apply speed modifier for double-handed weapons
    const speedModifier = this.localPlayer.weapon?.stance === 'double'
      ? CONFIG.PLAYER.DOUBLE_HANDED_SPEED_MODIFIER
      : 1.0;
    const speed = CONFIG.PLAYER.BASE_MOVEMENT_SPEED * speedModifier;

    let velocityX = inputState.moveX * speed;
    let velocityY = inputState.moveY * speed;

    // Normalize diagonal movement
    if (inputState.moveX !== 0 && inputState.moveY !== 0) {
      velocityX /= Math.SQRT2;
      velocityY /= Math.SQRT2;
    }

    this.localPlayer.velocity = {
      x: velocityX,
      y: velocityY,
    };

    // Update rotation based on aim direction (if aiming)
    if (inputState.aimX !== undefined && inputState.aimY !== undefined) {
      // Calculate aim direction relative to player's world position
      // Note: aimX and aimY are in screen coordinates, need to convert to world coordinates
      // For now, we'll assume they're already in the same coordinate space as player position
      const aimDeltaX = inputState.aimX - this.localPlayer.x;
      const aimDeltaY = inputState.aimY - this.localPlayer.y;

      // Only update rotation if aiming at a different position (not at player itself)
      if (Math.abs(aimDeltaX) > 0.01 || Math.abs(aimDeltaY) > 0.01) {
        // atan2 gives angle in standard math convention (0 = east, counter-clockwise)
        // Convert to game convention (0 = north, clockwise) by adding π/2
        this.localPlayer.rotation = Math.atan2(aimDeltaY, aimDeltaX) + Math.PI / 2;
        // Normalize to 0-2π range
        if (this.localPlayer.rotation < 0) {
          this.localPlayer.rotation += 2 * Math.PI;
        } else if (this.localPlayer.rotation >= 2 * Math.PI) {
          this.localPlayer.rotation -= 2 * Math.PI;
        }
      }
    }
  }

  getState() {
    return this.state;
  }

  getLocalPlayer() {
    return this.localPlayer;
  }
}
