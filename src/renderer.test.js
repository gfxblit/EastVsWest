import { jest } from '@jest/globals';
/**
 * Renderer Tests
 * Unit tests for the Renderer class with camera support
 */

import { Renderer } from './renderer.js';
import { CONFIG } from './config.js';

describe('Renderer', () => {
  let canvas;
  let ctx;
  let renderer;

  beforeEach(() => {
    // Create a mock canvas and context
    canvas = document.createElement('canvas');
    ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      globalCompositeOperation: '',
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      stroke: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      clearRect: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      closePath: jest.fn(),
    };
    canvas.getContext = jest.fn(() => ctx);
    renderer = new Renderer(canvas);
    renderer.init();
  });

  describe('render with camera', () => {
    test('WhenRenderingWithCamera_ShouldApplyCameraTransform', () => {
      // Arrange
      const gameState = {
        conflictZone: { centerX: 1200, centerY: 800, radius: 600 },
        loot: [],
      };
      const camera = {
        x: 1200,
        y: 800,
        isInView: jest.fn(() => true),
        getEdgeIndicatorPosition: jest.fn(() => null),
      };

      // Act
      renderer.render(gameState, null, null, camera);

      // Assert
      // Should call save before transform
      expect(ctx.save).toHaveBeenCalled();

      // Should apply camera transform
      // Transform: ctx.translate(viewportWidth/2 - camera.x, viewportHeight/2 - camera.y)
      // Expected: (1200/2 - 1200, 800/2 - 800) = (600 - 1200, 400 - 800) = (-600, -400)
      expect(ctx.translate).toHaveBeenCalledWith(-600, -400);

      // Should call restore after rendering world entities
      expect(ctx.restore).toHaveBeenCalled();
    });

    test('WhenRenderingWithoutCamera_ShouldNotApplyTransform', () => {
      // Arrange
      const gameState = {
        conflictZone: { centerX: 600, centerY: 400, radius: 600 },
        loot: [],
      };

      // Act
      renderer.render(gameState, null, null, null);

      // Assert
      // Should not call transform methods
      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.translate).not.toHaveBeenCalled();
      expect(ctx.restore).not.toHaveBeenCalled();
    });
  });

  describe('renderEdgeIndicators', () => {
    test('WhenEntityOffScreen_ShouldRenderEdgeIndicator', () => {
      // Arrange
      const renderer = new Renderer(canvas);
      renderer.init();

      const playersSnapshot = {
        getPlayers: () => new Map([
          ['remote-player', {
            player_id: 'remote-player',
            player_name: 'RemotePlayer',
            position_x: 2000, // Off-screen to the right
            position_y: 800,
            health: 100,
          }]
        ])
      };

      const camera = {
        x: 1200,
        y: 800,
        isInView: (x, y) => x >= 600 && x <= 1800 && y >= 400 && y <= 1200,
        getEdgeIndicatorPosition: (x, y) => {
          if (x > 1800) {
            return { x: 1200, y: 400, angle: 0 };
          }
          return null;
        },
      };

      // Act
      renderer.renderEdgeIndicators(playersSnapshot, null, camera);

      // Assert
      // Should render indicator (checking that drawing methods were called)
      expect(ctx.beginPath).toHaveBeenCalled();
    });

    test('WhenAllEntitiesInView_ShouldNotRenderIndicators', () => {
      // Arrange
      const renderer = new Renderer(canvas);
      renderer.init();

      const playersSnapshot = {
        getPlayers: () => new Map([
          ['remote-player', {
            player_id: 'remote-player',
            player_name: 'RemotePlayer',
            position_x: 1200, // In view
            position_y: 800,
            health: 100,
          }]
        ])
      };

      const camera = {
        x: 1200,
        y: 800,
        isInView: () => true,
        getEdgeIndicatorPosition: () => null,
      };

      // Reset mocks
      ctx.beginPath.mockClear();

      // Act
      renderer.renderEdgeIndicators(playersSnapshot, null, camera);

      // Assert
      // Should not call drawing methods (no indicators to render)
      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    test('WhenLootOffScreen_ShouldRenderEdgeIndicator', () => {
      // Arrange
      const renderer = new Renderer(canvas);
      renderer.init();

      const gameState = {
        loot: [
          { id: 'loot-1', x: 2000, y: 800 } // Off-screen to the right
        ]
      };

      const camera = {
        x: 1200,
        y: 800,
        isInView: (x, y) => x >= 600 && x <= 1800 && y >= 400 && y <= 1200,
        getEdgeIndicatorPosition: (x, y) => {
          if (x > 1800) {
            return { x: 1200, y: 400, angle: 0 };
          }
          return null;
        },
      };

      // Act
      renderer.renderEdgeIndicators(null, null, camera, gameState.loot);

      // Assert
      // Should render indicator
      expect(ctx.beginPath).toHaveBeenCalled();
    });
  });

  describe('world coordinate rendering', () => {
    test('WhenRenderingConflictZone_ShouldUseWorldCoordinates', () => {
      // Arrange
      const conflictZone = {
        centerX: 1200, // World center
        centerY: 800,
        radius: 600,
      };

      // Act
      renderer.renderConflictZone(conflictZone);

      // Assert
      // Should render zone at world coordinates (1200, 800)
      expect(ctx.arc).toHaveBeenCalledWith(1200, 800, 600, 0, Math.PI * 2);
    });

    test('WhenRenderingPlayer_ShouldUseWorldCoordinates', () => {
      // Arrange
      const player = {
        id: 'player-1',
        name: 'Player1',
        x: 1500, // World coordinates
        y: 900,
        health: 100,
        rotation: 0,
      };

      // Act
      renderer.renderPlayer(player, false);

      // Assert
      // Should render player at world coordinates (1500, 900)
      expect(ctx.arc).toHaveBeenCalledWith(
        1500,
        900,
        CONFIG.RENDER.PLAYER_RADIUS,
        0,
        Math.PI * 2
      );
    });
  });
});
