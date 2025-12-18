/**
 * Game Logic
 * Manages game state and core game logic for Conflict Zone: East vs West
 */

import { CONFIG } from './config.js';

export class Game {
  constructor() {
    this.state = {
      players: [],
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
  }

  init() {
    console.log('Game initialized');
    this.state.isRunning = true;

    // Create a test player for Phase 0
    this.state.players.push({
      id: 'player-1',
      x: CONFIG.CANVAS.WIDTH / 2,
      y: CONFIG.CANVAS.HEIGHT / 2,
      health: 100,
      weapon: null,
      armor: null,
      velocity: { x: 0, y: 0 },
    });
  }

  update(deltaTime) {
    if (!this.state.isRunning) return;

    this.state.gameTime += deltaTime;

    // Update conflict zone
    this.updateConflictZone(deltaTime);

    // Update players
    this.updatePlayers(deltaTime);
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

  updatePlayers(deltaTime) {
    for (const player of this.state.players) {
      // Update player position based on velocity
      player.x += player.velocity.x * deltaTime;
      player.y += player.velocity.y * deltaTime;

      // Keep player within canvas bounds
      player.x = Math.max(0, Math.min(CONFIG.CANVAS.WIDTH, player.x));
      player.y = Math.max(0, Math.min(CONFIG.CANVAS.HEIGHT, player.y));

      // Check if player is outside conflict zone and apply damage
      const distanceFromCenter = Math.sqrt(
        Math.pow(player.x - this.state.conflictZone.centerX, 2) +
        Math.pow(player.y - this.state.conflictZone.centerY, 2)
      );

      if (distanceFromCenter > this.state.conflictZone.radius) {
        // Player is outside zone, apply damage
        const damage = (CONFIG.ZONE.DAMAGE_PER_SECOND +
          (CONFIG.ZONE.DAMAGE_INCREASE_PER_PHASE * this.state.phase)) * deltaTime;
        player.health = Math.max(0, player.health - damage);
      }
    }
  }

  handleInput(inputState) {
    // Handle player input
    const player = this.state.players[0]; // For now, just control the first player
    if (!player) return;

    // Update player velocity based on input
    // Apply speed modifier for double-handed weapons
    const speedModifier = player.weapon?.stance === 'double'
      ? CONFIG.PLAYER.DOUBLE_HANDED_SPEED_MODIFIER
      : 1.0;
    const speed = CONFIG.PLAYER.BASE_MOVEMENT_SPEED * speedModifier;

    player.velocity = {
      x: inputState.moveX * speed,
      y: inputState.moveY * speed,
    };
  }

  getState() {
    return this.state;
  }
}
