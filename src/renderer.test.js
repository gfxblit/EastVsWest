import { jest } from '@jest/globals';
/**
 * Renderer Tests
 * Unit tests for the Renderer class with camera support and background rendering
 */

import { Renderer } from './renderer.js';
import { AssetManager } from './AssetManager.js';
import { CONFIG } from './config.js';
import { updateAnimationState, getDirectionFromRotation } from './animationHelper.js';

describe('Renderer', () => {
  let canvas;
  let ctx;
  let renderer;
  let mockImage;
  let assetManager;

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

    // Mock Image - create a new object for each call
    global.Image = jest.fn(() => {
      return {
        onload: null,
        onerror: null,
        src: '',
        complete: false,
        naturalWidth: 0, // Default to 0, tests can override
      };
    });

    // Keep reference to first image for compatibility with existing tests
    mockImage = {
      onload: null,
      src: '',
    };

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
      fillText: jest.fn(),
      drawImage: jest.fn(),
      measureText: jest.fn(() => ({ width: 100 })),
      canvas: canvas, // Link context back to canvas for ctx.canvas access
    };
    canvas.getContext = jest.fn(() => ctx);
    assetManager = new AssetManager();
    renderer = new Renderer(canvas, assetManager);
    renderer.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    test('ShouldInitializeContextAndLoadBackground', () => {
      // Clear Image mock to count only this test's calls
      global.Image.mockClear();

      const newRenderer = new Renderer(canvas, new AssetManager());
      newRenderer.init();

      expect(canvas.getContext).toHaveBeenCalledWith('2d');
      expect(canvas.width).toBe(CONFIG.CANVAS.WIDTH);
      expect(canvas.height).toBe(CONFIG.CANVAS.HEIGHT);

      // Should load background image + shadow image + 4 slash images + 4 thrust images + 5 weapon icons + 1 death image
      expect(global.Image).toHaveBeenCalledTimes(16);
      expect(newRenderer.worldRenderer.bgImage.src).toBe('/game-background.png');
      expect(newRenderer.playerRenderer.shadowImage.src).toBe('/shadow.png');
    });

    test('WhenImageLoads_ShouldCreatePattern', () => {
      const newRenderer = new Renderer(canvas, new AssetManager());
      newRenderer.init();

      // Simulate background image load with valid dimensions
      newRenderer.worldRenderer.bgImage.naturalWidth = 100;
      newRenderer.worldRenderer.bgImage.onload();

      expect(ctx.createPattern).toHaveBeenCalledWith(newRenderer.worldRenderer.bgImage, 'repeat');
      expect(newRenderer.worldRenderer.bgPattern).toBe('mock-pattern');
    });
    test('WhenBaseUrlIsPresent_ShouldPrefixImagePaths', () => {
      // Temporarily change base URL in config
      const originalBase = CONFIG.ASSETS.BASE_URL;
      CONFIG.ASSETS.BASE_URL = '/custom-base/';
      
      const newRenderer = new Renderer(canvas, new AssetManager());
      newRenderer.init();
      
      // Expect paths to be prefixed with custom base
      expect(newRenderer.worldRenderer.bgImage.src).toContain('/custom-base/game-background.png');
      
      // Restore config
      CONFIG.ASSETS.BASE_URL = originalBase;
    });
  });

  describe('resizeCanvas', () => {
    test('WhenResizing_ShouldFillEntireViewport', () => {
      // Arrange - Desktop viewport
      window.innerWidth = 1920;
      window.innerHeight = 1080;

      // Act
      renderer.resizeCanvas();

      // Assert - Canvas should fill entire viewport
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    test('WhenPortraitOrientation_ShouldAdaptToPortraitViewport', () => {
      // Arrange - Portrait iPhone
      window.innerWidth = 390;
      window.innerHeight = 844;

      // Act
      renderer.resizeCanvas();

      // Assert - Canvas should use full portrait viewport
      expect(canvas.width).toBe(390);
      expect(canvas.height).toBe(844);
    });

    test('WhenLandscapeOrientation_ShouldAdaptToLandscapeViewport', () => {
      // Arrange - Landscape iPhone
      window.innerWidth = 844;
      window.innerHeight = 390;

      // Act
      renderer.resizeCanvas();

      // Assert - Canvas should use full landscape viewport
      expect(canvas.width).toBe(844);
      expect(canvas.height).toBe(390);
    });

    test('WhenResizing_ShouldAdaptToAnyAspectRatio', () => {
      // Arrange - Various viewport sizes with different aspect ratios
      const testCases = [
        { width: 1920, height: 1080 }, // 16:9 desktop
        { width: 768, height: 1024 },  // 3:4 iPad portrait
        { width: 1024, height: 768 },  // 4:3 iPad landscape
        { width: 375, height: 667 },   // ~9:16 iPhone portrait
        { width: 667, height: 375 },   // ~16:9 iPhone landscape
        { width: 1440, height: 900 },  // 16:10 laptop
      ];

      testCases.forEach(({ width, height }) => {
        // Act
        window.innerWidth = width;
        window.innerHeight = height;
        renderer.resizeCanvas();

        // Assert - Canvas should exactly match viewport
        expect(canvas.width).toBe(width);
        expect(canvas.height).toBe(height);
      });
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

      renderer.render(gameState, null, null, null, 0.016);

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
      renderer.render(gameState, null, null, camera, 0.016);

      // Assert
      // Should call save before transform
      expect(ctx.save).toHaveBeenCalled();

      // Should apply camera transform
      // Transform: ctx.translate(viewportWidth/2 - camera.x, viewportHeight/2 - camera.y)
      // Expected: (1920/2 - 1200, 1080/2 - 800) = (960 - 1200, 540 - 800) = (-240, -260)
      expect(ctx.translate).toHaveBeenCalledWith(-240, -260);

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
      // Should not call transform methods (translate)
      // save/restore are allowed for general state management
      expect(ctx.translate).not.toHaveBeenCalled();
    });

    test('WhenRenderingWithCamera_ShouldDrawBackgroundInWorldCoordinates', () => {
      // Arrange
      // Trigger background image load
      if (renderer.worldRenderer.bgImage) {
        renderer.worldRenderer.bgImage.naturalWidth = 100;
        if (renderer.worldRenderer.bgImage.onload) {
          renderer.worldRenderer.bgImage.onload();
        }
      }

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
      renderer.render(gameState, null, null, camera, 0.016);

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
      renderer.uiRenderer.renderEdgeIndicators(ctx, playersSnapshot, null, camera);

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
      renderer.uiRenderer.renderEdgeIndicators(ctx, playersSnapshot, null, camera);

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
      renderer.uiRenderer.renderEdgeIndicators(ctx, null, null, camera, gameState.loot);

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
      renderer.worldRenderer.renderConflictZone(ctx, conflictZone);

      // Assert
      // Should render zone at world coordinates (1200, 800)
      expect(ctx.arc).toHaveBeenCalledWith(1200, 800, 600, 0, Math.PI * 2, true);
    });

    test('WhenRenderingConflictZoneDangerOverlay_ShouldCoverEntireWorld', () => {
      // Arrange
      const conflictZone = {
        centerX: 1200,
        centerY: 800,
        radius: 600,
      };

      // Act
      renderer.worldRenderer.renderConflictZone(ctx, conflictZone);

      // Assert
      // Danger overlay should cover entire world, not just viewport
      // Find the rect call that draws the danger overlay
      const rectCalls = ctx.rect.mock.calls;
      const dangerOverlayCall = rectCalls.find(
        call => call[0] === 0 && call[1] === 0 && call[2] > 1200 && call[3] > 800
      );

      expect(dangerOverlayCall).toBeDefined();
      expect(dangerOverlayCall[2]).toBe(CONFIG.WORLD.WIDTH); // Should fill world width
      expect(dangerOverlayCall[3]).toBe(CONFIG.WORLD.HEIGHT); // Should fill world height
    });

    test('WhenRenderingPlayer_ShouldUseWorldCoordinates', () => {
      // Arrange
      // Mock sprite sheet as loaded
      renderer.assetManager.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.assetManager.spriteSheetMetadata = {
        frameWidth: 96,
        frameHeight: 96,
        columns: 6,
        rows: 8,
      };

      // Add drawImage to context
      ctx.drawImage = jest.fn();

      const player = {
        id: 'player-1',
        name: 'Player1',
        x: 1500, // World coordinates
        y: 900,
        health: 100,
        rotation: 0, // North
        animationState: {
          currentFrame: 0,
          lastDirection: 4, // North
          timeAccumulator: 0,
        },
      };

      // Act
      renderer.playerRenderer.render(ctx, player, false);

      // Assert
      // Should render player using sprite sheet at world coordinates (1500, 900)
      expect(ctx.drawImage).toHaveBeenCalled();
      // Verify sprite sheet rendering (9 parameters for source + dest)
      const drawImageCalls = ctx.drawImage.mock.calls;
      const hasSpriteSheetCall = drawImageCalls.some(call => call.length === 9);
      expect(hasSpriteSheetCall).toBe(true);
    });
  });

  describe('Shadow Rendering', () => {
    beforeEach(() => {
      // Add drawImage method to mock context
      ctx.drawImage = jest.fn();

      // Mock shadow image as loaded
      renderer.playerRenderer.shadowImage = {
        complete: true,
        naturalWidth: 100,
        width: 96,
        height: 96,
        src: '/shadow.png',
      };
    });

    test('WhenInitialized_ShouldLoadShadowImage', () => {
      // Arrange - Create new renderer to test initialization
      const newRenderer = new Renderer(canvas, new AssetManager());

      // Clear existing Image mock calls
      global.Image.mockClear();

      // Act
      newRenderer.init();

      // Assert

      // Should create shadow image + background image + slash images + thrust images + weapon icons + 1 death image
      expect(global.Image).toHaveBeenCalledTimes(16);
      expect(newRenderer.playerRenderer.shadowImage).toBeDefined();
      expect(newRenderer.playerRenderer.shadowImage.src).toBe('/shadow.png');
    });

    test('WhenRenderingPlayer_ShouldRenderShadowBeforePlayerSprite', () => {
      // Arrange
      // Mock sprite sheet as loaded
      renderer.assetManager.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.assetManager.spriteSheetMetadata = {
        frameWidth: 96,
        frameHeight: 96,
        columns: 6,
        rows: 8,
      };

      const player = {
        id: 'player-1',
        name: 'Player1',
        x: 1500,
        y: 900,
        health: 100,
        rotation: 0,
        animationState: {
          currentFrame: 0,
          lastDirection: 4, // North
          timeAccumulator: 0,
        },
      };

      const drawImageCalls = [];
      ctx.drawImage.mockImplementation((...args) => {
        drawImageCalls.push(args);
      });

      // Act
      renderer.playerRenderer.render(ctx, player, false);

      // Assert
      // Should call drawImage twice: once for shadow, once for player sprite sheet
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);

      // First call should be shadow (rendered before player)
      expect(drawImageCalls[0][0]).toBe(renderer.playerRenderer.shadowImage);

      // Second call should be player sprite sheet
      expect(drawImageCalls[1][0]).toBe(renderer.assetManager.spriteSheet);
    });

    test('WhenRenderingPlayer_ShouldPositionShadowAtPlayerLocation', () => {
      // Arrange
      // Mock sprite sheet as loaded
      renderer.assetManager.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.assetManager.spriteSheetMetadata = {
        frameWidth: 96,
        frameHeight: 96,
        columns: 6,
        rows: 8,
      };

      const player = {
        id: 'player-1',
        name: 'Player1',
        x: 1500,
        y: 900,
        health: 100,
        rotation: 0,
        animationState: {
          currentFrame: 0,
          lastDirection: 4,
          timeAccumulator: 0,
        },
      };

      const drawImageCalls = [];
      ctx.drawImage.mockImplementation((...args) => {
        drawImageCalls.push(args);
      });

      // Act
      renderer.playerRenderer.render(ctx, player, false);

      // Assert
      // Shadow should be centered at player position
      const shadowCall = drawImageCalls[0];
      const expectedX = 1500 - CONFIG.RENDER.PLAYER_RADIUS;
      const expectedY = 900 - CONFIG.RENDER.PLAYER_RADIUS;

      expect(shadowCall[1]).toBe(expectedX);
      expect(shadowCall[2]).toBe(expectedY);
      expect(shadowCall[3]).toBe(CONFIG.RENDER.PLAYER_RADIUS * 2); // width
      expect(shadowCall[4]).toBe(CONFIG.RENDER.PLAYER_RADIUS * 2); // height
    });

    test('WhenPlayerRotates_ShadowShouldNotRotate', () => {
      // Arrange - Test multiple rotations
      const rotations = [0, Math.PI / 4, Math.PI / 2, Math.PI, 3 * Math.PI / 2];

      // Mock sprite sheet as loaded
      renderer.assetManager.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.assetManager.spriteSheetMetadata = {
        frameWidth: 96,
        frameHeight: 96,
        columns: 6,
        rows: 8,
      };

      for (const rotation of rotations) {
        ctx.drawImage.mockClear();
        const drawImageCalls = [];
        ctx.drawImage.mockImplementation((...args) => {
          drawImageCalls.push(args);
        });

        const player = {
          id: 'player-1',
          name: 'Player1',
          x: 1500,
          y: 900,
          health: 100,
          rotation: rotation,
          animationState: {
            currentFrame: 0,
            lastDirection: 4,
            timeAccumulator: 0,
          },
        };

        // Act
        renderer.playerRenderer.render(ctx, player, false);

        // Assert
        // Shadow should always use the same image regardless of rotation
        const shadowCall = drawImageCalls[0];
        expect(shadowCall[0]).toBe(renderer.playerRenderer.shadowImage);
      }
    });

    test('WhenRenderingLocalPlayer_ShouldRenderShadow', () => {
      // Arrange
      // Mock sprite sheet as loaded
      renderer.assetManager.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.assetManager.spriteSheetMetadata = {
        frameWidth: 96,
        frameHeight: 96,
        columns: 6,
        rows: 8,
      };

      const player = {
        id: 'player-1',
        name: 'Player1',
        x: 1500,
        y: 900,
        health: 100,
        rotation: 0,
        animationState: {
          currentFrame: 0,
          lastDirection: 4,
          timeAccumulator: 0,
        },
      };

      const drawImageCalls = [];
      ctx.drawImage.mockImplementation((...args) => {
        drawImageCalls.push(args);
      });

      // Act
      renderer.playerRenderer.render(ctx, player, true); // isLocal = true

      // Assert
      // Should render shadow even for local player
      expect(drawImageCalls[0][0]).toBe(renderer.playerRenderer.shadowImage);
    });

    test('WhenShadowImageNotLoaded_ShouldSkipShadowRendering', () => {
      // Arrange
      renderer.playerRenderer.shadowImage = null;

      // Mock sprite sheet as loaded
      renderer.assetManager.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.assetManager.spriteSheetMetadata = {
        frameWidth: 96,
        frameHeight: 96,
        columns: 6,
        rows: 8,
      };

      const player = {
        id: 'player-1',
        name: 'Player1',
        x: 1500,
        y: 900,
        health: 100,
        rotation: 0,
        animationState: {
          currentFrame: 0,
          lastDirection: 4,
          timeAccumulator: 0,
        },
      };

      const drawImageCalls = [];
      ctx.drawImage.mockImplementation((...args) => {
        drawImageCalls.push(args);
      });

      // Act
      renderer.playerRenderer.render(ctx, player, false);

      // Assert
      // Should only render player sprite sheet, not shadow
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      expect(drawImageCalls[0][0]).toBe(renderer.assetManager.spriteSheet);
    });
  });

  describe('Directional Player Rendering', () => {
    beforeEach(() => {
      // Add drawImage method to mock context
      ctx.drawImage = jest.fn();
    });

    describe('Frame Selection (using helper)', () => {
      test('WhenRotationIsSouth_ShouldSelectFrame0', () => {
        const frame = getDirectionFromRotation(Math.PI); // 180 degrees
        expect(frame).toBe(0);
      });

      test('WhenRotationIsEast_ShouldSelectFrame1', () => {
        const frame = getDirectionFromRotation(Math.PI / 2); // 90 degrees
        expect(frame).toBe(1);
      });

      test('WhenRotationIsNorth_ShouldSelectFrame2', () => {
        const frame = getDirectionFromRotation(0); // 0 degrees
        expect(frame).toBe(2);
      });

      test('WhenRotationIsWest_ShouldSelectFrame3', () => {
        const frame = getDirectionFromRotation(3 * Math.PI / 2); // 270 degrees
        expect(frame).toBe(3);
      });

      test('WhenRotationIsBetweenDirections_ShouldSelectNearestFrame', () => {
        // Test rotation slightly past north (5 degrees)
        const frame = getDirectionFromRotation(5 * Math.PI / 180);
        expect(frame).toBe(2); // Should be North

        // Test rotation between North and East (44 degrees)
        const frame2 = getDirectionFromRotation(44 * Math.PI / 180);
        expect(frame2).toBe(2); // Should be North

        // Test rotation between North and East (46 degrees)
        const frame3 = getDirectionFromRotation(46 * Math.PI / 180);
        expect(frame3).toBe(1); // Should be East
      });
    });

    describe('Image Loading', () => {
      test('WhenInitialized_ShouldLoadAllDirectionalImages', () => {
        // Create new renderer to test initialization
        const newRenderer = new Renderer(canvas, new AssetManager());

        // Clear existing Image mock calls
        global.Image.mockClear();

        newRenderer.init();

        // Should create background image + shadow image + slash images + thrust images + weapon icons + 1 death image
        expect(global.Image).toHaveBeenCalledTimes(16);
      });

    });

    describe('Player Rendering with Sprite Sheets', () => {

      test('WhenRenderingPlayerFacingSouth_ShouldDrawFrame0', () => {
        // Mock sprite sheet as loaded
        renderer.assetManager.spriteSheet = {
          complete: true,
          naturalWidth: 128,
          naturalHeight: 128,
        };
        renderer.assetManager.spriteSheetMetadata = {
          frameWidth: 32,
          frameHeight: 32,
          columns: 4,
          rows: 4,
        };

        const player = {
          id: 'player-1',
          name: 'Player1',
          x: 1500,
          y: 900,
          health: 100,
          rotation: Math.PI, // South
          animationState: {
            currentFrame: 0,
            lastDirection: 0, // South
            timeAccumulator: 0,
          },
        };

        renderer.playerRenderer.render(ctx, player, false);

        // Should draw from sprite sheet (using renderPlayerWithSpriteSheet)
        expect(ctx.drawImage).toHaveBeenCalled();
      });

      test('WhenRenderingPlayerFacingEast_ShouldDrawFrame1', () => {
        // Mock sprite sheet as loaded
        renderer.assetManager.spriteSheet = {
          complete: true,
          naturalWidth: 128,
          naturalHeight: 128,
        };
        renderer.assetManager.spriteSheetMetadata = {
          frameWidth: 32,
          frameHeight: 32,
          columns: 4,
          rows: 4,
        };

        const player = {
          id: 'player-1',
          name: 'Player1',
          x: 1500,
          y: 900,
          health: 100,
          rotation: Math.PI / 2, // East
          animationState: {
            currentFrame: 0,
            lastDirection: 1, // East
            timeAccumulator: 0,
          },
        };

        renderer.playerRenderer.render(ctx, player, false);

        // Should draw from sprite sheet (using renderPlayerWithSpriteSheet)
        expect(ctx.drawImage).toHaveBeenCalled();
      });

      test('WhenRenderingPlayer_ShouldCenterImageOnPlayerPosition', () => {
        // Mock sprite sheet as loaded
        renderer.assetManager.spriteSheet = {
          complete: true,
          naturalWidth: 128,
          naturalHeight: 128,
        };
        renderer.assetManager.spriteSheetMetadata = {
          frameWidth: 32,
          frameHeight: 32,
          columns: 4,
          rows: 4,
        };

        const player = {
          id: 'player-1',
          name: 'Player1',
          x: 1500,
          y: 900,
          health: 100,
          rotation: 0, // North
          animationState: {
            currentFrame: 0,
            lastDirection: 2, // North
            timeAccumulator: 0,
          },
        };

        renderer.playerRenderer.render(ctx, player, false);

        // Image should be centered on player position (using sprite sheet)
        expect(ctx.drawImage).toHaveBeenCalled();
        // Verify at least one drawImage call has the player position
        const drawImageCalls = ctx.drawImage.mock.calls;
        const hasCorrectPosition = drawImageCalls.some(call => {
          // Check if this is a sprite sheet draw (9 parameters) and has correct dest coordinates
          if (call.length === 9) {
            const destX = call[5];
            const destY = call[6];
            const expectedX = 1500 - CONFIG.RENDER.PLAYER_RADIUS;
            const expectedY = 900 - CONFIG.RENDER.PLAYER_RADIUS;
            return destX === expectedX && destY === expectedY;
          }
          return false;
        });
        expect(hasCorrectPosition).toBe(true);
      });

      test('WhenRenderingLocalPlayer_ShouldDrawImageAndWhiteOutline', () => {
        // Mock sprite sheet as loaded
        renderer.assetManager.spriteSheet = {
          complete: true,
          naturalWidth: 128,
          naturalHeight: 128,
        };
        renderer.assetManager.spriteSheetMetadata = {
          frameWidth: 32,
          frameHeight: 32,
          columns: 4,
          rows: 4,
        };

        const player = {
          id: 'player-1',
          name: 'Player1',
          x: 1500,
          y: 900,
          health: 100,
          rotation: 0,
          animationState: {
            currentFrame: 0,
            lastDirection: 2, // North
            timeAccumulator: 0,
          },
        };

        renderer.playerRenderer.render(ctx, player, true); // isLocal = true

        // Should draw the sprite from sprite sheet
        expect(ctx.drawImage).toHaveBeenCalled();

        // Should also draw white outline for local player
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.strokeStyle).toBe('#ffffff');
      });
    });
  });

  describe('Sprite Sheet Animation', () => {
    describe('loadSpriteSheet', () => {
      test('WhenLoadingSpriteSheet_ShouldLoadImageAndMetadata', async () => {
        // Mock fetch for metadata
        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              frameWidth: 32,
              frameHeight: 32,
              columns: 4,
              rows: 4,
              animations: {
                south: { row: 0, frames: 4 },
                east: { row: 1, frames: 4 },
                north: { row: 2, frames: 4 },
                west: { row: 3, frames: 4 }
              }
            })
          })
        );

        const newRenderer = new Renderer(canvas, new AssetManager());

        // Start loading sprite sheet
        const loadPromise = newRenderer.assetManager.loadSpriteSheet();

        // Simulate image load completion after event loop tick
        setTimeout(() => {
          if (newRenderer.assetManager.spriteSheet && newRenderer.assetManager.spriteSheet.onload) {
            newRenderer.assetManager.spriteSheet.onload();
          }
        }, 0);

        await loadPromise;

        expect(newRenderer.assetManager.spriteSheet).toBeDefined();
        expect(newRenderer.assetManager.spriteSheetMetadata).toBeDefined();
        expect(newRenderer.assetManager.spriteSheetMetadata.frameWidth).toBe(32);
        expect(newRenderer.assetManager.spriteSheetMetadata.frameHeight).toBe(32);
        expect(newRenderer.assetManager.spriteSheetMetadata.columns).toBe(4);
        expect(newRenderer.assetManager.spriteSheetMetadata.rows).toBe(4);
      });

      test('WhenMetadataLoadFails_ShouldHandleGracefully', async () => {
        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: false,
            statusText: 'Not Found'
          })
        );

        const newRenderer = new Renderer(canvas, new AssetManager());
        await expect(newRenderer.assetManager.loadSpriteSheet()).resolves.toBe(false);
      });
    });


    describe('updateAnimationState', () => {
      test('WhenPlayerIsAttacking_ShouldUseSlashSpritesheet', () => {
      // Mock both spritesheets
      const walkSheet = { complete: true, naturalWidth: 128, naturalHeight: 128 };
      const slashSheet = { complete: true, naturalWidth: 1750, naturalHeight: 1400 }; // 5 frames * 350, 4 rows * 350
      
      renderer.assetManager._spriteSheets.set('walk', walkSheet);
      renderer.assetManager._spriteSheets.set('slash', slashSheet);
      
      renderer.assetManager._spriteSheetMetadata.set('walk', {
        frameWidth: 32, frameHeight: 32, columns: 4, rows: 4
      });
      renderer.assetManager._spriteSheetMetadata.set('slash', {
        frameWidth: 350, frameHeight: 350, columns: 5, rows: 4
      });

      const player = {
        id: 'player-1',
        x: 100,
        y: 100,
        rotation: Math.PI / 2, // East
        isAttacking: true,
        attackAnimTime: 0.1, // Halfway through 0.2s animation
        animationState: {
          currentFrame: 0,
          lastDirection: 1, // East
        },
      };

      renderer.playerRenderer.render(ctx, player, false);

      // Should draw from slash spritesheet
      // 5th argument of drawImage is sourceWidth, which is 350 for slash sheet
      expect(ctx.drawImage).toHaveBeenCalledWith(
        slashSheet,
        expect.any(Number), // sourceX
        expect.any(Number), // sourceY
        350,                // sourceWidth
        350,                // sourceHeight
        expect.any(Number), // destX
        expect.any(Number), // destY
        expect.any(Number), // destWidth
        expect.any(Number)  // destHeight
      );
    });

    test('WhenPlayerIsMoving_ShouldAdvanceFrame', () => {
        const animState = {
          currentFrame: 0,
          timeAccumulator: 0,
          lastDirection: 1 // East
        };

        const deltaTime = 1 / CONFIG.ANIMATION.FPS; // One frame duration
        const isMoving = true;
        const direction = 1; // East

        updateAnimationState(animState, deltaTime, isMoving, direction);

        expect(animState.currentFrame).toBe(1); // Should advance to next frame
        expect(animState.timeAccumulator).toBeLessThan(deltaTime);
        expect(animState.lastDirection).toBe(1); // Should maintain direction
      });

      test('WhenPlayerIsIdle_ShouldNotAdvanceFrame', () => {
        const animState = {
          currentFrame: 3,
          timeAccumulator: 0,
          lastDirection: 1 // East
        };

        const deltaTime = 1 / CONFIG.ANIMATION.FPS; // One frame duration
        const isMoving = false;
        const direction = null; // Idle

        updateAnimationState(animState, deltaTime, isMoving, direction);

        expect(animState.currentFrame).toBe(0); // Should reset to idle frame
        expect(animState.lastDirection).toBe(1); // Should keep last direction
      });

      test('WhenFrameExceedsMax_ShouldLoopBackToZero', () => {
        const animState = {
          currentFrame: 3, // Last frame
          timeAccumulator: 0,
          lastDirection: 2 // North
        };

        const deltaTime = 1 / CONFIG.ANIMATION.FPS; // One frame duration
        const isMoving = true;
        const direction = 2; // North

        updateAnimationState(animState, deltaTime, isMoving, direction);

        expect(animState.currentFrame).toBe(0); // Should loop back to first frame
      });

      test('WhenDirectionChanges_ShouldUpdateLastDirection', () => {
        const animState = {
          currentFrame: 2,
          timeAccumulator: 0,
          lastDirection: 1 // East
        };

        const deltaTime = 0.01; // Small delta
        const isMoving = true;
        const direction = 2; // Changed to North

        updateAnimationState(animState, deltaTime, isMoving, direction);

        expect(animState.lastDirection).toBe(2); // Should update to new direction
      });
    });

    describe('renderPlayerWithSpriteSheet', () => {
      beforeEach(() => {
        // Mock sprite sheet as loaded
        renderer.assetManager.spriteSheet = {
          complete: true,
          naturalWidth: 128, // 4 columns * 32px
          naturalHeight: 128, // 4 rows * 32px
        };
        renderer.assetManager.spriteSheetMetadata = {
          frameWidth: 32,
          frameHeight: 32,
          columns: 4,
          rows: 4,
        };

        ctx.drawImage = jest.fn();
      });

      test('WhenRenderingPlayerWithSpriteSheet_ShouldDrawCorrectFrame', () => {
        const player = {
          id: 'player-1',
          x: 1500,
          y: 900,
          health: 100,
          animationState: {
            currentFrame: 2, // Frame 2
            lastDirection: 2, // North (row 2)
          },
        };

        renderer.playerRenderer.render(ctx, player, false);

        // Should draw frame from sprite sheet
        // sourceX = currentFrame * frameWidth = 2 * 32 = 64
        // sourceY = lastDirection * frameHeight = 2 * 32 = 64
        expect(ctx.drawImage).toHaveBeenCalledWith(
          renderer.assetManager.spriteSheet,
          64, // sourceX
          64, // sourceY
          32,  // sourceWidth
          32,  // sourceHeight
          1500 - CONFIG.RENDER.PLAYER_RADIUS, // destX (centered)
          900 - CONFIG.RENDER.PLAYER_RADIUS,  // destY (centered)
          CONFIG.RENDER.PLAYER_RADIUS * 2,    // destWidth
          CONFIG.RENDER.PLAYER_RADIUS * 2     // destHeight
        );
      });

      test('WhenSpriteSheetNotLoaded_ShouldFallbackToPinkRectangle', () => {
        renderer.assetManager.spriteSheet = null;

        const player = {
          id: 'player-1',
          x: 1500,
          y: 900,
          health: 100,
          animationState: {
            currentFrame: 0,
            lastDirection: 0,
          },
        };

        renderer.playerRenderer.render(ctx, player, false);

        // Should draw fallback rectangle
        expect(ctx.fillRect).toHaveBeenCalled();
        // Check that pink color was set
        expect(ctx.fillStyle).toContain('ff'); // Pink has high red and blue
      });

      test('WhenRenderingIdlePlayer_ShouldUseFrame0', () => {
        const player = {
          id: 'player-1',
          x: 1500,
          y: 900,
          health: 100,
          animationState: {
            currentFrame: 0, // Idle frame
            lastDirection: 1, // East
          },
        };

        renderer.playerRenderer.render(ctx, player, false);

        // Should draw first frame (idle) from East direction row
        // sourceX = 0 * 32 = 0
        // sourceY = 1 * 32 = 32
        expect(ctx.drawImage).toHaveBeenCalledWith(
          renderer.assetManager.spriteSheet,
          0,   // sourceX (idle frame)
          32,  // sourceY (East row)
          32,
          32,
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number)
        );
      });
    });
  });

  describe('Attack VFX Rendering', () => {
    beforeEach(() => {
      ctx.drawImage = jest.fn();
      
      // Mock images as loaded
      const directions = ['up', 'down', 'left', 'right'];
      directions.forEach(dir => {
        renderer.playerRenderer.slashImages[dir] = { complete: true, naturalWidth: 64, naturalHeight: 64 };
        renderer.playerRenderer.thrustImages[dir] = { complete: true, naturalWidth: 64, naturalHeight: 64 };
      });
    });

    test('WhenPlayerAttacksWithSlashWeapon_ShouldUseSlashImages', () => {
      const player = {
        x: 100,
        y: 100,
        rotation: Math.PI / 2, // East
        isAttacking: true,
        attackAnimTime: CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS,
        equipped_weapon: 'battleaxe', // Slashing weapon
      };

      renderer.playerRenderer.renderSlashAnimation(ctx, player);

      expect(ctx.drawImage).toHaveBeenCalled();
      const firstCall = ctx.drawImage.mock.calls[0];
      expect(firstCall[0]).toBe(renderer.playerRenderer.slashImages.right);
    });

    test('WhenPlayerAttacksWithSpear_ShouldUseThrustImages', () => {
      const player = {
        x: 100,
        y: 100,
        rotation: Math.PI / 2, // East
        isAttacking: true,
        attackAnimTime: CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS,
        equipped_weapon: 'spear', // Piercing weapon
      };

      renderer.playerRenderer.renderSlashAnimation(ctx, player);

      expect(ctx.drawImage).toHaveBeenCalled();
      const firstCall = ctx.drawImage.mock.calls[0];
      expect(firstCall[0]).toBe(renderer.playerRenderer.thrustImages.right);
    });

    test('WhenPlayerAttacksFacingNorth_ShouldUseUpImages', () => {
      const player = {
        x: 100,
        y: 100,
        rotation: 0, // North
        isAttacking: true,
        attackAnimTime: CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS,
        equipped_weapon: 'spear',
      };

      renderer.playerRenderer.renderSlashAnimation(ctx, player);

      expect(ctx.drawImage).toHaveBeenCalled();
      const firstCall = ctx.drawImage.mock.calls[0];
      expect(firstCall[0]).toBe(renderer.playerRenderer.thrustImages.up);
    });

    describe('VFX Offset Rotation', () => {
      const frameWidth = 64;
      const scale = CONFIG.COMBAT.THRUST_VFX_SCALE;
      const drawWidth = frameWidth * scale;
      const halfDrawWidth = drawWidth / 2;

      test('WhenFacingRight_ShouldUseOriginalOffsets', () => {
        const player = {
          x: 1000,
          y: 1000,
          rotation: Math.PI / 2, // East/Right
          isAttacking: true,
          attackAnimTime: CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS,
          equipped_weapon: 'spear',
        };

        renderer.playerRenderer.renderSlashAnimation(ctx, player);
        
        const vfxOffset = CONFIG.COMBAT.THRUST_VFX_OFFSET;
        const expectedX = player.x + vfxOffset.x - halfDrawWidth;
        const expectedY = player.y + vfxOffset.y - halfDrawWidth;
        
        const call = ctx.drawImage.mock.calls[0];
        expect(call[5]).toBeCloseTo(expectedX);
        expect(call[6]).toBeCloseTo(expectedY);
      });

      test('WhenFacingUp_ShouldRotateOffsets90CCW', () => {
        const player = {
          x: 1000,
          y: 1000,
          rotation: 0, // North/Up
          isAttacking: true,
          attackAnimTime: CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS,
          equipped_weapon: 'spear',
        };

        renderer.playerRenderer.renderSlashAnimation(ctx, player);
        
        const vfxOffset = CONFIG.COMBAT.THRUST_VFX_OFFSET;
        // Right (x, y) -> Up (y, -x)
        const expectedX = player.x + vfxOffset.y - halfDrawWidth;
        const expectedY = player.y - vfxOffset.x - halfDrawWidth;
        
        const call = ctx.drawImage.mock.calls[0];
        expect(call[5]).toBeCloseTo(expectedX);
        expect(call[6]).toBeCloseTo(expectedY);
      });

      test('WhenFacingLeft_ShouldReflectLateralOffset', () => {
        const player = {
          x: 1000,
          y: 1000,
          rotation: 3 * Math.PI / 2, // West/Left
          isAttacking: true,
          attackAnimTime: CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS,
          equipped_weapon: 'spear',
        };

        renderer.playerRenderer.renderSlashAnimation(ctx, player);
        
        const vfxOffset = CONFIG.COMBAT.THRUST_VFX_OFFSET;
        // Right (x, y) -> Left (-x, y) [Reflected lateral]
        const expectedX = player.x - vfxOffset.x - halfDrawWidth;
        const expectedY = player.y + vfxOffset.y - halfDrawWidth;
        
        const call = ctx.drawImage.mock.calls[0];
        expect(call[5]).toBeCloseTo(expectedX);
        expect(call[6]).toBeCloseTo(expectedY);
      });

      test('WhenFacingDown_ShouldRotateOffsets270CCW', () => {
        const player = {
          x: 1000,
          y: 1000,
          rotation: Math.PI, // South/Down
          isAttacking: true,
          attackAnimTime: CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS,
          equipped_weapon: 'spear',
        };

        renderer.playerRenderer.renderSlashAnimation(ctx, player);
        
        const vfxOffset = CONFIG.COMBAT.THRUST_VFX_OFFSET;
        // Right (x, y) -> Down (-y, x)
        const expectedX = player.x - vfxOffset.y - halfDrawWidth;
        const expectedY = player.y + vfxOffset.x - halfDrawWidth;
        
        const call = ctx.drawImage.mock.calls[0];
        expect(call[5]).toBeCloseTo(expectedX);
        expect(call[6]).toBeCloseTo(expectedY);
      });
    });
  });

  describe('Floating Text', () => {
    test('addFloatingText should add text to floatingTexts array', () => {
      renderer.uiRenderer.addFloatingText(100, 200, '50', '#ff0000');
      
      expect(renderer.uiRenderer.floatingTexts).toHaveLength(1);
      const text = renderer.uiRenderer.floatingTexts[0];
      
      // Check properties (with allowance for random offset)
      expect(text.x).toBeCloseTo(100, -2); // within ~50 units? +/- 20 offset
      expect(Math.abs(text.x - 100)).toBeLessThanOrEqual(20);
      expect(Math.abs(text.y - 200)).toBeLessThanOrEqual(20);
      
      expect(text.text).toBe('50');
      expect(text.color).toBe('#ff0000');
    });

    test('render should update and draw floating texts', () => {
      // Mock update and draw on a floating text object
      const mockText = {
        update: jest.fn(),
        draw: jest.fn(),
        isExpired: jest.fn(() => false),
      };
      
      // Inject directly into renderer's list
      renderer.uiRenderer.floatingTexts = [mockText];
      
      const gameState = {
        conflictZone: { centerX: 600, centerY: 400, radius: 300 },
        loot: []
      };

      renderer.render(gameState, null, null, null, 0.016);
      
      expect(mockText.update).toHaveBeenCalledWith(0.016);
      expect(mockText.draw).toHaveBeenCalledWith(ctx);
    });

    test('render should remove expired floating texts', () => {
       // Mock active and expired text objects
       const activeText = {
        update: jest.fn(),
        draw: jest.fn(),
        isExpired: jest.fn(() => false),
      };
      const expiredText = {
        update: jest.fn(),
        draw: jest.fn(),
        isExpired: jest.fn(() => true),
      };
      
      renderer.uiRenderer.floatingTexts = [activeText, expiredText];
      
      const gameState = {
        conflictZone: { centerX: 600, centerY: 400, radius: 300 },
        loot: []
      };

      renderer.render(gameState, null, null, null, 0.016);
      
      expect(renderer.uiRenderer.floatingTexts).toHaveLength(1);
      expect(renderer.uiRenderer.floatingTexts).toContain(activeText);
      expect(renderer.uiRenderer.floatingTexts).not.toContain(expiredText);
    });
  });

  describe('Loot Rendering', () => {
    test('renderLoot should draw circles and labels for each loot item', () => {
      const lootItems = [
        { id: '1', item_id: 'spear', x: 100, y: 100 },
        { id: '2', item_id: 'bo', x: 200, y: 200 }
      ];

      renderer.lootRenderer.render(ctx, lootItems);

      expect(ctx.arc).toHaveBeenCalledTimes(2);
      expect(ctx.fillText).toHaveBeenCalledTimes(2);
      expect(ctx.fillText).toHaveBeenCalledWith('SPEAR', 100, 75);
      expect(ctx.fillText).toHaveBeenCalledWith('BO', 200, 175);
    });

    test('findNearestLoot should return closest item and distance', () => {
      const player = { x: 50, y: 50 };
      const lootItems = [
        { id: '1', x: 100, y: 100 }, // distance ~70.7
        { id: '2', x: 60, y: 60 }    // distance ~14.1
      ];

      const result = renderer.uiRenderer.findNearestLoot(player, lootItems);

      expect(result.item.id).toBe('2');
      expect(result.distance).toBeLessThan(15);
    });

    test('renderInteractionPrompt should show pickup text when unarmed', () => {
      const player = { x: 100, y: 100, equipped_weapon: 'fist' };
      const item = { item_id: 'spear' };
      
      ctx.measureText.mockReturnValue({ width: 100 });

      renderer.uiRenderer.renderInteractionPrompt(ctx, player, item);

      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining('Picking up spear'),
        100,
        expect.any(Number)
      );
    });

    test('renderInteractionPrompt should show swap text when armed', () => {
      const player = { x: 100, y: 100, equipped_weapon: 'bo' };
      const item = { item_id: 'spear' };
      
      ctx.measureText.mockReturnValue({ width: 100 });

      renderer.uiRenderer.renderInteractionPrompt(ctx, player, item);

      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining('swap bo for spear'),
        100,
        expect.any(Number)
      );
    });
  });
});
