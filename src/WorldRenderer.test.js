import { jest } from '@jest/globals';
import { WorldRenderer } from './WorldRenderer.js';
import { AssetManager } from './AssetManager.js';
import { CONFIG } from './config.js';

describe('WorldRenderer', () => {
  let worldRenderer;
  let mockCtx;
  let mockAssetManager;

  beforeEach(() => {
    // Mock AssetManager
    mockAssetManager = {
      createImage: jest.fn(() => ({
        naturalWidth: 100,
        complete: true,
        onload: null
      })),
    };

    // Mock Canvas Context
    mockCtx = {
      createPattern: jest.fn(),
      drawImage: jest.fn(),
      fillStyle: '',
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      stroke: jest.fn(),
      strokeStyle: '',
      lineWidth: 0,
      canvas: { width: 800, height: 600 }
    };

    worldRenderer = new WorldRenderer(mockAssetManager);
    worldRenderer.init(mockCtx);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('renderProps', () => {
    test('ShouldRenderAllPropsDefinedInConfig', () => {
      // Act
      worldRenderer.renderProps(mockCtx);

      // Assert
      const props = CONFIG.PROPS.MAP;
      
      props.forEach(prop => {
        const typeKey = prop.type.toUpperCase();
        const propType = CONFIG.PROPS.TYPES[typeKey];
        const img = worldRenderer.propImages[typeKey];

        const x = prop.x - propType.width / 2;
        const y = prop.y - propType.height / 2;
        
        if (img && img.complete) {
            expect(mockCtx.drawImage).toHaveBeenCalledWith(img, x, y, propType.width, propType.height);
        } else {
            expect(mockCtx.fillRect).toHaveBeenCalledWith(x, y, propType.width, propType.height);
        }
      });
    });

    test('ShouldSetCorrectColorForPropsWithNoImage', () => {
        // Track fillStyle changes
        const fillStyles = [];
        Object.defineProperty(mockCtx, 'fillStyle', {
            set: (val) => fillStyles.push(val),
            get: () => '',
            configurable: true
        });

        // Act
        worldRenderer.renderProps(mockCtx);

        // Assert
        // TREE has no image, should use color
        expect(fillStyles).toContain(CONFIG.PROPS.TYPES.TREE.color);
    });

    test('WhenDebugModeIsEnabled_ShouldDrawOutlines', () => {
      // Act
      worldRenderer.renderProps(mockCtx, true); // debugMode = true

      // Assert
      // Should call strokeRect for each prop
      expect(mockCtx.strokeRect).toHaveBeenCalledTimes(CONFIG.PROPS.MAP.length);
      expect(mockCtx.strokeStyle).toBe('red');
    });

    test('ShouldLoadPropImagesAndResizeConfig', () => {
        // Arrange
        const rockType = CONFIG.PROPS.TYPES.ROCK;
        // Reset dimensions to verify update
        rockType.width = 10; 
        rockType.height = 10;

        // Mock createImage to return an image with specific dimensions for the rock source
        mockAssetManager.createImage.mockImplementation((src) => {
            if (src === 'assets/props/rock.png') {
                return {
                    src,
                    complete: true,
                    naturalWidth: 123,
                    naturalHeight: 456,
                    onload: null
                };
            }
            return { src, complete: true, naturalWidth: 100, onload: null };
        });

        // Act
        worldRenderer.init(mockCtx);

        // Assert
        expect(worldRenderer.propImages['ROCK']).toBeDefined();
        // Config should be updated to natural dimensions
        expect(rockType.width).toBe(123);
        expect(rockType.height).toBe(456);
    });

    test('ShouldRenderPropImageWhenAvailable', () => {
        // Arrange
        mockCtx.drawImage = jest.fn();
        
        // Ensure ROCK has an image
        const rockImg = { complete: true, naturalWidth: 100, naturalHeight: 100 };
        worldRenderer.propImages = { 'ROCK': rockImg };
        
        // Act
        worldRenderer.renderProps(mockCtx);

        // Assert
        // Should call drawImage at least once (for rocks in the map)
        expect(mockCtx.drawImage).toHaveBeenCalled();
        const calls = mockCtx.drawImage.mock.calls;
        expect(calls[0][0]).toBe(rockImg);
    });
  });
});
