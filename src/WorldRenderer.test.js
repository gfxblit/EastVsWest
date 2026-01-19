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
        onload: null,
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
      canvas: { width: 800, height: 600 },
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
        set: (val) => { fillStyles.push(val); },
        get: () => '',
        configurable: true,
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
      // Mock config with 0 dimensions (should auto-update in local map)
      const originalWidth = rockType.renderWidth;
      rockType.renderWidth = 0; 
      rockType.renderHeight = 0;

      // Mock createImage
      mockAssetManager.createImage.mockImplementation((src) => {
        if (src === 'assets/props/rock.png') {
          return { src, complete: true, naturalWidth: 123, naturalHeight: 456, onload: null };
        }
        return { src, complete: true, naturalWidth: 100, onload: null };
      });

      // Act
      worldRenderer.init(mockCtx);

      // Assert
      const dimensions = worldRenderer.propDimensions.get('ROCK');
      expect(dimensions).toBeDefined();
      // Local dimensions should be updated
      expect(dimensions.renderWidth).toBe(123);
      expect(dimensions.renderHeight).toBe(456);
        
      // Global CONFIG should NOT be mutated (it stays 0 as set in this test)
      expect(rockType.renderWidth).toBe(0);

      // Restore
      rockType.renderWidth = originalWidth;
    });

    test('ShouldPreserveConfiguredRenderDimensions', () => {
      // Arrange
      const rockType = CONFIG.PROPS.TYPES.ROCK;
      const originalWidth = rockType.renderWidth;
      // Set explicit dimensions
      rockType.renderWidth = 50; 
      rockType.renderHeight = 50;

      mockAssetManager.createImage.mockImplementation((src) => {
        if (src === 'assets/props/rock.png') {
          return { src, complete: true, naturalWidth: 123, naturalHeight: 456, onload: null };
        }
        return { src, complete: true, naturalWidth: 100, onload: null };
      });

      // Act
      worldRenderer.init(mockCtx);

      // Assert
      const dimensions = worldRenderer.propDimensions.get('ROCK');
      // Should keep explicit dimensions
      expect(dimensions.renderWidth).toBe(50);
      expect(dimensions.renderHeight).toBe(50);
        
      // Restore
      rockType.renderWidth = originalWidth;
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
