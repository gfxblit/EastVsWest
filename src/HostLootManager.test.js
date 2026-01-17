import { jest } from '@jest/globals';
import { HostLootManager } from './HostLootManager.js';
import { CONFIG } from './config.js';

describe('HostLootManager', () => {
  let mockNetwork;
  let state;
  let lootManager;

  beforeEach(() => {
    mockNetwork = {
      isHost: true,
      playerId: 'host-id',
      broadcastPlayerStateUpdate: jest.fn(),
      writePlayerStateToDB: jest.fn().mockResolvedValue({}),
      send: jest.fn(),
      on: jest.fn(),
    };
    state = {
      loot: [],
      phase: 0,
    };
    lootManager = new HostLootManager(mockNetwork, state);
  });

  test('WhenSpawnLootCalled_ShouldAddItemToStateAndBroadcast', () => {
    // Act
    lootManager.spawnLoot('spear', 100, 200);

    // Assert
    expect(state.loot).toHaveLength(1);
    expect(state.loot[0]).toMatchObject({
      type: 'weapon',
      item_id: 'spear',
      x: 100,
      y: 200,
    });
    expect(state.loot[0].id).toBeDefined();

    expect(mockNetwork.send).toHaveBeenCalledWith('loot_spawned', expect.objectContaining({
      type: 'weapon',
      item_id: 'spear',
      x: 100,
      y: 200,
    }));
  });

  test('WhenHandlePickupRequestValid_ShouldUpdatePlayerAndRemoveLoot', () => {
    // Arrange
    lootManager.spawnLoot('spear', 100, 100);
    const lootItem = state.loot[0];
    const mockPlayers = new Map([
      ['player-1', { 
        player_id: 'player-1', 
        position_x: 105, 
        position_y: 105, 
        health: 100,
        equipped_weapon: 'fist' 
      }]
    ]);
    const mockSnapshot = { getPlayers: () => mockPlayers };

    // Act
    lootManager.handlePickupRequest({
      from: 'player-1',
      data: { loot_id: lootItem.id }
    }, mockSnapshot);

    // Assert
    expect(state.loot).toHaveLength(0);
    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        player_id: 'player-1',
        equipped_weapon: 'spear'
      })
    ]));
    expect(mockNetwork.send).toHaveBeenCalledWith('loot_picked_up', {
      loot_id: lootItem.id,
      player_id: 'player-1'
    });
  });

  test('WhenHandlePickupRequestTooFar_ShouldDoNothing', () => {
    // Arrange
    lootManager.spawnLoot('spear', 100, 100);
    const lootItem = state.loot[0];
    const mockPlayers = new Map([
      ['player-1', { 
        player_id: 'player-1', 
        position_x: 500, 
        position_y: 500, 
        health: 100,
        equipped_weapon: 'fist' 
      }]
    ]);
    const mockSnapshot = { getPlayers: () => mockPlayers };

    // Act
    lootManager.handlePickupRequest({
      from: 'player-1',
      data: { loot_id: lootItem.id }
    }, mockSnapshot);

    // Assert
    expect(state.loot).toHaveLength(1);
    expect(mockNetwork.broadcastPlayerStateUpdate).not.toHaveBeenCalled();
  });

  test('WhenSwappingWeapon_ShouldSpawnOldWeaponAndEquipNew', () => {
    // Arrange
    lootManager.spawnLoot('spear', 100, 100);
    const lootItem = state.loot[0];
    const mockPlayers = new Map([
      ['player-1', { 
        player_id: 'player-1', 
        position_x: 105, 
        position_y: 105, 
        health: 100,
        equipped_weapon: 'bo' 
      }]
    ]);
    const mockSnapshot = { getPlayers: () => mockPlayers };

    // Act
    lootManager.handlePickupRequest({
      from: 'player-1',
      data: { loot_id: lootItem.id }
    }, mockSnapshot);

    // Assert
    // New weapon 'spear' equipped
    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        player_id: 'player-1',
        equipped_weapon: 'spear'
      })
    ]));
    
    // Old weapon 'bo' dropped (spawned)
    expect(state.loot).toHaveLength(1);
    expect(state.loot[0].item_id).toBe('bo');
    expect(mockNetwork.send).toHaveBeenCalledWith('loot_spawned', expect.objectContaining({
      item_id: 'bo'
    }));
  });

  test('WhenSpawnRandomLootCalled_ShouldSpawnMultipleItems', () => {
    // Act
    lootManager.spawnRandomLoot(5);

    // Assert
    expect(state.loot).toHaveLength(5);
    expect(mockNetwork.send).toHaveBeenCalledTimes(1);
    expect(mockNetwork.send).toHaveBeenCalledWith('loot_sync', expect.objectContaining({
      loot: expect.any(Array)
    }));
    
    // Check that items are within bounds
    state.loot.forEach(item => {
        expect(item.x).toBeGreaterThanOrEqual(50);
        expect(item.x).toBeLessThanOrEqual(CONFIG.WORLD.WIDTH - 50);
        expect(item.y).toBeGreaterThanOrEqual(50);
        expect(item.y).toBeLessThanOrEqual(CONFIG.WORLD.HEIGHT - 50);
        expect(item.item_id).not.toBe('fist');
    });
  });
});
