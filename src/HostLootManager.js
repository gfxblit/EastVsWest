import { CONFIG } from './config.js';

export class HostLootManager {
  constructor(network, state) {
    this.network = network;
    this.state = state; // Shared game state
  }

  generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for environments where crypto.randomUUID is not available
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  spawnLoot(itemId, x, y, type = 'weapon') {
    const lootItem = {
      id: this.generateUUID(),
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

  removeLoot(lootId) {
    const index = this.state.loot.findIndex(item => item.id === lootId);
    if (index !== -1) {
      this.state.loot.splice(index, 1);
      return true;
    }
    return false;
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
