import { jest } from '@jest/globals';
/**
 * Renderer Tests
 * Unit tests for the Renderer class with camera support and background rendering
 */

import { Renderer } from './renderer.js';
import { CONFIG } from './config.js';

describe('Renderer', () => {
  let canvas;
  let ctx;
  let renderer;
  let mockImage;

  beforeEach(() => {
    // Mock window dimensions for responsive canvas sizing
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: CONFIG.CANVAS.WIDTH,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: CONFIG.CANVAS.HEIGHT,
    });

    // Mock Image
    mockImage = {
      onload: null,
      src: '',
    };
    global.Image = jest.fn(() => mockImage);

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
      createPattern: jest.fn(() => 'mock-pattern'),
      rect: jest.fn(),
    };
    canvas.getContext = jest.fn(() => ctx);
    renderer = new Renderer(canvas);
    renderer.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    test('ShouldInitializeContextAndLoadBackground', () => {
      const newRenderer = new Renderer(canvas);
      newRenderer.init();

      expect(canvas.getContext).toHaveBeenCalledWith('2d');
      expect(canvas.width).toBe(CONFIG.CANVAS.WIDTH);
      expect(canvas.height).toBe(CONFIG.CANVAS.HEIGHT);
      expect(global.Image).toHaveBeenCalled();
      expect(mockImage.src).toBe('/game-background.png');
    });

    test('WhenImageLoads_ShouldCreatePattern', () => {
      const newRenderer = new Renderer(canvas);
      newRenderer.init();

      // Simulate image load
      mockImage.onload();

      expect(ctx.createPattern).toHaveBeenCalledWith(mockImage, 'repeat');
      expect(newRenderer.bgPattern).toBe('mock-pattern');
    });
  });

  describe('render', () => {
    test('WhenRenderingWithoutCamera_ShouldClearCanvasWithBackgroundColor', () => {
      const gameState = {
        conflictZone: { centerX: 600, centerY: 400, radius: 300 },
        loot: []
      };

      // Track fillStyle assignments
      let fillStyleHistory = [];
      Object.defineProperty(ctx, 'fillStyle', {
        get: function() { return this._fillStyle; },
        set: function(val) {
          this._fillStyle = val;
          fillStyleHistory.push(val);
        },
        configurable: true
      });

      renderer.render(gameState, null, null, null);

      // Should clear canvas with background color (canvas dimensions)
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT);
      // First fillStyle should be background color (for canvas clear)
      expect(fillStyleHistory[0]).toBe(CONFIG.CANVAS.BACKGROUND_COLOR);
    });
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

    test('WhenRenderingWithCamera_ShouldDrawBackgroundInWorldCoordinates', () => {
      // Arrange
      mockImage.onload();

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

      // Track the order of operations with fillStyle to distinguish background from other fills
      const fillRectCalls = [];
      let currentFillStyle = null;
      Object.defineProperty(ctx, 'fillStyle', {
        get: function() { return currentFillStyle; },
        set: function(val) { currentFillStyle = val; },
        configurable: true
      });

      const callOrder = [];
      ctx.save.mockImplementation(() => callOrder.push('save'));
      ctx.translate.mockImplementation(() => callOrder.push('translate'));
      ctx.fillRect.mockImplementation((x, y, w, h) => {
        const call = {
          operation: 'fillRect',
          args: [x, y, w, h],
          fillStyle: currentFillStyle,
          order: callOrder.length
        };
        fillRectCalls.push(call);
        callOrder.push(`fillRect(${x}, ${y}, ${w}, ${h})`);
      });

      // Act
      renderer.render(gameState, null, null, camera);

      // Assert
      // Find background fill (uses pattern, not color)
      const backgroundFill = fillRectCalls.find(call => call.fillStyle === 'mock-pattern');

      expect(backgroundFill).toBeDefined();

      // Background should fill entire world, not just viewport
      expect(backgroundFill.args).toEqual([0, 0, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT]);

      // Background should be drawn AFTER camera transform
      const saveIndex = callOrder.indexOf('save');
      const translateIndex = callOrder.indexOf('translate');
      expect(saveIndex).toBeGreaterThanOrEqual(0);
      expect(translateIndex).toBeGreaterThan(saveIndex);
      expect(backgroundFill.order).toBeGreaterThan(translateIndex);
    });
  });

  describe('renderEdgeIndicators', () => {
    test('WhenEntityOffScreen_ShouldRenderEdgeIndicator', () => {
      // Arrange
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

    test('WhenRenderingConflictZoneDangerOverlay_ShouldCoverEntireWorld', () => {
      // Arrange
      const conflictZone = {
        centerX: 1200,
        centerY: 800,
        radius: 600,
      };

      // Act
      renderer.renderConflictZone(conflictZone);

      // Assert
      // Danger overlay should cover entire world, not just viewport
      // Find the fillRect call that draws the danger overlay
      const fillRectCalls = ctx.fillRect.mock.calls;
      const dangerOverlayCall = fillRectCalls.find(
        call => call[0] === 0 && call[1] === 0 && call[2] > 1200 && call[3] > 800
      );

      expect(dangerOverlayCall).toBeDefined();
      expect(dangerOverlayCall[2]).toBe(CONFIG.WORLD.WIDTH); // Should fill world width
      expect(dangerOverlayCall[3]).toBe(CONFIG.WORLD.HEIGHT); // Should fill world height
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
