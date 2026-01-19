/**
 * Integration Test for Spectator UI Cleanup
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

describe('Spectator UI Cleanup Integration', () => {
  let browser;
  let page;
  let baseUrl;

  beforeAll(async () => {
    baseUrl = await startViteServer();
    browser = await puppeteer.launch(getPuppeteerConfig());
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    await stopViteServer();
  });

  test('WhenPlayerLeavesMatch_SpectatorUIShouldBeHidden', async () => {
    await page.goto(baseUrl);

    // Mock death state and spectator UI
    await page.evaluate(() => {
      // Setup minimal mock state
      window.app.ui.showSpectatorControls(true, 'Test Player');
      window.app.ui.showScreen('game');
    });

    // Verify spectator UI is visible initially in our test setup
    const isVisibleBefore = await page.evaluate(() => {
      const el = document.getElementById('spectator-controls');
      return el && !el.classList.contains('hidden');
    });
    expect(isVisibleBefore).toBe(true);

    // Act: Click leave match
    await page.click('#leave-spectate-btn');

    // Assert: Check if intro screen is active AND spectator UI is hidden
    const results = await page.evaluate(() => {
      const introActive = document.getElementById('intro-screen').classList.contains('active');
      const spectatorHidden = document.getElementById('spectator-controls').classList.contains('hidden');
      return { introActive, spectatorHidden };
    });

    expect(results.introActive).toBe(true);
    expect(results.spectatorHidden).toBe(true);
  });

  test('WhenMatchEnds_SpectatorUIShouldBeHidden', async () => {
    await page.goto(baseUrl);

    // Wait for app to be ready
    await page.waitForSelector('body.loaded');

    // Setup mock state: Spectating a player
    await page.evaluate(() => {
      window.app.ui.showScreen('game');
      window.app.ui.showSpectatorControls(true, 'Test Winner');
      window.app.running = true; // Simulate game loop running
    });

    // Verify spectator UI is visible
    const isVisibleBefore = await page.evaluate(() => {
      const el = document.getElementById('spectator-controls');
      return el && !el.classList.contains('hidden');
    });
    expect(isVisibleBefore).toBe(true);

    // Act: Trigger game_over event via network
    await page.evaluate(() => {
      const payload = {
        data: {
          winner_id: 'some_winner_id',
          stats: [
            { player_id: 'some_winner_id', name: 'Test Winner', kills: 5 },
            { player_id: 'loser_id', name: 'Loser', kills: 0 },
          ],
        },
      };
      window.app.network.emit('game_over', payload);
    });

    // Allow some time for UI updates
    await new Promise(r => setTimeout(r, 100));

    // Assert: Spectator UI should be hidden
    const isVisibleAfter = await page.evaluate(() => {
      const el = document.getElementById('spectator-controls');
      return el && !el.classList.contains('hidden');
    });

    // Also check if Lobby is shown
    const isLobbyActive = await page.evaluate(() => {
      return document.getElementById('lobby-screen').classList.contains('active');
    });

    expect(isLobbyActive).toBe(true);
    expect(isVisibleAfter).toBe(false);
  });
});
