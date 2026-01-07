/**
 * Integration Test for Spectator UI Cleanup
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';
import { injectMockSupabase } from './helpers/puppeteer-mock-bridge.js';
import { resetMockBackend } from './helpers/mock-supabase.js';

describe('Spectator UI Cleanup Integration', () => {
  let browser;
  let page;
  let baseUrl;

  beforeAll(async () => {
    resetMockBackend();
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
    await injectMockSupabase(page);
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
});
