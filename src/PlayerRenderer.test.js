import { jest } from '@jest/globals';
import { PlayerRenderer } from './PlayerRenderer.js';
import { CONFIG } from './config.js';

describe('PlayerRenderer Death Animation', () => {
    let mockAssetManager;
    let renderer;
    let mockCtx;
    let originalPlayerDeathConfig;
    let originalDeathFps;

    beforeAll(() => {
        // Backup config
        originalPlayerDeathConfig = CONFIG.ASSETS.PLAYER_DEATH;
        originalDeathFps = CONFIG.ANIMATION.DEATH_FPS;

        // Patch config
        CONFIG.ASSETS.PLAYER_DEATH = {
            PATH: 'death_sheet.png',
            METADATA: 'death_sheet.json'
        };
        CONFIG.ANIMATION.DEATH_FPS = 10;
    });

    afterAll(() => {
        // Restore config
        CONFIG.ASSETS.PLAYER_DEATH = originalPlayerDeathConfig;
        CONFIG.ANIMATION.DEATH_FPS = originalDeathFps;
    });

    beforeEach(() => {
        mockAssetManager = {
            createImage: jest.fn().mockReturnValue({ complete: true, naturalWidth: 100 }),
            getSpriteSheet: jest.fn(),
            getSpriteSheetMetadata: jest.fn(),
            loadSpriteSheet: jest.fn().mockResolvedValue(true)
        };

        mockCtx = {
            drawImage: jest.fn(),
            fillRect: jest.fn(),
            beginPath: jest.fn(),
            arc: jest.fn(),
            stroke: jest.fn()
        };

        renderer = new PlayerRenderer(mockAssetManager);
    });

    test('should initialize death sprite sheet', () => {
        // We expect init() to trigger loading of the death sprite sheet via loadSpriteSheet
        renderer.init();
        
        expect(mockAssetManager.loadSpriteSheet).toHaveBeenCalledWith(
            'death',
            CONFIG.ASSETS.PLAYER_DEATH.METADATA,
            CONFIG.ASSETS.PLAYER_DEATH.PATH
        );
    });

    test('should render death animation when health is <= 0', () => {
        renderer.init();
        const player = {
            id: 'p1',
            x: 100,
            y: 100,
            health: 0,
            rotation: 0,
            isAttacking: false,
            animationState: { currentFrame: 0, lastDirection: 0 }
        };

        // Mock death sprite sheet availability
        const mockDeathSheet = { complete: true, width: 100, src: 'death_sheet.png' };
        const mockMetadata = { frameWidth: 64, frameHeight: 64, columns: 4 };

        mockAssetManager.getSpriteSheet.mockReturnValue(mockDeathSheet);
        mockAssetManager.getSpriteSheetMetadata.mockReturnValue(mockMetadata);
        
        renderer.render(mockCtx, player, false);

        // Expect drawImage to be called with our mock death sheet
        expect(mockCtx.drawImage).toHaveBeenCalledWith(
            mockDeathSheet,
            expect.any(Number), expect.any(Number), // source x, y
            expect.any(Number), expect.any(Number), // source w, h
            expect.any(Number), expect.any(Number), // dest x, y
            expect.any(Number), expect.any(Number)  // dest w, h
        );
    });
});