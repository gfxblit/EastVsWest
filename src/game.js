/**
 * Game Logic
 * Manages game state and core game logic for Conflict Zone: East vs West
 */

import { CONFIG } from './config.js';
import { LocalPlayerController } from './LocalPlayerController.js';
import { HostCombatManager } from './HostCombatManager.js';

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
    this.localPlayerController = null;
    this.hostCombatManager = null;
    this.playersSnapshot = null;
    this.network = null;
  }

  init(playersSnapshot = null, network = null) {
    this.playersSnapshot = playersSnapshot;
    this.network = network;
    this.state.isRunning = true;

    // Initialize Host Combat Manager
    if (network) {
        this.hostCombatManager = new HostCombatManager(network, this.state);
    }

    // Initialize Local Player Controller
    let localPlayerData = null;
    if (playersSnapshot && network) {
      const snapshotPlayersMap = playersSnapshot.getPlayers();
      localPlayerData = snapshotPlayersMap.get(network.playerId);

      if (network.isHost) {
        network.on('attack_request', (msg) => this.hostCombatManager.handleAttackRequest(msg, this.playersSnapshot));
      }

      // Listen for attack requests to trigger animations on remote players
      network.on('attack_request', (msg) => this.handleAttackAnimation(msg));
    }
    
    this.localPlayerController = new LocalPlayerController(network, localPlayerData);
  }

  update(deltaTime) {
    if (!this.state.isRunning) return;

    this.state.gameTime += deltaTime;

    // Update conflict zone
    this.updateConflictZone(deltaTime);

    // Update local player
    if (this.localPlayerController) {
      this.localPlayerController.update(deltaTime, this.playersSnapshot);
    }

    // Host-authoritative updates
    if (this.hostCombatManager) {
      this.hostCombatManager.update(deltaTime, this.playersSnapshot);
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

  handleAttackAnimation(message) {
    if (!this.playersSnapshot) return;
    const attackerId = message.from;
    
    // Skip local player (already handled in LocalPlayerController)
    const localPlayer = this.localPlayerController?.getPlayer();
    if (localPlayer && attackerId === localPlayer.id) return;

    const players = this.playersSnapshot.getPlayers();
    const attacker = players.get(attackerId);
    
    if (attacker) {
      attacker.is_attacking = true;
      // Reset after animation time
      setTimeout(() => {
        // Check if player still exists
        if (players.get(attackerId) === attacker) {
          attacker.is_attacking = false;
        }
      }, CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS * 1000);
    }
  }

  handleInput(inputState) {
    if (this.localPlayerController) {
      this.localPlayerController.handleInput(inputState);
    }
  }

  getState() {
    return this.state;
  }

  getLocalPlayer() {
    return this.localPlayerController?.getPlayer();
  }
}