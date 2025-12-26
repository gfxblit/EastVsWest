/**
 * Game Logic
 * Manages game state and core game logic for Conflict Zone: East vs West
 */

import { CONFIG } from './config.js';

export class Game {
  constructor() {
    this.state = {
      conflictZone: {
        centerX: CONFIG.CANVAS.WIDTH / 2,
        centerY: CONFIG.CANVAS.HEIGHT / 2,
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
    this.lastSentPosition = null;
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
          velocity: { x: 0, y: 0 },
        };

        // Initialize lastSentPosition to prevent unnecessary initial send
        this.lastSentPosition = {
          x: localPlayerData.position_x,
          y: localPlayerData.position_y,
          rotation: localPlayerData.rotation,
        };
      }
    } else {
      // Single player test mode
      this.localPlayer = {
        id: 'player-1',
        x: CONFIG.CANVAS.WIDTH / 2,
        y: CONFIG.CANVAS.HEIGHT / 2,
        health: 100,
        weapon: null,
        armor: null,
        velocity: { x: 0, y: 0 },
        rotation: 0,
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

    // Keep player within canvas bounds
    this.localPlayer.x = Math.max(0, Math.min(CONFIG.CANVAS.WIDTH, this.localPlayer.x));
    this.localPlayer.y = Math.max(0, Math.min(CONFIG.CANVAS.HEIGHT, this.localPlayer.y));

    // Check if player is outside conflict zone and apply damage
    const distanceFromCenter = Math.sqrt(
      Math.pow(this.localPlayer.x - this.state.conflictZone.centerX, 2) +
      Math.pow(this.localPlayer.y - this.state.conflictZone.centerY, 2)
    );

    if (distanceFromCenter > this.state.conflictZone.radius) {
      // Player is outside zone, apply damage
      const damage = (CONFIG.ZONE.DAMAGE_PER_SECOND +
        (CONFIG.ZONE.DAMAGE_INCREASE_PER_PHASE * this.state.phase)) * deltaTime;
      this.localPlayer.health = Math.max(0, this.localPlayer.health - damage);
    }
  }

  sendLocalPlayerPosition() {
    if (!this.localPlayer) return;

    // Only send if position/rotation changed
    const currentPos = { x: this.localPlayer.x, y: this.localPlayer.y, rotation: this.localPlayer.rotation };
    if (this.lastSentPosition &&
        this.lastSentPosition.x === currentPos.x &&
        this.lastSentPosition.y === currentPos.y &&
        this.lastSentPosition.rotation === currentPos.rotation) {
      return; // No change, don't send
    }

    // Send position update
    this.network.sendPositionUpdate({
      position: { x: this.localPlayer.x, y: this.localPlayer.y },
      rotation: this.localPlayer.rotation,
      velocity: this.localPlayer.velocity,
    });

    // Remember last sent position
    this.lastSentPosition = currentPos;
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
  }

  getState() {
    return this.state;
  }

  getLocalPlayer() {
    return this.localPlayer;
  }
}
