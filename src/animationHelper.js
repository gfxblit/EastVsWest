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
 * Calculate direction index (0-3) from rotation angle
 * @param {number} rotation - Rotation angle in radians
 * @returns {number} Direction index (0-3: South, East, North, West)
 */
export function getDirectionFromRotation(rotation) {
  // Map rotation (0-2π) to frame (0-3)
  // Frame 0: South (π)
  // Frame 1: East (π/2)
  // Frame 2: North (0)
  // Frame 3: West (3π/2)

  // Normalize rotation to 0-2π
  let normalizedRotation = rotation % (2 * Math.PI);
  if (normalizedRotation < 0) {
    normalizedRotation += 2 * Math.PI;
  }

  // Convert rotation to degrees for easier calculation
  const degrees = (normalizedRotation * 180) / Math.PI;

  // Map degrees to frame
  // North (0°) ± 45° = [315°, 45°] → frame 2
  // East (90°) ± 45° = [45°, 135°] → frame 1
  // South (180°) ± 45° = [135°, 225°] → frame 0
  // West (270°) ± 45° = [225°, 315°] → frame 3

  if (degrees >= 315 || degrees < 45) {
    return 2; // North
  } else if (degrees >= 45 && degrees < 135) {
    return 1; // East
  } else if (degrees >= 135 && degrees < 225) {
    return 0; // South
  } else { // degrees >= 225 && degrees < 315
    return 3; // West
  }
}

/**
 * Calculate direction index (0-3) from velocity vector
 * Enforces cardinal directions (North, South, East, West) for walking animations.
 * @param {number} vx - Velocity X component
 * @param {number} vy - Velocity Y component
 * @returns {number|null} Direction index (0: South, 1: East, 2: North, 3: West) or null if velocity is zero
 */
export function getDirectionFromVelocity(vx, vy) {
  // Handle zero velocity (idle state)
  if (vx === 0 && vy === 0) {
    return null;
  }

  // Prioritize the axis with greater magnitude
  if (Math.abs(vx) > Math.abs(vy)) {
    // Horizontal movement
    return vx > 0 ? 1 : 3; // East (1) or West (3)
  } else {
    // Vertical movement (default to vertical if equal)
    return vy > 0 ? 0 : 2; // South (0) or North (2)
  }
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
