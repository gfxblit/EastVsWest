/**
 * Animation Helper Functions
 * Utilities for player sprite animations
 */

import { CONFIG } from './config.js';

/**
 * Class to manage animation state
 */
export class AnimationState {
  constructor() {
    this.currentFrame = 0;
    this.timeAccumulator = 0;
    this.lastDirection = 0; // Default to South
  }

  /**
   * Update animation state based on time and movement
   * @param {number} deltaTime - Time since last frame in seconds
   * @param {boolean} isMoving - Whether the player is moving
   * @param {number|null} direction - Direction index (0-7) or null if idle
   */
  update(deltaTime, isMoving, direction) {
    if (!isMoving || direction === null) {
      // Idle: reset to first frame
      this.currentFrame = 0;
      return;
    }

    // Update last direction
    this.lastDirection = direction;

    // Accumulate time
    this.timeAccumulator += deltaTime;

    // Calculate frame duration (1 / FPS)
    const frameDuration = 1 / CONFIG.ANIMATION.FPS;

    // Advance frames based on accumulated time
    while (this.timeAccumulator >= frameDuration) {
      this.timeAccumulator -= frameDuration;
      this.currentFrame++;

      // Loop back to 0 when exceeding max frames
      if (this.currentFrame >= CONFIG.ANIMATION.FRAMES_PER_DIRECTION) {
        this.currentFrame = 0;
      }
    }
  }
}

/**
 * Calculate direction index (0-7) from rotation angle
 * @param {number} rotation - Rotation angle in radians
 * @returns {number} Direction index (0-7)
 */
export function getDirectionFromRotation(rotation) {
  // Map rotation (0-2π) to frame (0-7)
  // Frame 0: South (π)
  // Frame 1: South-East (3π/4)
  // Frame 2: East (π/2)
  // Frame 3: North-East (π/4)
  // Frame 4: North (0)
  // Frame 5: North-West (7π/4 or -π/4)
  // Frame 6: West (3π/2 or -π/2)
  // Frame 7: South-West (5π/4 or -3π/4)

  // Normalize rotation to 0-2π
  let normalizedRotation = rotation % (2 * Math.PI);
  if (normalizedRotation < 0) {
    normalizedRotation += 2 * Math.PI;
  }

  // Convert rotation to degrees for easier calculation
  const degrees = (normalizedRotation * 180) / Math.PI;

  // Map degrees to frame
  // North (0°) ± 22.5° = [-22.5°, 22.5°] → frame 4
  // NE (45°) ± 22.5° = [22.5°, 67.5°] → frame 3
  // East (90°) ± 22.5° = [67.5°, 112.5°] → frame 2
  // SE (135°) ± 22.5° = [112.5°, 157.5°] → frame 1
  // South (180°) ± 22.5° = [157.5°, 202.5°] → frame 0
  // SW (225°) ± 22.5° = [202.5°, 247.5°] → frame 7
  // West (270°) ± 22.5° = [247.5°, 292.5°] → frame 6
  // NW (315°) ± 22.5° = [292.5°, 337.5°] → frame 5
  // North wrap-around [337.5°, 360°] → frame 4

  if (degrees >= 337.5 || degrees < 22.5) {
    return 4; // North
  } else if (degrees >= 22.5 && degrees < 67.5) {
    return 3; // North-East
  } else if (degrees >= 67.5 && degrees < 112.5) {
    return 2; // East
  } else if (degrees >= 112.5 && degrees < 157.5) {
    return 1; // South-East
  } else if (degrees >= 157.5 && degrees < 202.5) {
    return 0; // South
  } else if (degrees >= 202.5 && degrees < 247.5) {
    return 7; // South-West
  } else if (degrees >= 247.5 && degrees < 292.5) {
    return 6; // West
  } else { // degrees >= 292.5 && degrees < 337.5
    return 5; // North-West
  }
}

/**
 * Calculate direction index (0-7) from velocity vector
 * @param {number} vx - Velocity X component
 * @param {number} vy - Velocity Y component
 * @returns {number|null} Direction index (0-7) or null if velocity is zero
 */
export function getDirectionFromVelocity(vx, vy) {
  // Handle zero velocity (idle state)
  if (vx === 0 && vy === 0) {
    return null;
  }

  // Calculate angle from velocity
  // atan2(vy, vx) gives angle from East (0 rad)
  // East = 0, South = PI/2, West = PI, North = -PI/2

  // We need to convert this to the rotation system used by getDirectionFromRotation:
  // North = 0, East = PI/2, South = PI, West = 3PI/2

  // So:
  // atan2 = 0 (East) -> Rotation = PI/2 (East)
  // atan2 = PI/2 (South) -> Rotation = PI (South)
  // atan2 = PI (West) -> Rotation = 3PI/2 (West)
  // atan2 = -PI/2 (North) -> Rotation = 0 (North)

  // Transformation: Rotation = atan2 + PI/2

  const rotation = Math.atan2(vy, vx) + Math.PI / 2;

  return getDirectionFromRotation(rotation);
}

/**
 * Update animation state based on time and movement
 * @deprecated Use AnimationState class instead
 * @param {Object} animState - Animation state to update
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {boolean} isMoving - Whether the player is moving
 * @param {number|null} direction - Direction index (0-7) or null if idle
 */
export function updateAnimationState(animState, deltaTime, isMoving, direction) {
   // Helper wrapper for backward compatibility or direct object usage
   const stateHelper = new AnimationState();
   stateHelper.currentFrame = animState.currentFrame;
   stateHelper.timeAccumulator = animState.timeAccumulator;
   stateHelper.lastDirection = animState.lastDirection;

   stateHelper.update(deltaTime, isMoving, direction);

   animState.currentFrame = stateHelper.currentFrame;
   animState.timeAccumulator = stateHelper.timeAccumulator;
   animState.lastDirection = stateHelper.lastDirection;
}
