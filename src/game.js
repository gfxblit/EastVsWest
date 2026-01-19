/**
 * Game Logic
 * Manages game state and core game logic for Conflict Zone: East vs West
 */

import { CONFIG } from './config.js';
import { LocalPlayerController } from './LocalPlayerController.js';
import { HostCombatManager } from './HostCombatManager.js';
import { HostLootManager } from './HostLootManager.js';
import { HostBotManager } from './HostBotManager.js';
import { DebugUI } from './DebugUI.js';

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
    this.hostBotManager = null;
    this.playersSnapshot = null;
    this.network = null;
    this.renderer = null;
    this.spectatingTargetId = null;
    this.debugMode = false;
    this.lastDebugState = false;
    // Only create DebugUI in browser context where document is available
    this.debugUI = typeof document !== 'undefined' ? new DebugUI(this) : null;
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
      this.hostBotManager = new HostBotManager(network, this.playersSnapshot, this);

      network.on('attack_request', (msg) => {
        if (!this.state.isRunning) return;
        this.hostCombatManager.handleAttackRequest(msg, this.playersSnapshot);
        // Also trigger animation for bots or self if needed (LocalPlayerController handles self)
        this.handleAttackAnimation(msg);
      });
      network.on('pickup_request', (msg) => {
        if (!this.state.isRunning) return;
        this.hostLootManager.handlePickupRequest(msg, this.playersSnapshot);
      });
      network.on('request_loot_sync', (msg) => {
        if (!this.state.isRunning) return;
        this.hostLootManager.handleLootSyncRequest(msg);
      });

      // Initial loot spawn
      if (this.state.loot.length === 0) {
        this.hostLootManager.spawnRandomLoot(CONFIG.GAME.INITIAL_LOOT_COUNT);
      }

      // Initialize existing bots
      this.hostBotManager.initExistingBots();
    }

    if (network) {
      // Listen for network events
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

    // If starting as a late joiner (dead), auto-select a spectator target
    if (this.localPlayerController.isDead()) {
      this.cycleSpectatorTarget();
    }

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

    // Update Bots (Host only)
    if (this.hostBotManager) {
      this.hostBotManager.update(deltaTime);
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
    if (!this.state.isRunning) return;
    if (!this.renderer) return;
    const attackerId = message.from;

    // Skip local player (already handled in LocalPlayerController)
    const localPlayer = this.localPlayerController?.getPlayer();
    if (localPlayer && attackerId === localPlayer.id) return;

    this.renderer.triggerAttackAnimation(attackerId);
  }

  handleLootSpawned(message) {
    if (!this.state.isRunning) return;
    const lootItem = message.data;
    // Avoid duplicates
    if (!this.state.loot.find(item => item.id === lootItem.id)) {
      this.state.loot.push(lootItem);
    }
  }

  handleLootPickedUp(message) {
    if (!this.state.isRunning) return;
    const { loot_id } = message.data;
    this.state.loot = this.state.loot.filter(item => item.id !== loot_id);
  }

  handleLootSync(message) {
    if (!this.state.isRunning) return;
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
    if (!this.state.isRunning) return;
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

  cycleSpectatorTarget() {
    if (!this.playersSnapshot || !this.network) return;

    const players = Array.from(this.playersSnapshot.getPlayers().values());
    // Filter for valid targets: Alive and not local player
    const candidates = players.filter(p => p.health > 0 && p.player_id !== this.network.playerId);

    if (candidates.length === 0) return; // No one else to spectate

    // Sort candidates to ensure consistent order
    candidates.sort((a, b) => a.player_id.localeCompare(b.player_id));

    // Find current index
    let currentIndex = candidates.findIndex(p => p.player_id === this.spectatingTargetId);

    // If current target is not in candidates (e.g. they died), start from 0. 
    // Otherwise go to next.
    let nextIndex = 0;
    if (currentIndex !== -1) {
      nextIndex = (currentIndex + 1) % candidates.length;
    }

    this.spectatingTargetId = candidates[nextIndex].player_id;
    console.log(`Switched spectator target to: ${candidates[nextIndex].player_name} (${this.spectatingTargetId})`);
  }

  handleInput(inputState) {
    if (inputState.toggleDebug !== this.lastDebugState) {
      this.debugMode = inputState.toggleDebug;
      this.lastDebugState = inputState.toggleDebug;
      if (this.debugUI) {
        this.debugUI.toggle();
      }
    }

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

  destroy() {
    if (this.debugUI) {
      this.debugUI.destroy();
    }
  }
}