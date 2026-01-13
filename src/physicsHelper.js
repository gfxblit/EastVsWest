import { CONFIG } from './config.js';

/**
 * Resolves collision on the X axis against static props.
 * @param {number} x - The proposed X coordinate.
 * @param {number} y - The current Y coordinate.
 * @param {number} hitboxRadius - The radius of the entity's hitbox (half-width/height).
 * @returns {number} - The resolved X coordinate.
 */
export function resolveCollisionX(x, y, hitboxRadius) {
  if (!CONFIG.PROPS || !CONFIG.PROPS.MAP) return x;

  const playerMinX = x - hitboxRadius;
  const playerMaxX = x + hitboxRadius;
  const playerMinY = y - hitboxRadius;
  const playerMaxY = y + hitboxRadius;

  for (const prop of CONFIG.PROPS.MAP) {
    const propType = CONFIG.PROPS.TYPES[prop.type.toUpperCase()];
    if (!propType) continue;

    const propHalfWidth = propType.hitboxWidth / 2;
    const propHalfHeight = propType.hitboxHeight / 2;

    const propMinX = prop.x - propHalfWidth;
    const propMaxX = prop.x + propHalfWidth;
    const propMinY = prop.y - propHalfHeight;
    const propMaxY = prop.y + propHalfHeight;

    // Check for overlap
    if (playerMinX < propMaxX && playerMaxX > propMinX &&
        playerMinY < propMaxY && playerMaxY > propMinY) {
      
      // Resolve X collision
      if (x < prop.x) {
        // Coming from left, hit left side
        return propMinX - hitboxRadius;
      } else {
        // Coming from right, hit right side
        return propMaxX + hitboxRadius;
      }
    }
  }
  return x;
}

/**
 * Resolves collision on the Y axis against static props.
 * @param {number} x - The current X coordinate.
 * @param {number} y - The proposed Y coordinate.
 * @param {number} hitboxRadius - The radius of the entity's hitbox (half-width/height).
 * @returns {number} - The resolved Y coordinate.
 */
export function resolveCollisionY(x, y, hitboxRadius) {
  if (!CONFIG.PROPS || !CONFIG.PROPS.MAP) return y;

  const playerMinX = x - hitboxRadius;
  const playerMaxX = x + hitboxRadius;
  const playerMinY = y - hitboxRadius;
  const playerMaxY = y + hitboxRadius;

  for (const prop of CONFIG.PROPS.MAP) {
    const propType = CONFIG.PROPS.TYPES[prop.type.toUpperCase()];
    if (!propType) continue;

    const propHalfWidth = propType.hitboxWidth / 2;
    const propHalfHeight = propType.hitboxHeight / 2;

    const propMinX = prop.x - propHalfWidth;
    const propMaxX = prop.x + propHalfWidth;
    const propMinY = prop.y - propHalfHeight;
    const propMaxY = prop.y + propHalfHeight;

    // Check for overlap
    if (playerMinX < propMaxX && playerMaxX > propMinX &&
        playerMinY < propMaxY && playerMaxY > propMinY) {
      
      // Resolve Y collision
      if (y < prop.y) {
        // Coming from top, hit top side
        return propMinY - hitboxRadius;
      } else {
        // Coming from bottom, hit bottom side
        return propMaxY + hitboxRadius;
      }
    }
  }
  return y;
}
