
import { jest, describe, beforeEach, test, expect, afterEach } from '@jest/globals';
import { BotController } from './BotController.js';
import { CONFIG } from './config.js';

describe('BotController Loot Interaction', () => {
  let botController;
  let mockNetwork;
  let mockSnapshot;
  let mockGame;
  const botId = 'bot-1';

  // Store original config
  const originalPlayerConfig = { ...CONFIG.PLAYER };
  const originalBotConfig = { ...CONFIG.BOT };
  const originalLootConfig = { ...CONFIG.LOOT };
  const originalPropsMap = [...CONFIG.PROPS.MAP];

  beforeEach(() => {
    // Override CONFIG for testing
    CONFIG.PLAYER.BASE_MOVEMENT_SPEED = 100;
    CONFIG.BOT = { 
      STOPPING_DISTANCE: 10,
      MOVEMENT_SPEED: 100,
    };
    CONFIG.LOOT = {
      PICKUP_RADIUS: 50,
    };
    CONFIG.PROPS.MAP = []; // Clear props to avoid collisions in this test

    mockNetwork = {
      send: jest.fn(),
      sendFrom: jest.fn(),
      broadcastPlayerStateUpdate: jest.fn(),
      isHost: true,
      playerId: 'host-player',
    };

    const players = new Map();
    // Bot
    players.set(botId, {
      id: botId,
      player_id: botId,
      position_x: 500,
      position_y: 500,
      health: 100,
      equipped_weapon: 'fist',
      is_bot: true,
    });

    mockSnapshot = {
      getPlayers: () => players,
    };
    
    // Mock game state with loot
    mockGame = {
      state: {
        loot: [
          { id: 'loot-1', item_id: 'spear', x: 700, y: 500 },
        ],
        conflictZone: {
          centerX: 500,
          centerY: 500,
          radius: 1000,
        },
      },
    };

    botController = new BotController(botId, mockNetwork, mockSnapshot, mockGame);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Restore CONFIG
    Object.assign(CONFIG.PLAYER, originalPlayerConfig);
    CONFIG.BOT = originalBotConfig;
    Object.assign(CONFIG.LOOT, originalLootConfig);
    CONFIG.PROPS.MAP = originalPropsMap;
  });

  test('WhenUnarmed_ShouldMoveTowardsNearestLoot', () => {
    const deltaTime = 1.0; // 1 second
    botController.update(deltaTime);

    // Should broadcast movement towards (700, 500)
    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledWith(expect.objectContaining({
      player_id: botId,
      position_x: 600, // Moved 100 units from 500 towards 700
      position_y: 500,
    }));
  });

  test('WhenNearLootAndUnarmed_ShouldSendPickupRequest', () => {
    // Move bot close to loot (pickup radius is 50)
    const bot = mockSnapshot.getPlayers().get(botId);
    bot.position_x = 680; // 20 units away from loot at 700
    bot.position_y = 500;
    
    botController.update(0.1);

    expect(mockNetwork.sendFrom).toHaveBeenCalledWith(botId, 'pickup_request', {
      loot_id: 'loot-1',
    });
  });

  test('WhenArmed_ShouldPrioritizePlayersOverLoot', () => {
    // Arm the bot
    mockSnapshot.getPlayers().get(botId).equipped_weapon = 'spear';

    // Add a target player
    const targetId = 'player-1';
    mockSnapshot.getPlayers().set(targetId, {
      id: targetId,
      player_id: targetId,
      position_x: 300, // Opposite direction from loot
      position_y: 500,
      health: 100,
      is_bot: false,
    });

    const deltaTime = 1.0;
    botController.update(deltaTime);

    // Should move towards player at 300, not loot at 700
    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledWith(expect.objectContaining({
      player_id: botId,
      position_x: 400, // Moved 100 units from 500 towards 300
      position_y: 500,
    }));
  });
  
  test('WhenUnarmedAndMultipleLoot_ShouldMoveTowardsNearestOne', () => {
    mockGame.state.loot.push({ id: 'loot-2', item_id: 'bo', x: 450, y: 500 });
      
    const deltaTime = 1.0;
    botController.update(deltaTime);
      
    // Should move towards loot-2 at 450 because it's closer than loot-1 at 700
    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledWith(expect.objectContaining({
      player_id: botId,
      position_x: 450, // Reached it in 1s since speed is 100 and distance is 50
      position_y: 500,
    }));
  });
});
