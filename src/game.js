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
    this.spectatingTargetId = null;
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
        network.on('request_loot_sync', (msg) => this.hostLootManager.handleLootSyncRequest(msg));
        
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
      network.on('loot_sync', (msg) => this.handleLootSync(msg));
      network.on('player_death', (msg) => this.handlePlayerDeath(msg));
    }

    if (network && !network.isHost) {
        // Periodically request loot sync until we receive it
        // This handles cases where the initial request is lost or sent before the host is ready
        const requestSync = () => {
             if (!this.state.lootSynced) {
                 network.send('request_loot_sync', {});
             } else {
                 clearInterval(syncInterval);
             }
        };
        const syncInterval = setInterval(requestSync, 2000);
        requestSync(); // Initial call
        
        // Stop retrying after 30 seconds
        setTimeout(() => clearInterval(syncInterval), 30000);
    }

    // Initialize Local Player Controller
    let localPlayerData = null;
    if (playersSnapshot && network) {
      const snapshotPlayersMap = playersSnapshot.getPlayers();
      localPlayerData = snapshotPlayersMap.get(network.playerId);
    }
    
    this.localPlayerController = new LocalPlayerController(network, localPlayerData);

    // Initialize previous health for all players in renderer (if available)
    if (this.playersSnapshot && this.renderer && this.renderer.previousPlayerHealth) {
      this.playersSnapshot.getPlayers().forEach(player => {
        if (player.health !== undefined) {
          this.renderer.previousPlayerHealth.set(player.player_id, player.health);
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
    if (!this.renderer) return;
    const attackerId = message.from;
    
    // Skip local player (already handled in LocalPlayerController)
    const localPlayer = this.localPlayerController?.getPlayer();
    if (localPlayer && attackerId === localPlayer.id) return;

    this.renderer.triggerAttackAnimation(attackerId);
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

  handleLootSync(message) {
    const { loot } = message.data;
    if (Array.isArray(loot)) {
      // Merge or replace loot? For initial sync, replacing or merging unique items is best.
      // We'll use a Map to merge by ID to avoid duplicates if some were already present
      const lootMap = new Map(this.state.loot.map(item => [item.id, item]));
      
      loot.forEach(item => {
        lootMap.set(item.id, item);
      });
      
      this.state.loot = Array.from(lootMap.values());
      this.state.lootSynced = true; // Mark as synced
    }
  }

  handlePlayerDeath(message) {
    const { victim_id, killer_id } = message.data;
    if (this.network && victim_id === this.network.playerId) {
      console.log(`You were killed by ${killer_id}. Switching to spectator mode.`);
      this.spectatingTargetId = killer_id;
    }
  }

  getCameraTarget() {
    // If spectating, return the target player
    if (this.spectatingTargetId && this.playersSnapshot) {
      const players = this.playersSnapshot.getPlayers();
      const target = players.get(this.spectatingTargetId);
      
      const interpolated = this.playersSnapshot.getInterpolatedPlayerState(this.spectatingTargetId, performance.now());
      if (interpolated) {
        return { 
          id: this.spectatingTargetId,
          x: interpolated.x, 
          y: interpolated.y,
          name: target ? target.player_name : 'Unknown'
        };
      }
      
      if (target) {
        return {
           id: this.spectatingTargetId,
           x: target.position_x,
           y: target.position_y,
           name: target.player_name
        };
      }
    }
    
    // Default to local player
    return this.getLocalPlayer();
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