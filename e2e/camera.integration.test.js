/**
 * Camera Integration Tests
 * Tests camera follow behavior using Puppeteer
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

describe('Camera Follow System Integration', () => {
  let browser;
  let page;
  let serverUrl;

  beforeAll(async () => {
    // Start Vite dev server
    serverUrl = await startViteServer();
    browser = await puppeteer.launch(getPuppeteerConfig());
  }, 60000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    await stopViteServer();
  });

  beforeEach(async () => {
    if (!browser) {
      throw new Error('Browser not initialized. Check beforeAll failure.');
    }
    page = await browser.newPage();
    
    // Set viewport to match test expectations (1200px width -> 600px half-width)
    await page.setViewport({ width: 1200, height: 800 });

    await page.goto(serverUrl);

    // Wait for app to initialize
    await page.waitForSelector('body.loaded', { timeout: 10000 });

    // Host and start a game to initialize the game environment
    await page.click('#host-game-btn');
    
    // Wait for lobby and start button (host sees start button)
    await page.waitForSelector('#start-game-btn:not(.hidden)', { timeout: 10000 });
    
    // Start the game
    await page.click('#start-game-btn');
    
    // Wait for game canvas to be visible
    await page.waitForSelector('#game-canvas', { timeout: 10000 });
    
    // Give a moment for game initialization to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Ensure focus on canvas for input
    await page.click('#game-canvas');

    // Teleport player to center of map (1200, 800) to ensure camera can move freely
    await page.evaluate(() => {
      if (window.game && window.game.localPlayer) {
        window.game.localPlayer.x = 1200;
        window.game.localPlayer.y = 800;
        // Also reset velocity
        window.game.localPlayer.velocity = { x: 0, y: 0 };
        // Force camera update immediately
        if (window.camera) {
            window.camera.update(1200, 800, 1.0); // Snap to position
        }
      }
    });
    
    // Wait for camera to settle
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  afterEach(async () => {
    if (page) {
      await page.close();
    }
  });

  test('WhenPlayerMoves_CameraShouldFollowLocalPlayer', async () => {
    // Get initial camera position
    const initialCameraPos = await page.evaluate(() => {
      if (window.camera) {
        return { x: window.camera.x, y: window.camera.y };
      }
      return null;
    });

    // Act - Simulate player movement
    await page.keyboard.down('d'); // Move right
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for movement
    await page.keyboard.up('d');

    // Give camera time to update
    await new Promise(resolve => setTimeout(resolve, 200));

    // Assert
    const newCameraPos = await page.evaluate(() => {
      if (window.camera) {
        return { x: window.camera.x, y: window.camera.y };
      }
      return null;
    });

    // Camera should have moved with the player
    expect(newCameraPos).not.toBeNull();
    expect(newCameraPos.x).toBeGreaterThan(initialCameraPos.x);
  }, 10000);

  test('WhenPlayerAtWorldEdge_CameraShouldBeClampedToWorldBounds', async () => {
    // Act - Move player to far left edge
    await page.keyboard.down('a'); // Move left
    await new Promise(resolve => setTimeout(resolve, 4000)); // Move for a while (was 3000)
    await page.keyboard.up('a');

    await new Promise(resolve => setTimeout(resolve, 200));

    // Assert
    const cameraPos = await page.evaluate(() => {
      if (window.camera) {
        return { x: window.camera.x, y: window.camera.y };
      }
      return null;
    });

    // Camera should be clamped to minimum X (600)
    expect(cameraPos).not.toBeNull();
    expect(cameraPos.x).toBe(600); // Min X bound
  }, 15000);

  test('WhenConflictZoneRendered_ShouldStayAtFixedWorldPosition', async () => {
    // Get conflict zone position (should be at world center 1200, 800)
    const conflictZonePos = await page.evaluate(() => {
      if (window.game && window.game.getState) {
        const state = window.game.getState();
        return {
          centerX: state.conflictZone.centerX,
          centerY: state.conflictZone.centerY,
        };
      }
      return null;
    });

    // Assert
    expect(conflictZonePos).not.toBeNull();
    expect(conflictZonePos.centerX).toBe(1200); // World center X
    expect(conflictZonePos.centerY).toBe(800); // World center Y
  }, 10000);

  test('WhenCameraFollows_ShouldUseSmoothInterpolation', async () => {
    // Record camera positions over time
    const cameraPositions = [];

    // Start moving right
    await page.keyboard.down('d');

    // Record positions
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const pos = await page.evaluate(() => {
        if (window.camera) {
          return { x: window.camera.x, y: window.camera.y };
        }
        return null;
      });
      cameraPositions.push(pos);
    }

    await page.keyboard.up('d');

    // Assert - camera should move smoothly (each position should increase gradually)
    expect(cameraPositions.length).toBe(5);
    for (let i = 1; i < cameraPositions.length; i++) {
      // Each X position should be greater than the previous (moving right)
      expect(cameraPositions[i].x).toBeGreaterThan(cameraPositions[i - 1].x);

      // The change should be gradual, not instant (less than 100px per 100ms)
      const deltaX = cameraPositions[i].x - cameraPositions[i - 1].x;
      expect(deltaX).toBeLessThan(100);
      expect(deltaX).toBeGreaterThan(0);
    }
  }, 10000);

  test('WhenWorldIsLargerThanViewport_PlayerShouldBeAbleToExploreFullWorld', async () => {
    // Test that player can move to different corners of the world
    // Move to top-left
    await page.keyboard.down('w');
    await page.keyboard.down('a');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.keyboard.up('w');
    await page.keyboard.up('a');

    const topLeftPlayer = await page.evaluate(() => {
      if (window.game && window.game.getLocalPlayer) {
        const player = window.game.getLocalPlayer();
        return { x: player.x, y: player.y };
      }
      return null;
    });

    // Move to bottom-right
    await page.keyboard.down('s');
    await page.keyboard.down('d');
    await new Promise(resolve => setTimeout(resolve, 4000));
    await page.keyboard.up('s');
    await page.keyboard.up('d');

    const bottomRightPlayer = await page.evaluate(() => {
      if (window.game && window.game.getLocalPlayer) {
        const player = window.game.getLocalPlayer();
        return { x: player.x, y: player.y };
      }
      return null;
    });

    // Assert - player should have moved significantly
    expect(topLeftPlayer).not.toBeNull();
    expect(bottomRightPlayer).not.toBeNull();
    expect(bottomRightPlayer.x).toBeGreaterThan(topLeftPlayer.x + 200);
    expect(bottomRightPlayer.y).toBeGreaterThan(topLeftPlayer.y + 200);
  }, 15000);
});
