
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
  const originalBotConfig = { ...CONFIG.BOT };

  beforeEach(() => {
    // Override CONFIG for testing
    CONFIG.PLAYER.BASE_MOVEMENT_SPEED = 100;
    CONFIG.WEAPONS.FIST.range = 50;
    CONFIG.COMBAT.ATTACK_AIM_DISTANCE = 100;
    CONFIG.BOT = { 
      STOPPING_DISTANCE: 10,
      MOVEMENT_SPEED: 100
    };

    mockNetwork = {
      send: jest.fn(),
      sendFrom: jest.fn(),
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

    // Mock Math.random for predictable behavior
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    botController = new BotController(botId, mockNetwork, mockSnapshot, mockGame);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Restore CONFIG
    Object.assign(CONFIG.PLAYER, originalPlayerConfig);
    Object.assign(CONFIG.WEAPONS, originalWeaponsConfig);
    Object.assign(CONFIG.COMBAT, originalCombatConfig);
    CONFIG.BOT = originalBotConfig;
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

    expect(mockNetwork.sendFrom).toHaveBeenCalledWith(botId, 'attack_request', expect.any(Object)); 
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

  test('WhenBotMovesIntoProp_ShouldBeBlocked', () => {
    // tree_1 is at 400, 400. Size 40x40. X Range [380, 420].
    // Bot collision logic will mirror player logic.

    const botPlayer = mockSnapshot.getPlayers().get(botId);
    const hitboxRadius = CONFIG.PLAYER.HITBOX_RADIUS;
    
    // Start bot just to the left of the tree.
    // Left edge of tree = 380.
    // Bot Right Edge = x + hitboxRadius.
    // Start Bot at 380 - hitboxRadius - 10.
    // hitboxRadius is 40. Start at 330.
    
    botPlayer.position_x = 380 - hitboxRadius - 10;
    botPlayer.position_y = 400; // Center Y
    
    // Set Target to the right of the tree (e.g. 500, 400)
    mockSnapshot.getPlayers().get(targetId).position_x = 500;
    mockSnapshot.getPlayers().get(targetId).position_y = 400;
    
    // Speed 100.
    // Update for 0.5s -> move 50px. Target X = 330 + 50 = 380.
    // 380 + 40 (hitbox) = 420. This is > 380 (tree left).
    // Should be clamped. Max X = 380 - 40 = 340.
    
    botController.update(0.5);

    // Verify position in broadcast
    const lastUpdate = mockNetwork.broadcastPlayerStateUpdate.mock.calls[mockNetwork.broadcastPlayerStateUpdate.mock.calls.length - 1][0];
    
    const expectedMaxX = 380 - hitboxRadius;
    expect(lastUpdate.position_x).toBeLessThanOrEqual(expectedMaxX + 0.1);
    expect(lastUpdate.position_x).toBeGreaterThan(botPlayer.position_x); // Should have moved some amount
  });
});
