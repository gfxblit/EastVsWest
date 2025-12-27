import { jest } from '@jest/globals';
import { Renderer } from './renderer.js';
import { CONFIG } from './config.js';

describe('Renderer', () => {
  let renderer;
  let mockCanvas;
  let mockCtx;
  let mockImage;
  let drawCalls;

  beforeEach(() => {
    drawCalls = [];

    // Mock Canvas and Context
    mockCtx = {
      _fillStyle: null,
      set fillStyle(val) { this._fillStyle = val; },
      get fillStyle() { return this._fillStyle; },
      
      strokeStyle: null,
      lineWidth: 0,
      globalCompositeOperation: 'source-over',
      
      fillRect: jest.fn(function(x, y, w, h) {
        drawCalls.push({ type: 'fillRect', style: this.fillStyle, args: [x, y, w, h] });
      }),
      beginPath: jest.fn(),
      arc: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(function(rule) {
        drawCalls.push({ type: 'fill', style: this.fillStyle, rule });
      }),
      createPattern: jest.fn(() => 'mock-pattern'),
      rect: jest.fn(),
    };

    mockCanvas = {
      getContext: jest.fn(() => mockCtx),
      width: 0,
      height: 0,
    };

    // Mock Image
    mockImage = {
      onload: null,
      src: '',
    };
    global.Image = jest.fn(() => mockImage);

    renderer = new Renderer(mockCanvas);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    test('ShouldInitializeContextAndLoadBackground', () => {
      renderer.init();

      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
      expect(mockCanvas.width).toBe(CONFIG.CANVAS.WIDTH);
      expect(mockCanvas.height).toBe(CONFIG.CANVAS.HEIGHT);
      expect(global.Image).toHaveBeenCalled();
      expect(mockImage.src).toBe('/game-background.png');
    });

    test('WhenImageLoads_ShouldCreatePattern', () => {
      renderer.init();
      
      // Simulate image load
      mockImage.onload();

      expect(mockCtx.createPattern).toHaveBeenCalledWith(mockImage, 'repeat');
      expect(renderer.bgPattern).toBe('mock-pattern');
    });
  });

  describe('render', () => {
    beforeEach(() => {
      renderer.init();
    });

    test('WhenBackgroundLoaded_ShouldDrawPattern', () => {
      // Setup pattern
      mockImage.onload();

      const gameState = {
        conflictZone: { centerX: 100, centerY: 100, radius: 50 },
        loot: []
      };

      renderer.render(gameState);

      // Check first draw call (background)
      const bgCall = drawCalls.find(call => call.type === 'fillRect');
      expect(bgCall).toBeDefined();
      expect(bgCall.style).toBe('mock-pattern');
      expect(bgCall.args).toEqual([0, 0, CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT]);
    });

    test('WhenBackgroundNotLoaded_ShouldDrawBackgroundColor', () => {
      // Pattern not loaded yet

      const gameState = {
        conflictZone: { centerX: 100, centerY: 100, radius: 50 },
        loot: []
      };

      renderer.render(gameState);

      // Check first draw call (background)
      const bgCall = drawCalls.find(call => call.type === 'fillRect');
      expect(bgCall).toBeDefined();
      expect(bgCall.style).toBe(CONFIG.CANVAS.BACKGROUND_COLOR);
      expect(bgCall.args).toEqual([0, 0, CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT]);
    });
  });

  describe('renderConflictZone', () => {
    beforeEach(() => {
      renderer.init();
    });

    test('ShouldUseEvenOddFillRule', () => {
      const zone = { centerX: 500, centerY: 400, radius: 300 };
      
      renderer.renderConflictZone(zone);

      // Check for danger zone drawing (rectangle + hole)
      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.rect).toHaveBeenCalledWith(0, 0, CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT);
      expect(mockCtx.arc).toHaveBeenCalledWith(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2, true);
      
      const fillCall = drawCalls.find(call => call.type === 'fill');
      expect(fillCall).toBeDefined();
      expect(fillCall.rule).toBe('evenodd');
      expect(fillCall.style).toBe('rgba(255, 107, 107, 0.2)');
      
      // Check for border drawing
      expect(mockCtx.stroke).toHaveBeenCalled();
    });
  });
});
