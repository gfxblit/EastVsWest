
import { jest, describe, beforeEach, test, expect, afterEach } from '@jest/globals';
import { BotController } from './BotController.js';
import { CONFIG } from './config.js';

describe('BotController', () => {
  let botController;
  let mockNetwork;
  let mockSnapshot;
  let mockGame;
  let botId = 'bot-1';
  let targetId = 'player-1';

  // Store original config
  const originalPlayerConfig = { ...CONFIG.PLAYER };
  const originalWeaponsConfig = { ...CONFIG.WEAPONS };
  const originalCombatConfig = { ...CONFIG.COMBAT };

  beforeEach(() => {
    // Override CONFIG for testing
    CONFIG.PLAYER.BASE_MOVEMENT_SPEED = 100;
    CONFIG.WEAPONS.FIST.range = 50;
    CONFIG.COMBAT.ATTACK_AIM_DISTANCE = 100;

    mockNetwork = {
      send: jest.fn(),
      broadcastPlayerStateUpdate: jest.fn(),
      isHost: true,
      playerId: 'host-player'
    };

    const players = new Map();
    // Bot
    players.set(botId, {
      id: botId,
      player_id: botId,
      position_x: 0,
      position_y: 0,
      health: 100,
      equipped_weapon: 'fist',
      is_bot: true
    });
    // Target Player
    players.set(targetId, {
      id: targetId,
      player_id: targetId,
      position_x: 200, // Distance 200
      position_y: 0,
      health: 100,
      is_bot: false
    });

    mockSnapshot = {
      getPlayers: () => players
    };
    
    // Minimal mock of game state for zone checks if needed
    mockGame = {
        state: {
            conflictZone: {
                centerX: 0,
                centerY: 0,
                radius: 1000
            }
        }
    };

    botController = new BotController(botId, mockNetwork, mockSnapshot, mockGame);
  });

  afterEach(() => {
    // Restore CONFIG
    Object.assign(CONFIG.PLAYER, originalPlayerConfig);
    Object.assign(CONFIG.WEAPONS, originalWeaponsConfig);
    Object.assign(CONFIG.COMBAT, originalCombatConfig);
  });

  test('should find nearest target', () => {
    // Add another player further away
    mockSnapshot.getPlayers().set('player-far', {
      id: 'player-far',
      player_id: 'player-far',
      position_x: 500,
      position_y: 500,
      health: 100
    });

    const target = botController.findTarget();
    expect(target.player_id).toBe(targetId);
  });

  test('should move towards target', () => {
    const deltaTime = 1.0; // 1 second
    botController.update(deltaTime);

    // Should broadcast movement
    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledWith(expect.objectContaining({
      player_id: botId,
      position_x: 100,
      position_y: 0
    }));
  });

  test('should attack when in range', () => {
    // Move bot close to target (range is 50)
    mockSnapshot.getPlayers().get(botId).position_x = 160; // 40 units away from 200
    
    botController.update(0.1);

    expect(mockNetwork.send).toHaveBeenCalledWith('attack_request', expect.any(Object)); 
  });
  
  test('should wander if no target', () => {
      mockSnapshot.getPlayers().delete(targetId); // Remove target
      
      const initialX = mockSnapshot.getPlayers().get(botId).position_x;
      botController.update(1.0);
      
      // Should have broadcasted some movement
      expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
      const lastUpdate = mockNetwork.broadcastPlayerStateUpdate.mock.calls[0][0];
      
      expect(lastUpdate.position_x !== initialX || lastUpdate.position_y !== 0).toBe(true);
  });
});
