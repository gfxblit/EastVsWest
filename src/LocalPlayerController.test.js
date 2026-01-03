import { jest } from '@jest/globals';
import { LocalPlayerController } from './LocalPlayerController.js';
import { CONFIG } from './config.js';

describe('LocalPlayerController', () => {
  let controller;
  let mockNetwork;

  beforeEach(() => {
    mockNetwork = {
      playerId: 'test-player',
      broadcastPlayerStateUpdate: jest.fn(),
      send: jest.fn(),
    };
  });

  test('ShouldInitializeWithDefaultValues', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();

    expect(player.id).toBe('test-player');
    expect(player.x).toBe(CONFIG.WORLD.WIDTH / 2);
    expect(player.y).toBe(CONFIG.WORLD.HEIGHT / 2);
  });

  test('ShouldUpdatePositionBasedOnVelocity', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();
    
    player.velocity.x = 100;
    player.velocity.y = 0;

    controller.update(1.0, null); // 1 second

    expect(player.x).toBe(CONFIG.WORLD.WIDTH / 2 + 100);
  });

  test('ShouldHandleMovementInput', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();

    controller.handleInput({ moveX: 1, moveY: 0 });

    expect(player.velocity.x).toBeGreaterThan(0);
    expect(player.velocity.y).toBe(0);
  });

  test('ShouldBroadcastPositionUpdate', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();
    
    // Move player
    player.x += 10;
    
    // Force enough time to pass for throttle
    // Using a large number to ensure we are past the interval
    const mockNow = jest.spyOn(Date, 'now').mockReturnValue(10000000);
    controller.lastPositionSendTime = 0; // Ensure logic sees it as ready
    
    controller.update(0.1, { getPlayers: () => new Map() }); // pass mock snapshot

    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    
    mockNow.mockRestore();
  });

  test('ShouldSyncFromSnapshot', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();

    const mockSnapshot = {
        getPlayers: () => new Map([
            ['test-player', { health: 50, equipped_weapon: 'spear' }]
        ])
    };

    controller.update(0.1, mockSnapshot);

    expect(player.health).toBe(50);
    expect(player.weapon).toBe('spear');
  });
});
