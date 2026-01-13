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

        const x = prop.x - propType.renderWidth / 2;
        const y = prop.y - propType.renderHeight / 2;
        
        if (img && img.complete) {
            expect(mockCtx.drawImage).toHaveBeenCalledWith(img, x, y, propType.renderWidth, propType.renderHeight);
        } else {
            expect(mockCtx.fillRect).toHaveBeenCalledWith(x, y, propType.renderWidth, propType.renderHeight);
        }
      });
    });

    test('ShouldSetCorrectColorForPropsWithNoImage', () => {
        // Arrange: Add a temporary prop type without an image
        CONFIG.PROPS.TYPES.COLOR_ONLY = { renderWidth: 20, renderHeight: 20, color: '#ff00ff' };
        CONFIG.PROPS.MAP.push({ id: 'temp_color', type: 'color_only', x: 10, y: 10 });

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
        expect(fillStyles).toContain('#ff00ff');

        // Cleanup
        delete CONFIG.PROPS.TYPES.COLOR_ONLY;
        CONFIG.PROPS.MAP.pop();
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
        // Reset dimensions to 0 to verify auto-update
        rockType.renderWidth = 0; 
        rockType.renderHeight = 0;

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
        // Config should be updated to natural dimensions because they were 0
        expect(rockType.renderWidth).toBe(123);
        expect(rockType.renderHeight).toBe(456);
    });

    test('ShouldPreserveConfiguredRenderDimensions', () => {
        // Arrange
        const rockType = CONFIG.PROPS.TYPES.ROCK;
        // Set explicit dimensions
        rockType.renderWidth = 50; 
        rockType.renderHeight = 50;

        // Mock createImage
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
        // Config should KEEP explicit dimensions
        expect(rockType.renderWidth).toBe(50);
        expect(rockType.renderHeight).toBe(50);
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
