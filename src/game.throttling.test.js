import { jest } from '@jest/globals';
import { Game } from './game.js';
import { CONFIG } from './config.js';

describe('Game Throttling', () => {
  let game;
  let mockPlayersSnapshot;
  let mockNetwork;

  beforeEach(() => {
    jest.useFakeTimers();
    game = new Game();

    mockPlayersSnapshot = {
      getPlayers: jest.fn().mockReturnValue(new Map([
        ['player-1', { player_id: 'player-1', player_name: 'Alice', position_x: 0, position_y: 0, health: 100 }],
        ['player-2', { player_id: 'player-2', player_name: 'Bob', position_x: 0, position_y: 0, health: 100 }],
      ])),
    };

    mockNetwork = {
      playerId: 'player-1',
      isHost: true,
      on: jest.fn(),
      broadcastPlayerStateUpdate: jest.fn(),
    };

    game.init(mockPlayersSnapshot, mockNetwork);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Position Throttling', () => {
    test('WhenCalledFrequencyIsHigh_ShouldThrottlePositionUpdates', () => {
      // Initial send
      const t0 = 1000000;
      jest.setSystemTime(t0);
      
      // Move player and update
      game.handleInput({ moveX: 1, moveY: 0 });
      game.update(0.016);
      
      expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledTimes(1);
      
      // Clear mock to track new calls
      mockNetwork.broadcastPlayerStateUpdate.mockClear();
  
      // Advance time by slightly less than the update interval
      const intervalMs = CONFIG.NETWORK.GAME_SIMULATION_INTERVAL_MS; // 50ms
      jest.setSystemTime(t0 + intervalMs - 5);
      
      // Move player again and update
      game.handleInput({ moveX: 1, moveY: 0 });
      game.update(0.016);
      
      // Should NOT send update yet due to throttling
      expect(mockNetwork.broadcastPlayerStateUpdate).not.toHaveBeenCalled();
      
      // Advance time to pass the interval
      jest.setSystemTime(t0 + intervalMs + 5);
      
      // Move player again and update
      game.handleInput({ moveX: 1, moveY: 0 });
      game.update(0.016);
      
      // Should send update now
      expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Health Throttling', () => {
    beforeEach(() => {
        // Set zone radius to be small so players are outside and take damage
        game.state.conflictZone.radius = 10;
        // Set phase to 1 so damage > 0
        game.state.phase = 1;
    });

    test('WhenCalledFrequencyIsHigh_ShouldThrottleHealthUpdates', () => {
        // Initial update
        game.update(0.016);
        
        // Should have sent one update (or zero if accumulating)
        // With throttling, it won't send on first frame if accumulator starts at 0 and 16ms < 50ms.
        
        const initialCallCount = mockNetwork.broadcastPlayerStateUpdate.mock.calls.length;
        
        // Advance time by slightly less than the update interval
        // 2 * 16ms = 32ms. Total accumulated = 16 (initial) + 32 = 48ms < 50ms
        const steps = 2; 
        
        for (let i = 0; i < steps; i++) {
            game.update(0.016);
        }
        
        // Should stay at initialCallCount (threshold not reached)
        expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledTimes(initialCallCount);
        
        // Now advance enough to cross the threshold
        game.update(0.016); // Total ~64ms
        
        // Should trigger an update now
        expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledTimes(initialCallCount + 1);
      });
  });
});