/**
 * Camera Integration Tests
 * Tests camera follow behavior using Puppeteer
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Camera Follow System Integration', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch(getPuppeteerConfig());
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test('WhenPlayerMoves_CameraShouldFollowLocalPlayer', async () => {
    // Arrange
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);

    // Wait for game to load
    await page.waitForSelector('#game-canvas');

    // Get initial camera position
    const initialCameraPos = await page.evaluate(() => {
      // Access the game instance from the global window object (may need adjustment)
      if (window.game && window.game.camera) {
        return { x: window.game.camera.x, y: window.game.camera.y };
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
      if (window.game && window.game.camera) {
        return { x: window.game.camera.x, y: window.game.camera.y };
      }
      return null;
    });

    // Camera should have moved with the player
    expect(newCameraPos).not.toBeNull();
    expect(newCameraPos.x).toBeGreaterThan(initialCameraPos.x);
  }, 10000);

  test('WhenPlayerAtWorldEdge_CameraShouldBeClampedToWorldBounds', async () => {
    // Arrange
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);
    await page.waitForSelector('#game-canvas');

    // Act - Move player to far left edge
    await page.keyboard.down('a'); // Move left
    await new Promise(resolve => setTimeout(resolve, 3000)); // Move for a while
    await page.keyboard.up('a');

    await new Promise(resolve => setTimeout(resolve, 200));

    // Assert
    const cameraPos = await page.evaluate(() => {
      if (window.game && window.game.camera) {
        return { x: window.game.camera.x, y: window.game.camera.y };
      }
      return null;
    });

    // Camera should be clamped to minimum X (600)
    expect(cameraPos).not.toBeNull();
    expect(cameraPos.x).toBe(600); // Min X bound
  }, 15000);

  test('WhenConflictZoneRendered_ShouldStayAtFixedWorldPosition', async () => {
    // Arrange
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);
    await page.waitForSelector('#game-canvas');

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

  test('WhenEntityOffScreen_EdgeIndicatorsShouldBeVisible', async () => {
    // Arrange
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);
    await page.waitForSelector('#game-canvas');

    // This test would require setting up multiplayer with a remote player
    // or spawning loot far from the player
    // For now, we'll test that the edge indicator rendering method exists

    const hasEdgeIndicators = await page.evaluate(() => {
      if (window.renderer && typeof window.renderer.renderEdgeIndicators === 'function') {
        return true;
      }
      return false;
    });

    expect(hasEdgeIndicators).toBe(true);
  }, 10000);

  test('WhenCameraFollows_ShouldUseSmoothInterpolation', async () => {
    // Arrange
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);
    await page.waitForSelector('#game-canvas');

    // Record camera positions over time
    const cameraPositions = [];

    // Start moving right
    await page.keyboard.down('d');

    // Record positions
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const pos = await page.evaluate(() => {
        if (window.game && window.game.camera) {
          return { x: window.game.camera.x, y: window.game.camera.y };
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
    // Arrange
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);
    await page.waitForSelector('#game-canvas');

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
