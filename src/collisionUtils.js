import { CONFIG } from './config.js';

/**
 * Calculates the AABB hitbox for a player.
 * @param {Object} player Player object with x and y coordinates
 * @returns {Object} Hitbox properties (x, y, width, height, centerX, centerY, minX, maxX, minY, maxY)
 */
export function getHitbox(player) {
  const radius = CONFIG.COMBAT.PLAYER_HITBOX_RADIUS;
  const size = radius * 2;
  
  const x = player.x !== undefined ? player.x : player.position_x;
  const y = player.y !== undefined ? player.y : player.position_y;
  
  return {
    x: x - radius,
    y: y - radius,
    width: size,
    height: size,
    centerX: x,
    centerY: y,
    minX: x - radius,
    maxX: x + radius,
    minY: y - radius,
    maxY: y + radius
  };
}

/**
 * Resolves AABB collision between a moving box and a static box.
 * Returns the Minimum Translation Vector (MTV) needed to separate the moving box from the static box.
 * @param {Object} movingBox Hitbox of the entity being moved
 * @param {Object} staticBox Hitbox of the obstacle
 * @returns {Object} Minimum Translation Vector { x, y }
 */
export function resolveAABBCollision(movingBox, staticBox) {
  // Check if they overlap
  if (movingBox.maxX <= staticBox.minX || movingBox.minX >= staticBox.maxX ||
      movingBox.maxY <= staticBox.minY || movingBox.minY >= staticBox.maxY) {
    return { x: 0, y: 0 };
  }

  // Calculate overlap on each axis
  const overlapX = movingBox.centerX < staticBox.centerX
    ? movingBox.maxX - staticBox.minX
    : movingBox.minX - staticBox.maxX;

  const overlapY = movingBox.centerY < staticBox.centerY
    ? movingBox.maxY - staticBox.minY
    : movingBox.minY - staticBox.maxY;

  // Resolve along the axis with smaller overlap
  if (Math.abs(overlapX) < Math.abs(overlapY)) {
    return { x: -overlapX, y: 0 };
  } else {
    return { x: 0, y: -overlapY };
  }
}
