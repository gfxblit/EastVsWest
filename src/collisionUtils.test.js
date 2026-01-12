import { getHitbox, resolveAABBCollision } from './collisionUtils.js';
import { CONFIG } from './config.js';

describe('collisionUtils', () => {
  describe('getHitbox', () => {
    test('ShouldReturnCorrectHitboxProperties', () => {
      const player = { x: 100, y: 200 };
      const radius = CONFIG.COMBAT.PLAYER_HITBOX_RADIUS; // 60
      const size = radius * 2; // 120

      const hitbox = getHitbox(player);

      expect(hitbox.x).toBe(100 - radius);
      expect(hitbox.y).toBe(200 - radius);
      expect(hitbox.width).toBe(size);
      expect(hitbox.height).toBe(size);
      expect(hitbox.centerX).toBe(100);
      expect(hitbox.centerY).toBe(200);
      expect(hitbox.minX).toBe(100 - radius);
      expect(hitbox.maxX).toBe(100 + radius);
      expect(hitbox.minY).toBe(200 - radius);
      expect(hitbox.maxY).toBe(200 + radius);
    });
  });

  describe('resolveAABBCollision', () => {
    test('WhenNotOverlapping_ShouldReturnZeroMTV', () => {
      const boxA = { minX: 0, maxX: 10, minY: 0, maxY: 10, centerX: 5, centerY: 5 };
      const boxB = { minX: 20, maxX: 30, minY: 20, maxY: 30, centerX: 25, centerY: 25 };

      const mtv = resolveAABBCollision(boxA, boxB);

      expect(mtv.x).toBe(0);
      expect(mtv.y).toBe(0);
    });

    test('WhenOverlappingFromLeft_ShouldReturnNegativeXMTV', () => {
      // boxA is moving into boxB from the left
      const boxA = { minX: 5, maxX: 15, minY: 0, maxY: 10, centerX: 10, centerY: 5 };
      const boxB = { minX: 10, maxX: 20, minY: 0, maxY: 10, centerX: 15, centerY: 5 };

      const mtv = resolveAABBCollision(boxA, boxB);

      // Overlap on X is 5. Should push boxA to the left by 5.
      expect(mtv.x).toBe(-5);
      expect(mtv.y).toBe(0);
    });

    test('WhenOverlappingFromRight_ShouldReturnPositiveXMTV', () => {
      const boxA = { minX: 15, maxX: 25, minY: 0, maxY: 10, centerX: 20, centerY: 5 };
      const boxB = { minX: 10, maxX: 20, minY: 0, maxY: 10, centerX: 15, centerY: 5 };

      const mtv = resolveAABBCollision(boxA, boxB);

      expect(mtv.x).toBe(5);
      expect(mtv.y).toBe(0);
    });

    test('WhenOverlappingFromTop_ShouldReturnNegativeYMTV', () => {
      const boxA = { minX: 0, maxX: 10, minY: 5, maxY: 15, centerX: 5, centerY: 10 };
      const boxB = { minX: 0, maxX: 10, minY: 10, maxY: 20, centerX: 5, centerY: 15 };

      const mtv = resolveAABBCollision(boxA, boxB);

      expect(mtv.x).toBe(0);
      expect(mtv.y).toBe(-5);
    });

    test('WhenOverlappingFromBottom_ShouldReturnPositiveYMTV', () => {
      const boxA = { minX: 0, maxX: 10, minY: 15, maxY: 25, centerX: 5, centerY: 20 };
      const boxB = { minX: 0, maxX: 10, minY: 10, maxY: 20, centerX: 5, centerY: 15 };

      const mtv = resolveAABBCollision(boxA, boxB);

      expect(mtv.x).toBe(0);
      expect(mtv.y).toBe(5);
    });

    test('ShouldResolveOnShortestAxis', () => {
      // Overlap on X: 8, Overlap on Y: 2
      const boxA = { minX: 2, maxX: 12, minY: 8, maxY: 18, centerX: 7, centerY: 13 };
      const boxB = { minX: 0, maxX: 10, minY: 0, maxY: 10, centerX: 5, centerY: 5 };

      const mtv = resolveAABBCollision(boxA, boxB);

      // Should push along Y axis because overlap is smaller (2 < 8)
      expect(mtv.x).toBe(0);
      expect(mtv.y).toBe(2);
    });
  });
});
