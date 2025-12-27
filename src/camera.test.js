/**
 * Camera Tests
 * Unit tests for the Camera class
 */

import { Camera } from './camera.js';

describe('Camera', () => {
  describe('constructor', () => {
    test('WhenCreated_ShouldInitializeWithCorrectProperties', () => {
      // Arrange & Act
      const camera = new Camera(2400, 1600, 1200, 800);

      // Assert
      expect(camera.x).toBe(0);
      expect(camera.y).toBe(0);
      expect(camera.worldWidth).toBe(2400);
      expect(camera.worldHeight).toBe(1600);
      expect(camera.viewportWidth).toBe(1200);
      expect(camera.viewportHeight).toBe(800);
    });
  });

  describe('update', () => {
    test('WhenPlayerAtWorldCenter_ShouldMoveCameraToPlayerPosition', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      const targetX = 1200;
      const targetY = 800;

      // Act
      camera.update(targetX, targetY, 1.0); // lerp factor 1.0 = instant

      // Assert
      expect(camera.x).toBe(1200);
      expect(camera.y).toBe(800);
    });

    test('WhenLerpFactorApplied_ShouldSmoothlyInterpolateToTarget', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1000; // Start at valid position
      camera.y = 600;
      const targetX = 1200; // Move towards center
      const targetY = 800;
      const lerpFactor = 0.5;

      // Act
      camera.update(targetX, targetY, lerpFactor);

      // Assert
      // Camera should move halfway to target (1000 + 0.5 * (1200 - 1000) = 1100)
      expect(camera.x).toBe(1100);
      expect(camera.y).toBe(700); // 600 + 0.5 * (800 - 600) = 700
    });

    test('WhenPlayerNearLeftEdge_ShouldClampCameraToMinX', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      const targetX = 100; // Far left, camera should clamp to 600
      const targetY = 800;

      // Act
      camera.update(targetX, targetY, 1.0);

      // Assert
      expect(camera.x).toBe(600); // Min X bound
      expect(camera.y).toBe(800);
    });

    test('WhenPlayerNearRightEdge_ShouldClampCameraToMaxX', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      const targetX = 2300; // Far right, camera should clamp to 1800
      const targetY = 800;

      // Act
      camera.update(targetX, targetY, 1.0);

      // Assert
      expect(camera.x).toBe(1800); // Max X bound
      expect(camera.y).toBe(800);
    });

    test('WhenPlayerNearTopEdge_ShouldClampCameraToMinY', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      const targetX = 1200;
      const targetY = 100; // Top edge, camera should clamp to 400

      // Act
      camera.update(targetX, targetY, 1.0);

      // Assert
      expect(camera.x).toBe(1200);
      expect(camera.y).toBe(400); // Min Y bound
    });

    test('WhenPlayerNearBottomEdge_ShouldClampCameraToMaxY', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      const targetX = 1200;
      const targetY = 1500; // Bottom edge, camera should clamp to 1200

      // Act
      camera.update(targetX, targetY, 1.0);

      // Assert
      expect(camera.x).toBe(1200);
      expect(camera.y).toBe(1200); // Max Y bound
    });
  });

  describe('worldToScreen', () => {
    test('WhenWorldPositionProvided_ShouldConvertToScreenCoordinates', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200; // Camera at world center
      camera.y = 800;

      // Act
      // Player at world center should be at screen center
      const screenPos = camera.worldToScreen(1200, 800);

      // Assert
      expect(screenPos.x).toBe(600); // viewportWidth / 2
      expect(screenPos.y).toBe(400); // viewportHeight / 2
    });

    test('WhenPlayerRightOfCamera_ShouldAppearRightOfScreenCenter', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act
      // Entity 100 pixels to the right of camera
      const screenPos = camera.worldToScreen(1300, 800);

      // Assert
      expect(screenPos.x).toBe(700); // Screen center (600) + 100
      expect(screenPos.y).toBe(400);
    });

    test('WhenPlayerLeftOfCamera_ShouldAppearLeftOfScreenCenter', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act
      // Entity 100 pixels to the left of camera
      const screenPos = camera.worldToScreen(1100, 800);

      // Assert
      expect(screenPos.x).toBe(500); // Screen center (600) - 100
      expect(screenPos.y).toBe(400);
    });
  });

  describe('isInView', () => {
    test('WhenEntityAtCameraPosition_ShouldBeInView', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act & Assert
      expect(camera.isInView(1200, 800)).toBe(true);
    });

    test('WhenEntityInViewport_ShouldBeInView', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act & Assert
      // Entity at screen position (100, 100)
      // World position: camera.x - (viewportWidth/2 - 100) = 1200 - 500 = 700
      expect(camera.isInView(700, 400)).toBe(true);
    });

    test('WhenEntityOffScreenLeft_ShouldNotBeInView', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act & Assert
      // Entity far to the left (would be off-screen)
      expect(camera.isInView(500, 800)).toBe(false);
    });

    test('WhenEntityOffScreenRight_ShouldNotBeInView', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act & Assert
      // Entity far to the right (would be off-screen)
      expect(camera.isInView(1900, 800)).toBe(false);
    });

    test('WhenEntityOffScreenTop_ShouldNotBeInView', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act & Assert
      // Entity far above (would be off-screen)
      expect(camera.isInView(1200, 300)).toBe(false);
    });

    test('WhenEntityOffScreenBottom_ShouldNotBeInView', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act & Assert
      // Entity far below (would be off-screen)
      expect(camera.isInView(1200, 1300)).toBe(false);
    });
  });

  describe('getEdgeIndicatorPosition', () => {
    test('WhenEntityOffScreenRight_ShouldReturnRightEdgeIndicator', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act
      const indicator = camera.getEdgeIndicatorPosition(1900, 800);

      // Assert
      expect(indicator).not.toBeNull();
      expect(indicator.x).toBe(1200); // Right edge of viewport
      expect(indicator.y).toBe(400); // Vertically centered
      expect(indicator.angle).toBeCloseTo(0); // Pointing right
    });

    test('WhenEntityOffScreenLeft_ShouldReturnLeftEdgeIndicator', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act
      const indicator = camera.getEdgeIndicatorPosition(500, 800);

      // Assert
      expect(indicator).not.toBeNull();
      expect(indicator.x).toBe(0); // Left edge of viewport
      expect(indicator.y).toBe(400); // Vertically centered
      expect(indicator.angle).toBeCloseTo(Math.PI); // Pointing left
    });

    test('WhenEntityInView_ShouldReturnNull', () => {
      // Arrange
      const camera = new Camera(2400, 1600, 1200, 800);
      camera.x = 1200;
      camera.y = 800;

      // Act
      const indicator = camera.getEdgeIndicatorPosition(1200, 800);

      // Assert
      expect(indicator).toBeNull();
    });
  });
});
