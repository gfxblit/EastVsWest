/**
 * Camera
 * Handles camera following and world-to-screen coordinate transformations
 */

export class Camera {
  constructor(worldWidth, worldHeight, viewportWidth, viewportHeight) {
    this.x = 0;
    this.y = 0;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;

    // Calculate camera bounds
    // Camera should be clamped so that the viewport doesn't show empty space
    // Min: viewportWidth/2, Max: worldWidth - viewportWidth/2
    this.minX = viewportWidth / 2;
    this.maxX = worldWidth - viewportWidth / 2;
    this.minY = viewportHeight / 2;
    this.maxY = worldHeight - viewportHeight / 2;
  }

  update(targetX, targetY, lerpFactor) {
    // Smoothly interpolate to target position
    const newX = this.x + (targetX - this.x) * lerpFactor;
    const newY = this.y + (targetY - this.y) * lerpFactor;

    // Clamp to world bounds
    this.x = Math.max(this.minX, Math.min(this.maxX, newX));
    this.y = Math.max(this.minY, Math.min(this.maxY, newY));
  }

  worldToScreen(worldX, worldY) {
    // Convert world coordinates to screen coordinates
    // Screen center is at (viewportWidth/2, viewportHeight/2)
    // Camera position represents the world position at screen center
    const screenX = this.viewportWidth / 2 + (worldX - this.x);
    const screenY = this.viewportHeight / 2 + (worldY - this.y);

    return { x: screenX, y: screenY };
  }

  isInView(worldX, worldY) {
    // Check if a world position is visible in the viewport
    const screenPos = this.worldToScreen(worldX, worldY);

    return screenPos.x >= 0 &&
           screenPos.x <= this.viewportWidth &&
           screenPos.y >= 0 &&
           screenPos.y <= this.viewportHeight;
  }

  getEdgeIndicatorPosition(worldX, worldY) {
    // If entity is in view, no indicator needed
    if (this.isInView(worldX, worldY)) {
      return null;
    }

    const screenPos = this.worldToScreen(worldX, worldY);

    // Clamp to viewport edges
    const clampedX = Math.max(0, Math.min(this.viewportWidth, screenPos.x));
    const clampedY = Math.max(0, Math.min(this.viewportHeight, screenPos.y));

    // Calculate angle to entity from screen center
    const dx = worldX - this.x;
    const dy = worldY - this.y;
    const angle = Math.atan2(dy, dx);

    return {
      x: clampedX,
      y: clampedY,
      angle: angle,
    };
  }
}
