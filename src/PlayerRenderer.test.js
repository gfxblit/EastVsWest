import { jest } from '@jest/globals';
import { PlayerRenderer } from './PlayerRenderer.js';
import { CONFIG } from './config.js';

describe('PlayerRenderer Death Animation', () => {
  let mockAssetManager;
  let renderer;
  let mockCtx;
  let originalPlayerDeathConfig;
  let originalDeathFps;
  let originalDeathFrameCount;

  beforeAll(() => {
    // Backup config
    originalPlayerDeathConfig = CONFIG.ASSETS.PLAYER_DEATH;
    originalDeathFps = CONFIG.ANIMATION.DEATH_FPS;
    originalDeathFrameCount = CONFIG.ANIMATION.DEATH_FRAME_COUNT;

    // Patch config
    CONFIG.ASSETS.PLAYER_DEATH = {
      PATH: 'death_sheet.png',
    };
    CONFIG.ANIMATION.DEATH_FPS = 10;
    CONFIG.ANIMATION.DEATH_FRAME_COUNT = 4;
  });

  afterAll(() => {
    // Restore config
    CONFIG.ASSETS.PLAYER_DEATH = originalPlayerDeathConfig;
    CONFIG.ANIMATION.DEATH_FPS = originalDeathFps;
    CONFIG.ANIMATION.DEATH_FRAME_COUNT = originalDeathFrameCount;
  });

  beforeEach(() => {
    mockAssetManager = {
      createImage: jest.fn().mockImplementation((src) => ({ 
        complete: true, 
        naturalWidth: 256, 
        naturalHeight: 64,
        src: src,
      })),
      getSpriteSheet: jest.fn(),
      getSpriteSheetMetadata: jest.fn(),
      loadSpriteSheet: jest.fn().mockResolvedValue(true),
    };

    mockCtx = {
      drawImage: jest.fn(),
      fillRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      strokeRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      fillText: jest.fn(),
    };

    renderer = new PlayerRenderer(mockAssetManager);
  });

  test('should render debug AABB when debugMode is true', () => {
    renderer.init();
    const player = {
      id: 'p1',
      x: 100,
      y: 100,
      health: 100,
      rotation: 0,
      animationState: { currentFrame: 0, lastDirection: 0 },
    };

    renderer.render(mockCtx, player, false, true); // debugMode = true

    expect(mockCtx.strokeRect).toHaveBeenCalled();
    expect(mockCtx.beginPath).toHaveBeenCalled();
    expect(mockCtx.arc).toHaveBeenCalled();
  });

  test('should initialize death sprite image directly', () => {
    renderer.init();
    expect(mockAssetManager.createImage).toHaveBeenCalledWith('death_sheet.png');
  });

  test('should render death animation when health is <= 0 using inferred dimensions', () => {
    // Setup renderer with mocked image response handled in beforeEach
    renderer.init();
        
    const player = {
      id: 'p1',
      x: 100,
      y: 100,
      health: 0,
      rotation: 0,
      isAttacking: false,
      animationState: { currentFrame: 0, lastDirection: 0 },
    };

    // We need to capture the image object created in init
    // Since we mocked createImage to return a specific object based on input, 
    // and init calls it with 'death_sheet.png' (from our CONFIG mock),
    // we can assume the renderer stored that result.
    // However, since we can't easily access the private property or the exact return value 
    // without spying strictly, we'll verify the drawImage call which passes the image.

    renderer.render(mockCtx, player, false);

    // Expected frame width calculation:
    // naturalWidth (256) / DEATH_FRAME_COUNT (4) = 64
    const expectedFrameWidth = 64;
    const expectedFrameHeight = 64; // naturalHeight

    // Expect drawImage to be called with the image and calculated source rect
    expect(mockCtx.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ src: 'death_sheet.png' }), // The image object
      0, 0, // source x, y (first frame)
      expectedFrameWidth, expectedFrameHeight, // source w, h
      expect.any(Number), expect.any(Number), // dest x, y
      expect.any(Number), expect.any(Number),  // dest w, h
    );
  });

  test('should render player name', () => {
    renderer.init();
    const player = {
      id: 'p1',
      name: 'TestPlayer',
      x: 100,
      y: 100,
      health: 100,
      rotation: 0,
      isAttacking: false,
      animationState: { currentFrame: 0, lastDirection: 0 },
    };

    // Mock sprite sheet availability
    const mockSpriteSheet = { complete: true, width: 100, src: 'walk.png' };
    mockAssetManager.getSpriteSheet.mockReturnValue(mockSpriteSheet);
    mockAssetManager.getSpriteSheetMetadata.mockReturnValue({ frameWidth: 32, frameHeight: 32, columns: 4 });

    renderer.render(mockCtx, player, false);

    expect(mockCtx.fillText).toHaveBeenCalledWith(
      'TestPlayer',
      player.x,
      expect.any(Number),
    );
  });

  test('should render player name even when dead', () => {
    renderer.init();
    const player = {
      id: 'p1',
      name: 'DeadPlayer',
      x: 100,
      y: 100,
      health: 0,
      rotation: 0,
      isAttacking: false,
      animationState: { currentFrame: 0, lastDirection: 0 },
    };

    renderer.render(mockCtx, player, false);

    expect(mockCtx.fillText).toHaveBeenCalledWith(
      'DeadPlayer',
      player.x,
      expect.any(Number),
    );
  });
});
