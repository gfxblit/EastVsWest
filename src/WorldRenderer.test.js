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
      fillStyle: '',
      fillRect: jest.fn(),
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
      // We expect fillRect to be called for each prop in CONFIG.PROPS.MAP
      // plus the background calls (which we are not focusing on here, but renderProps should add more calls)
      
      const props = CONFIG.PROPS.MAP;
      
      props.forEach(prop => {
        const propType = CONFIG.PROPS.TYPES[prop.type.toUpperCase()];
        
        // Verify a fillRect call matches this prop's dimensions and position
        // We use Math.floor or similar if needed, but here we expect exact matches
        // Note: fillRect might be called for background too, so we look for matching calls
        expect(mockCtx.fillRect).toHaveBeenCalledWith(
          prop.x - propType.width / 2, // Centered X
          prop.y - propType.height / 2, // Centered Y
          propType.width,
          propType.height
        );
      });
    });

    test('ShouldSetCorrectColorForProps', () => {
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
        // Check if colors for TREE and ROCK are used
        expect(fillStyles).toContain(CONFIG.PROPS.TYPES.TREE.color);
        expect(fillStyles).toContain(CONFIG.PROPS.TYPES.ROCK.color);
    });
  });
});
