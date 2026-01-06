import { jest } from '@jest/globals';
/**
 * Renderer Tests
 * Unit tests for the Renderer class with camera support and background rendering
 */

import { Renderer } from './renderer.js';
import { CONFIG } from './config.js';
import { updateAnimationState, getDirectionFromRotation } from './animationHelper.js';

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
      // Clear Image mock to count only this test's calls
      global.Image.mockClear();

      const newRenderer = new Renderer(canvas);
      newRenderer.init();

      expect(canvas.getContext).toHaveBeenCalledWith('2d');
      expect(canvas.width).toBe(CONFIG.CANVAS.WIDTH);
      expect(canvas.height).toBe(CONFIG.CANVAS.HEIGHT);
      // Should load background image + shadow image (sprite sheet loaded via fetch)
      expect(global.Image).toHaveBeenCalledTimes(2);
      expect(newRenderer.bgImage.src).toBe('/game-background.png');
      expect(newRenderer.shadowImage.src).toBe('/shadow.png');
    });

    test('WhenImageLoads_ShouldCreatePattern', () => {
      const newRenderer = new Renderer(canvas);
      newRenderer.init();

      // Simulate background image load
      newRenderer.bgImage.onload();

      expect(ctx.createPattern).toHaveBeenCalledWith(newRenderer.bgImage, 'repeat');
      expect(newRenderer.bgPattern).toBe('mock-pattern');
    });
    test('WhenBaseUrlIsPresent_ShouldPrefixImagePaths', () => {
      // Temporarily change base URL in config
      const originalBase = CONFIG.ASSETS.BASE_URL;
      CONFIG.ASSETS.BASE_URL = '/custom-base/';
      
      const newRenderer = new Renderer(canvas);
      newRenderer.init();
      
      // Expect paths to be prefixed with custom base
      expect(newRenderer.bgImage.src).toContain('/custom-base/game-background.png');
      
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
      if (renderer.bgImage && renderer.bgImage.onload) {
        renderer.bgImage.onload();
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
      renderer.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.spriteSheetMetadata = {
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
      renderer.renderPlayer(player, false);

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
      renderer.shadowImage = {
        complete: true,
        naturalWidth: 100,
        width: 96,
        height: 96,
        src: '/shadow.png',
      };

      // Mock directional images as loaded
      renderer.directionalImages = [];
      for (let i = 0; i < 8; i++) {
        renderer.directionalImages[i] = {
          complete: true,
          naturalWidth: 100,
          width: 96,
          height: 96,
          src: `/white-male-${i}.png`,
        };
      }
    });

    test('WhenInitialized_ShouldLoadShadowImage', () => {
      // Arrange - Create new renderer to test initialization
      const newRenderer = new Renderer(canvas);

      // Clear existing Image mock calls
      global.Image.mockClear();

      // Act
      newRenderer.init();

      // Assert
      // Should create shadow image + background image (sprite sheet loaded via fetch)
      expect(global.Image).toHaveBeenCalledTimes(2);
      expect(newRenderer.shadowImage).toBeDefined();
      expect(newRenderer.shadowImage.src).toBe('/shadow.png');
    });

    test('WhenRenderingPlayer_ShouldRenderShadowBeforePlayerSprite', () => {
      // Arrange
      // Mock sprite sheet as loaded
      renderer.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.spriteSheetMetadata = {
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
      renderer.renderPlayer(player, false);

      // Assert
      // Should call drawImage twice: once for shadow, once for player sprite sheet
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);

      // First call should be shadow (rendered before player)
      expect(drawImageCalls[0][0]).toBe(renderer.shadowImage);

      // Second call should be player sprite sheet
      expect(drawImageCalls[1][0]).toBe(renderer.spriteSheet);
    });

    test('WhenRenderingPlayer_ShouldPositionShadowAtPlayerLocation', () => {
      // Arrange
      // Mock sprite sheet as loaded
      renderer.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.spriteSheetMetadata = {
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
      renderer.renderPlayer(player, false);

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
      renderer.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.spriteSheetMetadata = {
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
        renderer.renderPlayer(player, false);

        // Assert
        // Shadow should always use the same image regardless of rotation
        const shadowCall = drawImageCalls[0];
        expect(shadowCall[0]).toBe(renderer.shadowImage);
      }
    });

    test('WhenRenderingLocalPlayer_ShouldRenderShadow', () => {
      // Arrange
      // Mock sprite sheet as loaded
      renderer.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.spriteSheetMetadata = {
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
      renderer.renderPlayer(player, true); // isLocal = true

      // Assert
      // Should render shadow even for local player
      expect(drawImageCalls[0][0]).toBe(renderer.shadowImage);
    });

    test('WhenShadowImageNotLoaded_ShouldSkipShadowRendering', () => {
      // Arrange
      renderer.shadowImage = null;

      // Mock sprite sheet as loaded
      renderer.spriteSheet = {
        complete: true,
        naturalWidth: 576,
        naturalHeight: 768,
      };
      renderer.spriteSheetMetadata = {
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
      renderer.renderPlayer(player, false);

      // Assert
      // Should only render player sprite sheet, not shadow
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      expect(drawImageCalls[0][0]).toBe(renderer.spriteSheet);
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

      test('WhenRotationIsSouthEast_ShouldSelectFrame1', () => {
        const frame = getDirectionFromRotation(3 * Math.PI / 4); // 135 degrees
        expect(frame).toBe(1);
      });

      test('WhenRotationIsEast_ShouldSelectFrame2', () => {
        const frame = getDirectionFromRotation(Math.PI / 2); // 90 degrees
        expect(frame).toBe(2);
      });

      test('WhenRotationIsNorthEast_ShouldSelectFrame3', () => {
        const frame = getDirectionFromRotation(Math.PI / 4); // 45 degrees
        expect(frame).toBe(3);
      });

      test('WhenRotationIsNorth_ShouldSelectFrame4', () => {
        const frame = getDirectionFromRotation(0); // 0 degrees
        expect(frame).toBe(4);
      });

      test('WhenRotationIsNorthWest_ShouldSelectFrame5', () => {
        const frame = getDirectionFromRotation(7 * Math.PI / 4); // 315 degrees
        expect(frame).toBe(5);
      });

      test('WhenRotationIsWest_ShouldSelectFrame6', () => {
        const frame = getDirectionFromRotation(3 * Math.PI / 2); // 270 degrees
        expect(frame).toBe(6);
      });

      test('WhenRotationIsSouthWest_ShouldSelectFrame7', () => {
        const frame = getDirectionFromRotation(5 * Math.PI / 4); // 225 degrees
        expect(frame).toBe(7);
      });

      test('WhenRotationIsBetweenDirections_ShouldSelectNearestFrame', () => {
        // Test rotation slightly past north (5 degrees)
        const frame = getDirectionFromRotation(5 * Math.PI / 180);
        expect(frame).toBe(4); // Should round to North

        // Test rotation between North and NE (20 degrees)
        const frame2 = getDirectionFromRotation(20 * Math.PI / 180);
        expect(frame2).toBe(4); // Should round to North (closer than NE at 45)

        // Test rotation between North and NE (30 degrees)
        const frame3 = getDirectionFromRotation(30 * Math.PI / 180);
        expect(frame3).toBe(3); // Should round to NE (closer than North)
      });
    });

    describe('Image Loading', () => {
      test('WhenInitialized_ShouldLoadAllDirectionalImages', () => {
        // Create new renderer to test initialization
        const newRenderer = new Renderer(canvas);

        // Clear existing Image mock calls
        global.Image.mockClear();

        newRenderer.init();

        // Should create background image + shadow image (sprite sheet loaded via fetch)
        expect(global.Image).toHaveBeenCalledTimes(2);
      });

    });

    describe('Player Rendering with Sprite Sheets', () => {

      test('WhenRenderingPlayerFacingSouth_ShouldDrawFrame0', () => {
        // Mock sprite sheet as loaded
        renderer.spriteSheet = {
          complete: true,
          naturalWidth: 576,
          naturalHeight: 768,
        };
        renderer.spriteSheetMetadata = {
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
          rotation: Math.PI, // South
          animationState: {
            currentFrame: 0,
            lastDirection: 0, // South
            timeAccumulator: 0,
          },
        };

        renderer.renderPlayer(player, false);

        // Should draw from sprite sheet (using renderPlayerWithSpriteSheet)
        expect(ctx.drawImage).toHaveBeenCalled();
      });

      test('WhenRenderingPlayerFacingEast_ShouldDrawFrame2', () => {
        // Mock sprite sheet as loaded
        renderer.spriteSheet = {
          complete: true,
          naturalWidth: 576,
          naturalHeight: 768,
        };
        renderer.spriteSheetMetadata = {
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
          rotation: Math.PI / 2, // East
          animationState: {
            currentFrame: 0,
            lastDirection: 2, // East
            timeAccumulator: 0,
          },
        };

        renderer.renderPlayer(player, false);

        // Should draw from sprite sheet (using renderPlayerWithSpriteSheet)
        expect(ctx.drawImage).toHaveBeenCalled();
      });

      test('WhenRenderingPlayer_ShouldCenterImageOnPlayerPosition', () => {
        // Mock sprite sheet as loaded
        renderer.spriteSheet = {
          complete: true,
          naturalWidth: 576,
          naturalHeight: 768,
        };
        renderer.spriteSheetMetadata = {
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
          rotation: 0, // North
          animationState: {
            currentFrame: 0,
            lastDirection: 4, // North
            timeAccumulator: 0,
          },
        };

        renderer.renderPlayer(player, false);

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
        renderer.spriteSheet = {
          complete: true,
          naturalWidth: 576,
          naturalHeight: 768,
        };
        renderer.spriteSheetMetadata = {
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

        renderer.renderPlayer(player, true); // isLocal = true

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
        // Mock fetch for metadata - it will be called twice
        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              frameWidth: 96,
              frameHeight: 96,
              columns: 6,
              rows: 8,
              directions: ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
            })
          })
        );

        const newRenderer = new Renderer(canvas);

        // Start loading sprite sheets
        const loadPromise = newRenderer.loadSpriteSheets();

        // Simulate image load completion for both images after event loop tick
        setTimeout(() => {
          if (newRenderer.spriteSheet && newRenderer.spriteSheet.onload) {
            newRenderer.spriteSheet.onload();
          }
        }, 0);

        setTimeout(() => {
          if (newRenderer.attackSpriteSheet && newRenderer.attackSpriteSheet.onload) {
            newRenderer.attackSpriteSheet.onload();
          }
        }, 10);

        await loadPromise;

        expect(newRenderer.spriteSheet).toBeDefined();
        expect(newRenderer.spriteSheetMetadata).toBeDefined();
        expect(newRenderer.attackSpriteSheet).toBeDefined();
        expect(newRenderer.attackSpriteSheetMetadata).toBeDefined();
      });

      test('WhenMetadataLoadFails_ShouldHandleGracefully', async () => {
        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: false,
            statusText: 'Not Found'
          })
        );

        const newRenderer = new Renderer(canvas);
        // Should not throw, but handle error internally
        await newRenderer.loadSpriteSheets();
        expect(newRenderer.spriteSheet).toBeNull();
      });
    });


    describe('updateAnimationState', () => {
      test('WhenPlayerIsMoving_ShouldAdvanceFrame', () => {
        const animState = {
          currentFrame: 0,
          timeAccumulator: 0,
          lastDirection: 2 // East
        };

        const deltaTime = 1 / CONFIG.ANIMATION.FPS; // One frame duration
        const isMoving = true;
        const direction = 2; // East

        updateAnimationState(animState, deltaTime, isMoving, direction);

        expect(animState.currentFrame).toBe(1); // Should advance to next frame
        expect(animState.timeAccumulator).toBeLessThan(deltaTime);
        expect(animState.lastDirection).toBe(2); // Should maintain direction
      });

      test('WhenPlayerIsIdle_ShouldNotAdvanceFrame', () => {
        const animState = {
          currentFrame: 3,
          timeAccumulator: 0,
          lastDirection: 2 // East
        };

        const deltaTime = 1 / CONFIG.ANIMATION.FPS; // One frame duration
        const isMoving = false;
        const direction = null; // Idle

        updateAnimationState(animState, deltaTime, isMoving, direction);

        expect(animState.currentFrame).toBe(0); // Should reset to idle frame
        expect(animState.lastDirection).toBe(2); // Should keep last direction
      });

      test('WhenFrameExceedsMax_ShouldLoopBackToZero', () => {
        const animState = {
          currentFrame: 5, // Last frame
          timeAccumulator: 0,
          lastDirection: 4 // North
        };

        const deltaTime = 1 / CONFIG.ANIMATION.FPS; // One frame duration
        const isMoving = true;
        const direction = 4; // North

        updateAnimationState(animState, deltaTime, isMoving, direction);

        expect(animState.currentFrame).toBe(0); // Should loop back to first frame
      });

      test('WhenDirectionChanges_ShouldUpdateLastDirection', () => {
        const animState = {
          currentFrame: 2,
          timeAccumulator: 0,
          lastDirection: 2 // East
        };

        const deltaTime = 0.01; // Small delta
        const isMoving = true;
        const direction = 4; // Changed to North

        updateAnimationState(animState, deltaTime, isMoving, direction);

        expect(animState.lastDirection).toBe(4); // Should update to new direction
      });
    });

    describe('renderPlayerWithSpriteSheet', () => {
      beforeEach(() => {
        // Mock sprite sheet as loaded
        renderer.spriteSheet = {
          complete: true,
          naturalWidth: 576, // 6 columns * 96px
          naturalHeight: 768, // 8 rows * 96px
        };
        renderer.spriteSheetMetadata = {
          frameWidth: 96,
          frameHeight: 96,
          columns: 6,
          rows: 8,
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
            lastDirection: 4, // North (row 4)
          },
        };

        renderer.renderPlayerWithSpriteSheet(player, false);

        // Should draw frame from sprite sheet
        // sourceX = currentFrame * frameWidth = 2 * 96 = 192
        // sourceY = lastDirection * frameHeight = 4 * 96 = 384
        expect(ctx.drawImage).toHaveBeenCalledWith(
          renderer.spriteSheet,
          192, // sourceX
          384, // sourceY
          96,  // sourceWidth
          96,  // sourceHeight
          1500 - CONFIG.RENDER.PLAYER_RADIUS, // destX (centered)
          900 - CONFIG.RENDER.PLAYER_RADIUS,  // destY (centered)
          CONFIG.RENDER.PLAYER_RADIUS * 2,    // destWidth
          CONFIG.RENDER.PLAYER_RADIUS * 2     // destHeight
        );
      });

      test('WhenSpriteSheetNotLoaded_ShouldFallbackToPinkRectangle', () => {
        renderer.spriteSheet = null;

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

        renderer.renderPlayerWithSpriteSheet(player, false);

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
            lastDirection: 2, // East
          },
        };

        renderer.renderPlayerWithSpriteSheet(player, false);

        // Should draw first frame (idle) from East direction row
        // sourceX = 0 * 96 = 0
        // sourceY = 2 * 96 = 192
        expect(ctx.drawImage).toHaveBeenCalledWith(
          renderer.spriteSheet,
          0,   // sourceX (idle frame)
          192, // sourceY (East row)
          96,
          96,
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number)
        );
      });
    });
  });

  describe('Attack Animation Rendering', () => {
    beforeEach(() => {
      // Mock both sprite sheets
      renderer.spriteSheet = {
        complete: true,
        naturalWidth: 128,
        naturalHeight: 256,
      };
      renderer.spriteSheetMetadata = {
        frameWidth: 32,
        frameHeight: 32,
        columns: 4,
        rows: 8,
      };

      renderer.attackSpriteSheet = {
        complete: true,
        naturalWidth: 128,
        naturalHeight: 256,
      };
      renderer.attackSpriteSheetMetadata = {
        frameWidth: 32,
        frameHeight: 32,
        columns: 4,
        rows: 8,
      };

      ctx.drawImage = jest.fn();
    });

    test('WhenPlayerIsAttacking_ShouldUseAttackSpriteSheet', () => {
      const player = {
        id: 'player-1',
        x: 100,
        y: 100,
        health: 100,
        isAttacking: true,
        animationState: {
          currentFrame: 1,
          lastDirection: 2, // East
        },
      };

      renderer.renderPlayerWithSpriteSheet(player, false);

      // Should use attackSpriteSheet
      expect(ctx.drawImage).toHaveBeenCalledWith(
        renderer.attackSpriteSheet,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
    });

    test('WhenAttackingDiagonally_ShouldSnapToCardinalDirection', () => {
      // Test cases for snapping: [inputDirection, expectedSnappedDirection]
      const snapTestCases = [
        [1, 2], // SE -> E (or S, but let's assume E for this test)
        [3, 2], // NE -> E (or N)
        [5, 4], // NW -> N (or W)
        [7, 6], // SW -> W (or S)
      ];

      snapTestCases.forEach(([inputDir, expectedDir]) => {
        ctx.drawImage.mockClear();
        const player = {
          id: 'player-1',
          x: 100,
          y: 100,
          health: 100,
          isAttacking: true,
          animationState: {
            currentFrame: 0,
            lastDirection: inputDir,
          },
        };

        renderer.renderPlayerWithSpriteSheet(player, false);

        // sourceY = snappedDirection * frameHeight
        const expectedSourceY = expectedDir * 32;
        
        expect(ctx.drawImage).toHaveBeenCalledWith(
          expect.anything(),
          expect.any(Number),
          expectedSourceY,
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number)
        );
      });
    });

    test('WhenAttackingCardinally_ShouldNotSnap', () => {
      const cardinalDirections = [0, 2, 4, 6];

      cardinalDirections.forEach(dir => {
        ctx.drawImage.mockClear();
        const player = {
          id: 'player-1',
          x: 100,
          y: 100,
          health: 100,
          isAttacking: true,
          animationState: {
            currentFrame: 0,
            lastDirection: dir,
          },
        };

        renderer.renderPlayerWithSpriteSheet(player, false);

        const expectedSourceY = dir * 32;
        expect(ctx.drawImage).toHaveBeenCalledWith(
          expect.anything(),
          expect.any(Number),
          expectedSourceY,
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number)
        );
      });
    });
  });

  describe('Floating Text', () => {
    test('addFloatingText should add text to floatingTexts array', () => {
      renderer.addFloatingText(100, 200, '50', '#ff0000');
      
      expect(renderer.floatingTexts).toHaveLength(1);
      const text = renderer.floatingTexts[0];
      
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
      renderer.floatingTexts = [mockText];
      
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
      
      renderer.floatingTexts = [activeText, expiredText];
      
      const gameState = {
        conflictZone: { centerX: 600, centerY: 400, radius: 300 },
        loot: []
      };

      renderer.render(gameState, null, null, null, 0.016);
      
      expect(renderer.floatingTexts).toHaveLength(1);
      expect(renderer.floatingTexts).toContain(activeText);
      expect(renderer.floatingTexts).not.toContain(expiredText);
    });
  });
});

