
/**
 * Collision System
 * Handles collision detection and resolution for the game.
 * Implements "feet-first" physics where hitboxes are centered on ground contact points.
 */

export class CollisionSystem {
  constructor() {
    this.obstacles = [];
  }

  addObstacle(obstacle) {
    this.obstacles.push(obstacle);
  }

  /**
   * Get the hitbox for an entity.
   * Assumes entity.x/y are the ground contact point (feet).
   */
  getHitbox(entity) {
    return {
      x: entity.x,
      y: entity.y,
      radius: entity.radius || 20 // Default radius if not specified
    };
  }

  /**
   * Check for collision between an entity and a specific obstacle.
   * Returns collision data { overlap, normal } or null.
   */
  checkCollision(entity, obstacle) {
    const hitbox = this.getHitbox(entity);

    if (obstacle.type === 'rectangle') {
      return this.checkCircleRect(hitbox, obstacle);
    }
    // Add other shapes (circle-circle) here if needed
    return null;
  }

  /**
   * Check collision between a Circle (entity) and a Rectangle (obstacle).
   */
  checkCircleRect(circle, rect) {
    // Find the closest point on the rectangle to the circle's center
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

    // Calculate the distance vector between circle center and closest point
    const distanceX = circle.x - closestX;
    const distanceY = circle.y - closestY;

    // Distance squared (avoid sqrt for performance checks)
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
    const radiusSquared = circle.radius * circle.radius;

    if (distanceSquared < radiusSquared) {
      const distance = Math.sqrt(distanceSquared);
      
      // Calculate normal (direction from obstacle to player)
      // Handle edge case where center is exactly inside (distance is 0)
      let normalX = 0;
      let normalY = 0;
      
      if (distance === 0) {
        // Fallback: push out based on relative center to rect center
        const rectCenterX = rect.x + rect.width / 2;
        const rectCenterY = rect.y + rect.height / 2;
        if (Math.abs(circle.x - rectCenterX) > Math.abs(circle.y - rectCenterY)) {
            normalX = circle.x > rectCenterX ? 1 : -1;
        } else {
            normalY = circle.y > rectCenterY ? 1 : -1;
        }
      } else {
        normalX = distanceX / distance;
        normalY = distanceY / distance;
      }

      return {
        overlap: circle.radius - distance,
        normal: { x: normalX, y: normalY }
      };
    }

    return null;
  }

  /**
   * Resolve collision by modifying velocity to "slide" along the obstacle.
   * Does NOT modify position directly (that happens in the game loop).
   */
  resolveCollisionVelocity(entity, obstacle) {
    const collision = this.checkCollision(entity, obstacle);
    
    if (!collision) {
      return { ...entity.velocity };
    }

    const { normal } = collision;
    const { x: vx, y: vy } = entity.velocity;

    // Dot product of velocity and normal
    // Represents the speed at which we are moving INTO the wall
    const dotProduct = (vx * normal.x) + (vy * normal.y);

    // If moving away from wall, don't interfere
    if (dotProduct > 0) {
      return { ...entity.velocity };
    }

    // Subtract the normal component from velocity (Project onto tangent)
    // v_new = v - (v . n) * n
    const newVx = vx - (dotProduct * normal.x);
    const newVy = vy - (dotProduct * normal.y);

    return { x: newVx, y: newVy };
  }
}
