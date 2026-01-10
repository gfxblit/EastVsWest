/**
 * Tests for animationHelper.js
 */

import { getDirectionFromRotation, getDirectionFromVelocity, updateAnimationState } from './animationHelper.js';
import { CONFIG } from './config.js';

describe('AnimationHelper', () => {
  describe('getDirectionFromRotation', () => {
    test('ShouldReturnCorrectFrameForCardinalDirections', () => {
      // North (0 radians)
      expect(getDirectionFromRotation(0)).toBe(2);

      // East (PI/2 radians)
      expect(getDirectionFromRotation(Math.PI / 2)).toBe(1);

      // South (PI radians)
      expect(getDirectionFromRotation(Math.PI)).toBe(0);

      // West (3PI/2 radians)
      expect(getDirectionFromRotation(3 * Math.PI / 2)).toBe(3);
    });

    test('ShouldMapDiagonalRotationToCardinalDirection', () => {
      // North-East (PI/4) -> should be North (2) or East (1) depending on threshold
      // Our logic: [315, 45) -> 2, [45, 135) -> 1
      // PI/4 is 45 degrees, which is threshold for East (1)
      expect(getDirectionFromRotation(Math.PI / 4)).toBe(1);

      // South-East (3PI/4) is 135 degrees, threshold for South (0)
      expect(getDirectionFromRotation(3 * Math.PI / 4)).toBe(0);

      // South-West (5PI/4) is 225 degrees, threshold for West (3)
      expect(getDirectionFromRotation(5 * Math.PI / 4)).toBe(3);

      // North-West (7PI/4) is 315 degrees, threshold for North (2)
      expect(getDirectionFromRotation(7 * Math.PI / 4)).toBe(2);
    });

    test('ShouldHandleNegativeAngles', () => {
      // -PI/2 is equivalent to 3PI/2 (West) -> frame 3
      expect(getDirectionFromRotation(-Math.PI / 2)).toBe(3);

      // -PI is equivalent to PI (South) -> frame 0
      expect(getDirectionFromRotation(-Math.PI)).toBe(0);
    });

    test('ShouldHandleAnglesGreaterThan2PI', () => {
      // 2PI + PI/2 is equivalent to PI/2 (East) -> frame 1
      expect(getDirectionFromRotation(2.5 * Math.PI)).toBe(1);
    });

    test('ShouldHandleBoundaryConditions', () => {
      // North is 0 +/- 45 degrees
      // Test slightly less than 45 deg -> Should be North (2)
      const slightlyNorth = (44.0 * Math.PI) / 180;
      expect(getDirectionFromRotation(slightlyNorth)).toBe(2);

      // Test exactly 45 deg -> Should be East (1) based on >= 45 logic
      const exactly45 = (45.0 * Math.PI) / 180;
      expect(getDirectionFromRotation(exactly45)).toBe(1);
    });
  });

  describe('getDirectionFromVelocity', () => {
    test('WhenVelocityIsSouth_ShouldReturn0', () => {
      const direction = getDirectionFromVelocity(0, 1);
      expect(direction).toBe(0); // South
    });

    test('WhenVelocityIsSouthEast_ShouldReturnCardinal', () => {
      // |vy| >= |vx| -> South (0)
      const direction = getDirectionFromVelocity(1, 1);
      expect(direction).toBe(0); // South
    });

    test('WhenVelocityIsEast_ShouldReturn1', () => {
      const direction = getDirectionFromVelocity(1, 0);
      expect(direction).toBe(1); // East
    });

    test('WhenVelocityIsNorthEast_ShouldReturnCardinal', () => {
      // |vy| >= |vx| -> North (2)
      const direction = getDirectionFromVelocity(1, -1);
      expect(direction).toBe(2); // North
    });

    test('WhenVelocityIsNorth_ShouldReturn2', () => {
      const direction = getDirectionFromVelocity(0, -1);
      expect(direction).toBe(2); // North
    });

    test('WhenVelocityIsNorthWest_ShouldReturnCardinal', () => {
      // |vy| >= |vx| -> North (2)
      const direction = getDirectionFromVelocity(-1, -1);
      expect(direction).toBe(2); // North
    });

    test('WhenVelocityIsWest_ShouldReturn3', () => {
      const direction = getDirectionFromVelocity(-1, 0);
      expect(direction).toBe(3); // West
    });

    test('WhenVelocityIsSouthWest_ShouldReturnCardinal', () => {
      // |vy| >= |vx| -> South (0)
      const direction = getDirectionFromVelocity(-1, 1);
      expect(direction).toBe(0); // South
    });

    test('WhenVelocityIsZero_ShouldReturnNull', () => {
      const direction = getDirectionFromVelocity(0, 0);
      expect(direction).toBeNull(); // Idle, no direction change
    });

    test('WhenVelocityIsNearEast_ShouldReturn1', () => {
      // Test edge case: near East
      const direction = getDirectionFromVelocity(1, 0.2);
      expect(direction).toBe(1); // East
    });

    test('WhenVelocityIsNearSouthEast_ButHorizontalDominant_ShouldReturnEast', () => {
      // vx (1) > vy (0.7) -> East
      const direction = getDirectionFromVelocity(1, 0.7);
      expect(direction).toBe(1); // East
    });
    
    test('WhenVelocityIsNearSouthEast_ButVerticalDominant_ShouldReturnSouth', () => {
      // vy (1) > vx (0.7) -> South
      const direction = getDirectionFromVelocity(0.7, 1);
      expect(direction).toBe(0); // South
    });
  });

  describe('Animation Configuration', () => {
    test('ShouldHave4FramesPerDirection', () => {
      expect(CONFIG.ANIMATION.FRAMES_PER_DIRECTION).toBe(4);
    });
  });

  describe('updateAnimationState', () => {
    test('WhenPlayerIsIdle_ShouldResetToFrame0', () => {
      const animState = { currentFrame: 3, timeAccumulator: 0.5, lastDirection: 2 };
      updateAnimationState(animState, 0.1, false, null);

      expect(animState.currentFrame).toBe(0);
      // lastDirection should remain unchanged when idle
      expect(animState.lastDirection).toBe(2);
    });

    test('WhenPlayerIsIdleWithNullDirection_ShouldResetToFrame0', () => {
      const animState = { currentFrame: 3, timeAccumulator: 1.0, lastDirection: 2 };
      updateAnimationState(animState, 0.2, false, null);

      expect(animState.currentFrame).toBe(0);
    });

    test('WhenPlayerIsMoving_ShouldAdvanceFrames', () => {
      const animState = { currentFrame: 0, timeAccumulator: 0, lastDirection: 0 };
      const frameDuration = 1 / CONFIG.ANIMATION.FPS; // ~0.067s at 15 FPS

      updateAnimationState(animState, frameDuration, true, 1);

      expect(animState.currentFrame).toBe(1);
      expect(animState.lastDirection).toBe(1);
      expect(animState.timeAccumulator).toBeCloseTo(0, 5);
    });

    test('WhenTimeAccumulatorIsInsufficient_ShouldNotAdvanceFrame', () => {
      const animState = { currentFrame: 0, timeAccumulator: 0, lastDirection: 0 };

      // Very small delta time (less than 1 frame duration)
      updateAnimationState(animState, 0.001, true, 1);

      expect(animState.currentFrame).toBe(0); // Should not advance yet
      expect(animState.timeAccumulator).toBeCloseTo(0.001, 5);
    });

    test('WhenTimeAccumulatesAcrossMultipleFrames_ShouldAdvanceMultipleFrames', () => {
      const animState = { currentFrame: 0, timeAccumulator: 0, lastDirection: 0 };
      const frameDuration = 1 / CONFIG.ANIMATION.FPS;

      // Accumulate time for 3 frames
      updateAnimationState(animState, frameDuration * 3, true, 1);

      expect(animState.currentFrame).toBe(3);
      expect(animState.lastDirection).toBe(1);
    });

    test('WhenFrameExceedsMax_ShouldLoopBackToZero', () => {
      const framesPerDirection = CONFIG.ANIMATION.FRAMES_PER_DIRECTION; // 4
      const animState = { currentFrame: framesPerDirection - 1, timeAccumulator: 0, lastDirection: 0 };
      const frameDuration = 1 / CONFIG.ANIMATION.FPS;

      updateAnimationState(animState, frameDuration, true, 1);

      expect(animState.currentFrame).toBe(0); // Should wrap around
    });

    test('WhenMultipleFramesWrapAround_ShouldLoopCorrectly', () => {
      const framesPerDirection = CONFIG.ANIMATION.FRAMES_PER_DIRECTION;
      const animState = { currentFrame: 0, timeAccumulator: 0, lastDirection: 0 };
      const frameDuration = 1 / CONFIG.ANIMATION.FPS;

      // Advance 5 frames: 0 -> 1 -> 2 -> 3 -> 0 -> 1
      updateAnimationState(animState, frameDuration * 5, true, 1);

      // With 4 frames: 5 % 4 = 1
      expect(animState.currentFrame).toBe(1);
    });

    test('WhenDirectionChanges_ShouldUpdateLastDirection', () => {
      const animState = { currentFrame: 2, timeAccumulator: 0, lastDirection: 2 };
      const frameDuration = 1 / CONFIG.ANIMATION.FPS;

      updateAnimationState(animState, frameDuration, true, 3);

      expect(animState.lastDirection).toBe(3);
    });

    test('WhenTimeAccumulatorCarriesOver_ShouldMaintainRemainder', () => {
      const animState = { currentFrame: 0, timeAccumulator: 0, lastDirection: 0 };
      const frameDuration = 1 / CONFIG.ANIMATION.FPS;

      // Delta time is 1.5 frames worth
      const deltaTime = frameDuration * 1.5;
      updateAnimationState(animState, deltaTime, true, 1);

      expect(animState.currentFrame).toBe(1);
      // Should carry over 0.5 frame duration
      expect(animState.timeAccumulator).toBeCloseTo(frameDuration * 0.5, 5);
    });
  });
});
