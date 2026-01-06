import { jest } from '@jest/globals';
import { LocalPlayerController } from './LocalPlayerController.js';
import { CONFIG } from './config.js';

describe('LocalPlayerController - Attack Direction Fix', () => {
  let controller;
  let mockNetwork;

  beforeEach(() => {
    mockNetwork = {
      playerId: 'test-player',
      broadcastPlayerStateUpdate: jest.fn(),
      send: jest.fn(),
    };
    controller = new LocalPlayerController(mockNetwork, null);
  });

  test('ShouldIgnoreMouseAimForRotation', () => {
    const player = controller.getPlayer();
    
    // 1. Move Right (East)
    // Velocity X > 0 means movement angle is 0. Rotation = 0 + PI/2 = PI/2.
    controller.handleInput({ moveX: 1, moveY: 0 });
    controller.update(0.1, null);
    
    const rotationAfterMove = player.rotation;
    expect(rotationAfterMove).toBeCloseTo(Math.PI / 2);

    // 2. Stop Moving, but Aim North (Mouse at 0,0 relative to player at center)
    // Player at center (WORLD_WIDTH/2, WORLD_HEIGHT/2)
    // Aim at 0,0. DeltaX is negative, DeltaY is negative. 
    // This would normally rotate the player top-left.
    controller.handleInput({ moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
    controller.update(0.1, null);

    // 3. Verify Rotation did NOT change to follow mouse
    expect(player.rotation).toBeCloseTo(rotationAfterMove);
  });

  test('ShouldSendAttackBasedOnRotationNotMouse', () => {
    const player = controller.getPlayer();
    player.equipped_weapon = 'spear';
    
    // 1. Move Right (East). Rotation = PI/2.
    controller.handleInput({ moveX: 1, moveY: 0 });
    controller.update(0.1, null);
    
    // 2. Stop.
    controller.handleInput({ moveX: 0, moveY: 0 });
    controller.update(0.1, null);

    // 3. Attack while aiming somewhere else (e.g. North/Top-Left)
    // Mouse at 0,0.
    const inputState = { 
        moveX: 0, 
        moveY: 0, 
        aimX: 0, 
        aimY: 0,
        attack: true 
    };
    
    // Reset timer to allow attack
    player.lastAttackTime = 0;
    
    controller.handleInput(inputState);
    controller.update(0.016, null);

    // 4. Verify Network Payload
    // The player is facing East (Right). 
    // The attack aim_x should be > player.x
    // The attack aim_y should be approx player.y
    
    expect(mockNetwork.send).toHaveBeenCalledWith('attack_request', expect.any(Object));
    const payload = mockNetwork.send.mock.calls[0][1];
    
    // Calculate angle from player to target in payload
    const dx = payload.aim_x - player.x;
    const dy = payload.aim_y - player.y;
    const attackAngle = Math.atan2(dy, dx);
    
    // Player Rotation PI/2 (East) corresponds to Math.atan2(0, 1) = 0.
    // Wait, the rotation logic in controller is:
    // rotation = Math.atan2(velocity.y, velocity.x) + Math.PI / 2;
    // So if moving (1,0): atan2(0,1) = 0. rotation = PI/2.
    
    // In handleAttack payload calculation (which we want to implement):
    // Angle should be derived from rotation:
    // angle = rotation - Math.PI / 2;
    // angle = PI/2 - PI/2 = 0.
    
    expect(Math.abs(attackAngle)).toBeCloseTo(0, 1); // Allow small precision diff
    
    // Ensure we didn't send the raw mouse coordinates (0,0)
    expect(payload.aim_x).not.toBe(0);
    expect(payload.aim_y).not.toBe(0);
  });
});
