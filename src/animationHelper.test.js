/**
 * Tests for animationHelper.js
 */

import { getDirectionFromVelocity } from './animationHelper.js';

describe('AnimationHelper', () => {
  describe('getDirectionFromVelocity', () => {
    test('WhenVelocityIsSouth_ShouldReturn0', () => {
      const direction = getDirectionFromVelocity(0, 1);
      expect(direction).toBe(0); // South
    });

    test('WhenVelocityIsSouthEast_ShouldReturn1', () => {
      const direction = getDirectionFromVelocity(1, 1);
      expect(direction).toBe(1); // South-East
    });

    test('WhenVelocityIsEast_ShouldReturn2', () => {
      const direction = getDirectionFromVelocity(1, 0);
      expect(direction).toBe(2); // East
    });

    test('WhenVelocityIsNorthEast_ShouldReturn3', () => {
      const direction = getDirectionFromVelocity(1, -1);
      expect(direction).toBe(3); // North-East
    });

    test('WhenVelocityIsNorth_ShouldReturn4', () => {
      const direction = getDirectionFromVelocity(0, -1);
      expect(direction).toBe(4); // North
    });

    test('WhenVelocityIsNorthWest_ShouldReturn5', () => {
      const direction = getDirectionFromVelocity(-1, -1);
      expect(direction).toBe(5); // North-West
    });

    test('WhenVelocityIsWest_ShouldReturn6', () => {
      const direction = getDirectionFromVelocity(-1, 0);
      expect(direction).toBe(6); // West
    });

    test('WhenVelocityIsSouthWest_ShouldReturn7', () => {
      const direction = getDirectionFromVelocity(-1, 1);
      expect(direction).toBe(7); // South-West
    });

    test('WhenVelocityIsZero_ShouldReturnNull', () => {
      const direction = getDirectionFromVelocity(0, 0);
      expect(direction).toBeNull(); // Idle, no direction change
    });

    test('WhenVelocityIsNearEast_ShouldReturn2', () => {
      // Test edge case: 22.5 degrees from East (should still be East)
      const direction = getDirectionFromVelocity(1, 0.2);
      expect(direction).toBe(2); // East
    });

    test('WhenVelocityIsNearSouthEast_ShouldReturn1', () => {
      // Test edge case: between East and SE, closer to SE (40 degrees)
      const direction = getDirectionFromVelocity(1, 0.7);
      expect(direction).toBe(1); // South-East
    });
  });
});
