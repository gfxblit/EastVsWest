import { CONFIG } from './config.js';

export class HostLootManager {
  constructor(network, state) {
    this.network = network;
    this.state = state; // Shared game state
    this.nextLootId = 1; // Counter for unique loot IDs
    
    this.#setupListeners();
  }

  #setupListeners() {
    if (!this.network) return;

    this.network.on('postgres_changes', (payload) => {
      if (payload.table === 'session_players' && payload.eventType === 'INSERT') {
        const newPlayerId = payload.new.player_id;
        if (newPlayerId !== this.network.playerId) {
          console.log(`Host: New player ${newPlayerId} joined, syncing loot...`);
          this.syncLootToPlayer(newPlayerId);
        }
      }
    });
  }

  spawnLoot(itemId, x, y, type = 'weapon') {
    const lootId = `loot-${this.nextLootId++}`;
    const lootItem = {
      id: lootId,
      type,
      item_id: itemId,
      x,
      y,
    };

    this.state.loot.push(lootItem);
    
    if (this.network?.isHost) {
      this.network.send('loot_spawned', lootItem);
    }
    
    return lootItem;
  }

  spawnRandomLoot(count) {
    if (!this.network?.isHost) return;

    const weaponTypes = Object.values(CONFIG.WEAPONS).filter(w => w.id !== 'fist');
    
    for (let i = 0; i < count; i++) {
      const randomWeapon = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
      
      // Random position with some padding from edges
      const padding = 50;
      const x = padding + Math.random() * (CONFIG.WORLD.WIDTH - padding * 2);
      const y = padding + Math.random() * (CONFIG.WORLD.HEIGHT - padding * 2);

      this.spawnLoot(randomWeapon.id, x, y);
    }
  }

  syncLootToPlayer(playerId) {
    if (!this.network?.isHost) return;

    // Send all loot in a single batch message to avoid rate limiting/message loss
    this.network.send('loot_sync', {
      loot: this.state.loot,
      target_player_id: playerId // Optional: could be used by clients to ignore if not meant for them (though 'send' is broadcast)
    });
  }

  removeLoot(lootId) {
    const index = this.state.loot.findIndex(item => item.id === lootId);
    if (index !== -1) {
      this.state.loot.splice(index, 1);
      return true;
    }
    return false;
  }

  handleLootSyncRequest(message) {
      if (!this.network?.isHost) return;
      this.syncLootToPlayer(message.from);
  }

  handlePickupRequest(message, playersSnapshot) {
    if (!this.network?.isHost || !playersSnapshot) return;

    const playerId = message.from;
    const { loot_id } = message.data;
    
    const players = playersSnapshot.getPlayers();
    const player = players.get(playerId);
    const lootItem = this.state.loot.find(item => item.id === loot_id);

    if (!player || !lootItem || player.health <= 0) return;

    // Validate distance
    const dx = player.position_x - lootItem.x;
    const dy = player.position_y - lootItem.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > CONFIG.LOOT.PICKUP_RADIUS) {
      return;
    }

    // Handle pickup
    const oldWeapon = player.equipped_weapon;
    
    // Update player weapon
    player.equipped_weapon = lootItem.item_id;

    const playerUpdate = {
      player_id: playerId,
      equipped_weapon: player.equipped_weapon
    };

    // Broadcast player update
    this.network.broadcastPlayerStateUpdate([playerUpdate]);

    // Also write to DB for persistence/initial sync of new joiners
    this.network.writePlayerStateToDB(playerId, { equipped_weapon: player.equipped_weapon })
      .catch(err => console.error('Host: DB update failed', err));

    // Remove loot item from state
    this.removeLoot(loot_id);

    // Notify clients loot is gone
    this.network.send('loot_picked_up', {
      loot_id: loot_id,
      player_id: playerId
    });

    // If player had a real weapon (not fist), drop it
    if (oldWeapon && oldWeapon !== 'fist') {
      this.spawnLoot(oldWeapon, player.position_x, player.position_y);
    }
  }
}
