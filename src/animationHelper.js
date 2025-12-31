/**
 * Animation Helper Functions
 * Utilities for player sprite animations
 */

/**
 * Calculate direction index (0-7) from velocity vector
 * @param {number} vx - Velocity X component
 * @param {number} vy - Velocity Y component
 * @returns {number|null} Direction index (0-7) or null if velocity is zero
 *
 * Direction mapping:
 * 0: South
 * 1: South-East
 * 2: East
 * 3: North-East
 * 4: North
 * 5: North-West
 * 6: West
 * 7: South-West
 */
export function getDirectionFromVelocity(vx, vy) {
  // Handle zero velocity (idle state)
  if (vx === 0 && vy === 0) {
    return null;
  }

  // Calculate angle from velocity
  // atan2(y, x) gives angle in standard math convention:
  // 0 = East, π/2 = North, π = West, -π/2 = South
  const angle = Math.atan2(vy, vx);

  // Convert angle to degrees for easier calculation
  let degrees = (angle * 180) / Math.PI;

  // Normalize to 0-360 range
  if (degrees < 0) {
    degrees += 360;
  }

  // Map degrees to direction index (0-7)
  // Each direction covers 45 degrees, centered on cardinal/intercardinal points
  // East (0°) ± 22.5° = [-22.5°, 22.5°] → direction 2
  // SE (45°) ± 22.5° = [22.5°, 67.5°] → direction 1
  // South (90°) ± 22.5° = [67.5°, 112.5°] → direction 0
  // SW (135°) ± 22.5° = [112.5°, 157.5°] → direction 7
  // West (180°) ± 22.5° = [157.5°, 202.5°] → direction 6
  // NW (225°) ± 22.5° = [202.5°, 247.5°] → direction 5
  // North (270°) ± 22.5° = [247.5°, 292.5°] → direction 4
  // NE (315°) ± 22.5° = [292.5°, 337.5°] → direction 3
  // East wrap-around [337.5°, 360°] → direction 2

  if (degrees >= 337.5 || degrees < 22.5) {
    return 2; // East
  } else if (degrees >= 22.5 && degrees < 67.5) {
    return 1; // South-East
  } else if (degrees >= 67.5 && degrees < 112.5) {
    return 0; // South
  } else if (degrees >= 112.5 && degrees < 157.5) {
    return 7; // South-West
  } else if (degrees >= 157.5 && degrees < 202.5) {
    return 6; // West
  } else if (degrees >= 202.5 && degrees < 247.5) {
    return 5; // North-West
  } else if (degrees >= 247.5 && degrees < 292.5) {
    return 4; // North
  } else { // degrees >= 292.5 && degrees < 337.5
    return 3; // North-East
  }
}
