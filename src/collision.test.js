
import { CollisionSystem } from './collision.js';

describe('CollisionSystem', () => {
  let collisionSystem;
  let player;

  beforeEach(() => {
    collisionSystem = new CollisionSystem();
    // Player is a circle at (100, 100) with radius 10
    player = {
      x: 100,
      y: 100,
      radius: 10,
      velocity: { x: 0, y: 0 }
    };
  });

  describe('checkCollision', () => {
    test('ShouldReturnNull_WhenNoCollision', () => {
      const obstacle = { type: 'rectangle', x: 200, y: 200, width: 50, height: 50 };
      const result = collisionSystem.checkCollision(player, obstacle);
      expect(result).toBeNull();
    });

    test('ShouldReturnCollisionData_WhenCircleOverlapsRectangle', () => {
      // Rectangle at (105, 100) - Player at (100, 100) with radius 10 should collide
      // Rect x=105 is inside Circle (x=100, r=10) range [90, 110]
      const obstacle = { type: 'rectangle', x: 105, y: 90, width: 50, height: 20 };
      const result = collisionSystem.checkCollision(player, obstacle);
      
      expect(result).not.toBeNull();
      expect(result.overlap).toBeGreaterThan(0);
      expect(result.normal).toBeDefined();
    });
  });

  describe('resolveCollision', () => {
    test('ShouldSlideAlongWall_WhenMovingDiagonallyIntoVerticalWall', () => {
      // Wall to the right of player
      const obstacle = { type: 'rectangle', x: 110, y: 0, width: 20, height: 200 };
      
      // Player moving diagonally right-down towards wall
      player.x = 105; // 5px from wall (radius 10 means overlapping by 5)
      player.y = 100;
      player.velocity = { x: 10, y: 10 };

      // Manually calculate collision normal/overlap for this test scenario
      // or let the system calculate it if we pass the obstacle
      const resolvedVelocity = collisionSystem.resolveCollisionVelocity(player, obstacle);

      // Should zero out X velocity (blocked by wall) but keep Y velocity (slide)
      expect(resolvedVelocity.x).toBeCloseTo(0);
      expect(resolvedVelocity.y).toBeCloseTo(10);
    });

    test('ShouldSlideAlongWall_WhenMovingDiagonallyIntoHorizontalWall', () => {
      // Wall below player
      const obstacle = { type: 'rectangle', x: 0, y: 110, width: 200, height: 20 };
      
      // Player moving diagonally right-down towards wall
      player.x = 100;
      player.y = 105; // 5px from wall
      player.velocity = { x: 10, y: 10 };

      const resolvedVelocity = collisionSystem.resolveCollisionVelocity(player, obstacle);

      // Should zero out Y velocity (blocked by wall) but keep X velocity (slide)
      expect(resolvedVelocity.x).toBeCloseTo(10);
      expect(resolvedVelocity.y).toBeCloseTo(0);
    });
  });
  
  describe('getHitbox', () => {
      test('ShouldReturnFeetCenteredHitbox', () => {
          // If sprite is 100x100, and x,y is center.
          // We want the hitbox to be smaller and offset if necessary.
          // For this implementation, we assume x,y IS the feet position (ground contact).
          const hitbox = collisionSystem.getHitbox(player);
          expect(hitbox.x).toBe(player.x);
          expect(hitbox.y).toBe(player.y);
          expect(hitbox.radius).toBe(player.radius);
      });
  });
});
