/**
 * Game Logic
 * Manages game state and core game logic for Conflict Zone: East vs West
 */

import { CONFIG } from './config.js';
import { LocalPlayerController } from './LocalPlayerController.js';
import { HostCombatManager } from './HostCombatManager.js';
import { HostLootManager } from './HostLootManager.js';

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
    this.hostLootManager = null;
    this.playersSnapshot = null;
    this.network = null;
    this.renderer = null;
    this.previousPlayerHealth = new Map();
  }

  init(playersSnapshot = null, network = null, renderer = null) {
    this.playersSnapshot = playersSnapshot;
    this.network = network;
    this.renderer = renderer;
    this.state.isRunning = true;

    // Initialize Host Managers
    if (network && network.isHost) {
        this.hostCombatManager = new HostCombatManager(network, this.state);
        this.hostLootManager = new HostLootManager(network, this.state);
        
        network.on('attack_request', (msg) => this.hostCombatManager.handleAttackRequest(msg, this.playersSnapshot));
        network.on('pickup_request', (msg) => this.hostLootManager.handlePickupRequest(msg, this.playersSnapshot));
        
        // Listen for new players joining to sync game state
        network.on('postgres_changes', (payload) => {
          if (payload.eventType === 'INSERT' && payload.table === 'session_players') {
            const newPlayerId = payload.new.player_id;
            if (newPlayerId !== network.playerId) {
              console.log(`Host: New player ${newPlayerId} joined, syncing loot...`);
              this.hostLootManager.syncLootToPlayer(newPlayerId);
            }
          }
        });

        // Initial loot spawn
        if (this.state.loot.length === 0) {
          this.hostLootManager.spawnRandomLoot(CONFIG.GAME.INITIAL_LOOT_COUNT);
        }
    }

    if (network) {
      // Listen for network events
      network.on('attack_request', (msg) => this.handleAttackAnimation(msg));
      network.on('loot_spawned', (msg) => this.handleLootSpawned(msg));
      network.on('loot_picked_up', (msg) => this.handleLootPickedUp(msg));
    }

    // Initialize Local Player Controller
    let localPlayerData = null;
    if (playersSnapshot && network) {
      const snapshotPlayersMap = playersSnapshot.getPlayers();
      localPlayerData = snapshotPlayersMap.get(network.playerId);
    }
    
    this.localPlayerController = new LocalPlayerController(network, localPlayerData);

    // Initialize previous health for all players to current values
    if (this.playersSnapshot) {
      this.playersSnapshot.getPlayers().forEach(player => {
        if (player.health !== undefined) {
          this.previousPlayerHealth.set(player.player_id, player.health);
        }
      });
    }
  }

  update(deltaTime) {
    if (!this.state.isRunning) return;

    this.state.gameTime += deltaTime;

    // Update conflict zone
    this.updateConflictZone(deltaTime);

    // Update local player
    if (this.localPlayerController) {
      this.localPlayerController.update(deltaTime, this.playersSnapshot, this.state.loot);
    }

    // Host-authoritative updates
    if (this.hostCombatManager) {
      this.hostCombatManager.update(deltaTime, this.playersSnapshot);
    }

    // Check for health changes to spawn floating text
    if (this.playersSnapshot && this.renderer) {
      const players = this.playersSnapshot.getPlayers();
      players.forEach(player => {
        const prevHealth = this.previousPlayerHealth.get(player.player_id);
        const currentHealth = player.health;

        if (prevHealth !== undefined && currentHealth !== prevHealth) {
          const diff = currentHealth - prevHealth;
          if (Math.abs(diff) >= 0.1) { // Ignore tiny floating point diffs
            const text = Math.abs(Math.round(diff)).toString();
            const color = diff < 0 ? '#ff0000' : '#00ff00';
            this.renderer.addFloatingText(player.position_x, player.position_y - CONFIG.RENDER.PLAYER_RADIUS * 2, text, color);
          }
        }

        this.previousPlayerHealth.set(player.player_id, currentHealth);
      });
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
      attacker.attackStartTime = performance.now();
      // Reset after animation time
      setTimeout(() => {
        // Check if player still exists
        if (players.get(attackerId) === attacker) {
          attacker.is_attacking = false;
        }
      }, CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS * 1000);
    }
  }

  handleLootSpawned(message) {
    const lootItem = message.data;
    // Avoid duplicates
    if (!this.state.loot.find(item => item.id === lootItem.id)) {
      this.state.loot.push(lootItem);
    }
  }

  handleLootPickedUp(message) {
    const { loot_id } = message.data;
    this.state.loot = this.state.loot.filter(item => item.id !== loot_id);
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