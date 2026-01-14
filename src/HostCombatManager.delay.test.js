import { jest } from '@jest/globals';
import { HostCombatManager } from './HostCombatManager.js';
import { CONFIG } from './config.js';

describe('HostCombatManager Victory Delay', () => {
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

  test('WhenLastEnemyDies_ShouldDelayGameOver', () => {
    const winner = {
      id: 'winner-id',
      player_id: 'winner-id',
      name: 'Winner',
      position_x: 10,
      position_y: 0,
      health: 100,
      equipped_weapon: 'fist',
      is_bot: false
    };
    
    const loser = {
      id: 'loser-id',
      player_id: 'loser-id',
      name: 'Loser',
      position_x: 0,
      position_y: 0,
      health: 10, // Low health
      equipped_armor: null,
      is_bot: true
    };

    mockSnapshot.getPlayers.mockReturnValue(new Map([
      ['winner-id', winner],
      ['loser-id', loser]
    ]));

    const msg = {
      from: 'winner-id',
      data: { weapon_id: 'fist', aim_x: 0, aim_y: 0, is_special: false }
    };

    // Winner kills Loser
    manager.handleAttackRequest(msg, mockSnapshot);

    // Verify Loser is dead
    expect(loser.health).toBe(0);

    // Verify death event was sent immediately
    expect(mockNetwork.send).toHaveBeenCalledWith('player_death', expect.anything());

    // Verify Game Over is NOT sent immediately
    expect(mockNetwork.send).not.toHaveBeenCalledWith('game_over', expect.anything());
    expect(mockState.isRunning).toBe(true);

    // Advance time by 3000ms (CONFIG.GAME.VICTORY_DELAY_MS)
    // We assume the config will be 3000ms
    jest.advanceTimersByTime(CONFIG.GAME.VICTORY_DELAY_MS);

    // Verify Game Over IS sent after delay
    expect(mockNetwork.send).toHaveBeenCalledWith('game_over', expect.objectContaining({
        winner_id: 'winner-id'
    }));
    
    // Verify state is no longer running
    expect(mockState.isRunning).toBe(false);
  });
});
