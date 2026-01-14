import { jest } from '@jest/globals';
import { HostCombatManager } from './HostCombatManager.js';
import { CONFIG } from './config.js';

describe('HostCombatManager Reproduction', () => {
  let manager;
  let mockNetwork;
  let mockSnapshot;
  let mockState;

  beforeEach(() => {
    jest.useFakeTimers();
    mockNetwork = {
      isHost: true,
      broadcastPlayerStateUpdate: jest.fn(),
      send: jest.fn(),
    };
    mockSnapshot = {
      getPlayers: jest.fn(),
    };
    mockState = {
      conflictZone: {
        centerX: 0,
        centerY: 0,
        radius: 100,
      },
      phase: 0,
      isRunning: true,
    };
    manager = new HostCombatManager(mockNetwork, mockState);
    jest.spyOn(Date, 'now').mockReturnValue(10000);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('WhenBotKillsHost_ShouldTriggerGameOver', () => {
    const hostPlayer = {
      id: 'host-player-id',
      player_id: 'host-player-id',
      name: 'Host',
      position_x: 10,
      position_y: 0,
      health: 10, // Low health
      equipped_armor: null,
      is_bot: false
    };
    
    const botPlayer = {
      id: 'bot-player-id',
      player_id: 'bot-player-id',
      name: 'Bot',
      position_x: 0,
      position_y: 0,
      health: 100,
      equipped_weapon: 'fist',
      is_bot: true
    };

    mockSnapshot.getPlayers.mockReturnValue(new Map([
      ['host-player-id', hostPlayer],
      ['bot-player-id', botPlayer]
    ]));

    const msg = {
      from: 'bot-player-id',
      data: { weapon_id: 'fist', aim_x: 10, aim_y: 0, is_special: false }
    };

    // Bot attacks Host
    manager.handleAttackRequest(msg, mockSnapshot);

    // Verify Host health is updated to 0 (Fist does 15 dmg, Host has 10)
    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    const updates = mockNetwork.broadcastPlayerStateUpdate.mock.calls[0][0];
    const hostUpdate = updates.find(u => u.player_id === 'host-player-id');
    expect(hostUpdate).toBeDefined();
    expect(hostUpdate.health).toBe(0);
    expect(hostPlayer.health).toBe(0); // Should update local object

    // Verify death event
    expect(mockNetwork.send).toHaveBeenCalledWith('player_death', expect.objectContaining({
      victim_id: 'host-player-id',
      killer_id: 'bot-player-id'
    }));

    // Verify Game Over
    // Active players should be 1 (Bot)
    
    // Advance time for delay
    jest.advanceTimersByTime(3000);

    // Game Over should be sent
    expect(mockNetwork.send).toHaveBeenCalledWith('game_over', expect.objectContaining({
        winner_id: 'bot-player-id'
    }));
    
    expect(mockState.isRunning).toBe(false);
  });

  test('WhenHostDiesButMultipleBotsRemain_ShouldContinueUntilOneBotLeft', () => {
    const hostPlayer = {
      player_id: 'host-player-id',
      name: 'Host',
      position_x: 10,
      position_y: 0,
      health: 10,
      equipped_armor: null,
      is_bot: false
    };
    
    const bot1 = {
      player_id: 'bot-1-id',
      name: 'Bot 1',
      position_x: 0,
      position_y: 0,
      health: 100,
      equipped_weapon: 'fist',
      is_bot: true
    };

    const bot2 = {
      player_id: 'bot-2-id',
      name: 'Bot 2',
      position_x: 100,
      position_y: 100,
      health: 100,
      equipped_weapon: 'fist',
      is_bot: true
    };

    mockSnapshot.getPlayers.mockReturnValue(new Map([
      ['host-player-id', hostPlayer],
      ['bot-1-id', bot1],
      ['bot-2-id', bot2]
    ]));

    // Bot 1 kills Host
    manager.handleAttackRequest({
      from: 'bot-1-id',
      data: { weapon_id: 'fist', aim_x: 10, aim_y: 0, is_special: false }
    }, mockSnapshot);

    // Verify Host health is 0
    expect(hostPlayer.health).toBe(0);

    // Game should STILL BE RUNNING because 2 bots remain
    expect(mockState.isRunning).toBe(true);
    expect(mockNetwork.send).not.toHaveBeenCalledWith('game_over', expect.anything());

    // Advance time to bypass cooldown
    Date.now.mockReturnValue(20000);

    // Bot 1 attacks Bot 2 (who is at 100, 100) - needs to move closer first in real game, but here we just set position
    bot2.position_x = 10;
    bot2.position_y = 0;
    bot2.health = 10; // set low health for quick kill

    // Bot 1 kills Bot 2
    manager.handleAttackRequest({
      from: 'bot-1-id',
      data: { weapon_id: 'fist', aim_x: 10, aim_y: 0, is_special: false }
    }, mockSnapshot);

    expect(bot2.health).toBe(0);

    // Advance time for delay
    jest.advanceTimersByTime(3000);

    // NOW Game Over should trigger
    expect(mockNetwork.send).toHaveBeenCalledWith('game_over', expect.objectContaining({
        winner_id: 'bot-1-id'
    }));
    expect(mockState.isRunning).toBe(false);
  });
});
