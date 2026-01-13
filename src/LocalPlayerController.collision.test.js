import { jest } from '@jest/globals';
import { LocalPlayerController } from './LocalPlayerController.js';
import { CONFIG } from './config.js';

describe('LocalPlayerController Collision', () => {
  let controller;
  let mockNetwork;

  beforeEach(() => {
    mockNetwork = { playerId: 'player1', broadcastPlayerStateUpdate: jest.fn(), send: jest.fn() };
    // Use center of the map safe zone or just somewhere safe
    const initialData = { position_x: 100, position_y: 100 };
    controller = new LocalPlayerController(mockNetwork, initialData);
  });

  test('WhenMovingFreely_ShouldUpdatePosition', () => {
    // Move right in a safe area (100,100 is safe, nearest prop is at 400,400)
    controller.handleInput({ moveX: 1, moveY: 0 });
    controller.update(1.0, null, []); 

    const player = controller.getPlayer();
    const expectedX = 100 + CONFIG.PLAYER.BASE_MOVEMENT_SPEED * 1.0;
    expect(player.x).toBe(expectedX);
    expect(player.y).toBe(100);
  });

  test('WhenMovingIntoPropFromLeft_ShouldBeBlocked', () => {
    // Uses tree_1 at 400, 400. Hitbox 60x140.
    // Prop X Range: [370, 430].
    
    // Player Hitbox Radius.
    const hitboxRadius = CONFIG.PLAYER.HITBOX_RADIUS;
    
    // Start player just to the left of the tree.
    // Left edge of tree = 370.
    // Player X = 370 - hitboxRadius.
    
    // Let's start a bit further back to allow some movement.
    const startX = 370 - hitboxRadius - 10;
    controller.player.x = startX;
    controller.player.y = 400; // Aligned with center Y
    
    // Move right
    controller.handleInput({ moveX: 1, moveY: 0 });
    
    // Move for enough time to penetrate
    controller.update(0.1, null, []);
    
    const player = controller.getPlayer();
    
    // Expected Max X = 370 - hitboxRadius
    const expectedMaxX = 370 - hitboxRadius;
    
    expect(player.x).toBeLessThanOrEqual(expectedMaxX + 0.1); // float tolerance
    expect(player.x).toBeGreaterThan(startX); // Should have moved some amount
  });

  test('WhenMovingIntoPropFromTop_ShouldBeBlocked', () => {
    // tree_1 at 400, 400. Hitbox 60x140. Y Range: [330, 470].
    const hitboxRadius = CONFIG.PLAYER.HITBOX_RADIUS;
    
    // Start above. Top edge = 330.
    const startY = 330 - hitboxRadius - 10;
    controller.player.x = 400;
    controller.player.y = startY;
    
    // Move down
    controller.handleInput({ moveX: 0, moveY: 1 });
    
    controller.update(0.1, null, []);
    
    const player = controller.getPlayer();
    
    const expectedMaxY = 330 - hitboxRadius;
    expect(player.y).toBeLessThanOrEqual(expectedMaxY + 0.1);
    expect(player.y).toBeGreaterThan(startY);
  });
});