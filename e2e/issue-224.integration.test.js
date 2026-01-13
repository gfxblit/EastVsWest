/**
 * Integration Test for Issue #224: Spectator UI Cleanup on Match End
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

describe('Issue #224: Spectator UI Cleanup on Match End', () => {
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

  test('WhenMatchEnds_SpectatorUIShouldBeHidden', async () => {
    await page.goto(baseUrl);

    // Wait for app to be ready
    await page.waitForSelector('#app');

    // Setup mock state: Spectating a player
    await page.evaluate(() => {
        // Ensure network is initialized (mocking it if necessary, but app.init does it)
        // We just need to make sure we can use app.ui and app.network
        if (!window.app.network) {
            // Mock network if not ready (though it should be if we wait enough, 
            // but for safety in this specific test we can just mock the emit if needed 
            // OR just rely on the UI method directly if we want to test just the UI logic,
            // BUT the bug is likely in the integration of game_over -> UI)
            
            // Actually, we need app.network to have the listener registered.
            // app.init() calls setupNetworkHandlers() which registers 'game_over'.
            // So we need to wait for app.init to finish.
        }
    });

    // We need to wait for the app to be fully loaded including network handlers
    // The app adds 'loaded' class to body when done.
    await page.waitForSelector('body.loaded');

    // Now set up the spectator state
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
        // We simulate the payload structure expected by main.js
        const payload = {
            data: {
                winner_id: 'some_winner_id',
                stats: [
                    { player_id: 'some_winner_id', name: 'Test Winner', kills: 5 },
                    { player_id: 'loser_id', name: 'Loser', kills: 0 }
                ]
            }
        };
        
        // Emit the event which should trigger main.js handler
        window.app.network.emit('game_over', payload);
    });

    // Allow some time for UI updates (though synchronous DOM updates should be fast, 
    // stopGameLoop might take a tick)
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
    expect(isVisibleAfter).toBe(false, 'Spectator UI should be hidden after game over');
  });
});
