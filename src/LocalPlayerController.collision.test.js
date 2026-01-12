import { jest } from '@jest/globals';
import { LocalPlayerController } from './LocalPlayerController.js';
import { CONFIG } from './config.js';

describe('LocalPlayerController Collision', () => {
  let controller;
  let mockNetwork;
  let playersSnapshot;

  beforeEach(() => {
    mockNetwork = {
      playerId: 'local-player',
      broadcastPlayerStateUpdate: jest.fn(),
      send: jest.fn(),
    };
    controller = new LocalPlayerController(mockNetwork, {
      position_x: 1000,
      position_y: 1000
    });
  });

  const createSnapshot = (otherPlayers) => {
    const playersMap = new Map();
    otherPlayers.forEach(p => {
      playersMap.set(p.id, {
        id: p.id,
        x: p.x,
        y: p.y,
        health: p.health !== undefined ? p.health : 100
      });
    });
    return {
      getPlayers: () => playersMap
    };
  };

  test('WhenCollidingWithAnotherPlayer_ShouldPreventIntersection', () => {
    const player = controller.getPlayer();
    const otherPlayer = { id: 'other', x: 1100, y: 1000 }; // 100px away, radius is 60, so overlap starts at 120px distance
    
    // They are already overlapping (distance 100 < 120)
    // Hitbox is 120x120 centered at (1000, 1000) and (1100, 1000)
    // Local: minX: 940, maxX: 1060
    // Other: minX: 1040, maxX: 1160
    // Overlap on X: 1060 - 1040 = 20px
    
    playersSnapshot = createSnapshot([otherPlayer]);
    
    // Try to move towards the other player
    controller.handleInput({ moveX: 1, moveY: 0 });
    controller.update(0.1, playersSnapshot);

    // Should be pushed back or prevented from moving closer.
    // Initial x was 1000. 
    // Moving at 200px/s for 0.1s should result in x=1020.
    // But collision with other player at 1100 should push it back.
    // Other player is at 1100, so its minX is 1040.
    // Our maxX (1020+60=1080) would overlap with 1040 by 40px.
    // So MTV should be -40. x = 1020 - 40 = 980.
    
    expect(player.x).toBeLessThan(1000); 
    // Precisely, if we were at 1000, our maxX is 1060. Other minX is 1040.
    // Even without moving, we should be pushed to x=980 to have maxX=1040.
  });

  test('WhenAlreadyIntersecting_ShouldSeparatePlayers', () => {
    const player = controller.getPlayer();
    const otherPlayer = { id: 'other', x: 1050, y: 1000 }; // Heavily overlapping
    
    playersSnapshot = createSnapshot([otherPlayer]);
    
    // No movement input
    controller.handleInput({ moveX: 0, moveY: 0 });
    controller.update(0.1, playersSnapshot);

    // Should be pushed apart
    expect(player.x).toBeLessThan(1000);
  });

  test('WhenCollidingAtAngle_ShouldSlideAlongEdge', () => {
    const player = controller.getPlayer();
    player.x = 940;
    player.y = 1000;
    const otherPlayer = { id: 'other', x: 1040, y: 1000 };
    // Distance 100, overlap 20 on X.
    
    playersSnapshot = createSnapshot([otherPlayer]);
    
    // Move Diagonally (Right and Down)
    controller.handleInput({ moveX: 1, moveY: 1 });
    controller.update(0.1, playersSnapshot);

    // X movement should be blocked/pushed, but Y movement should succeed (sliding)
    expect(player.x).toBeLessThan(960); // Would be ~954 without collision (940 + 200/sqrt(2) * 0.1)
    expect(player.y).toBeGreaterThan(1000); // Should have moved down
  });

  test('WhenCollidingWithDeadPlayer_ShouldIgnoreCollision', () => {
    const player = controller.getPlayer();
    const deadPlayer = { id: 'dead', x: 1050, y: 1000, health: 0 };
    
    playersSnapshot = createSnapshot([deadPlayer]);
    
    controller.handleInput({ moveX: 0, moveY: 0 });
    controller.update(0.1, playersSnapshot);

    // Should NOT be pushed
    expect(player.x).toBe(1000);
  });
});
