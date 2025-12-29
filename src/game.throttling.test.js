import { jest } from '@jest/globals';
import { Game } from './game.js';
import { CONFIG } from './config.js';

describe('Game Position Throttling', () => {
  let game;
  let mockPlayersSnapshot;
  let mockNetwork;

  beforeEach(() => {
    jest.useFakeTimers();
    game = new Game();

    mockPlayersSnapshot = {
      getPlayers: jest.fn().mockReturnValue(new Map([
        ['player-1', { player_id: 'player-1', player_name: 'Alice', position_x: 100, position_y: 200, rotation: 0, health: 100 }],
      ])),
    };

    mockNetwork = {
      playerId: 'player-1',
      sendMovementUpdate: jest.fn(),
    };

    game.init(mockPlayersSnapshot, mockNetwork);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('WhenCalledFrequencyIsHigh_ShouldThrottlePositionUpdates', () => {
    // Initial send
    const t0 = 1000000;
    jest.setSystemTime(t0);
    
    // Move player and update
    game.handleInput({ moveX: 1, moveY: 0 });
    game.update(0.016);
    
    expect(mockNetwork.sendMovementUpdate).toHaveBeenCalledTimes(1);
    
    // Clear mock to track new calls
    mockNetwork.sendMovementUpdate.mockClear();

    // Advance time by slightly less than the update interval
    const intervalMs = 1000 / CONFIG.NETWORK.GAME_SIMULATION_RATE; // 50ms
    jest.setSystemTime(t0 + intervalMs - 5);
    
    // Move player again and update
    game.handleInput({ moveX: 1, moveY: 0 });
    game.update(0.016);
    
    // Should NOT send update yet due to throttling
    expect(mockNetwork.sendMovementUpdate).not.toHaveBeenCalled();
    
    // Advance time to pass the interval
    jest.setSystemTime(t0 + intervalMs + 5);
    
    // Move player again and update
    game.handleInput({ moveX: 1, moveY: 0 });
    game.update(0.016);
    
    // Should send update now
    expect(mockNetwork.sendMovementUpdate).toHaveBeenCalledTimes(1);
  });
});
