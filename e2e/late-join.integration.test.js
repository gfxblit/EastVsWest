/**
 * Late Join Integration Test
 * Verifies that players can join a match that has already started.
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

describe('Late Join Integration', () => {
  let browser;
  let serverUrl;

  beforeAll(async () => {
    serverUrl = await startViteServer();
    browser = await puppeteer.launch(getPuppeteerConfig());
  }, 60000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    await stopViteServer();
  });

  test('WhenPlayerJoinsActiveMatch_ShouldEnterGameAsSpectator', async () => {
    // 1. Host creates a session
    const hostPage = await browser.newPage();
    await hostPage.goto(serverUrl);
    await hostPage.waitForSelector('body.loaded', { timeout: 10000 });
    
    await hostPage.click('#host-game-btn');
    await hostPage.waitForSelector('#join-code-display:not(.hidden)', { timeout: 10000 });
    
    // Wait for the join code text to be populated
    await hostPage.waitForFunction(() => {
      const joinCodeEl = document.getElementById('join-code');
      return joinCodeEl && joinCodeEl.textContent && joinCodeEl.textContent.trim().length === 6;
    }, { timeout: 10000 });

    const joinCode = await hostPage.evaluate(() => {
      return document.getElementById('join-code').textContent.trim();
    });
    
    console.log(`Host created session: ${joinCode}`);

    // Wait for the Start Game button to be visible and enabled
    await hostPage.waitForFunction(() => {
      const btn = document.getElementById('start-game-btn');
      return btn && !btn.disabled && window.getComputedStyle(btn).display !== 'none';
    }, { timeout: 10000 });

    // 2. Host starts the game
    await hostPage.click('#start-game-btn');
    await hostPage.waitForSelector('#game-screen.active', { timeout: 15000 });
    console.log('Host started the game');

    // 3. New player attempts to join the active game
    const playerContext = await browser.createBrowserContext();
    const playerPage = await playerContext.newPage();
    await playerPage.goto(serverUrl);
    await playerPage.waitForSelector('body.loaded', { timeout: 10000 });

    await playerPage.type('#join-code-input', joinCode);
    await playerPage.click('#join-game-btn');

    // 4. Verify player enters game screen directly (bypassing lobby)
    // and is in spectator mode (since they joined late)
    try {
      await playerPage.waitForSelector('#game-screen.active', { timeout: 15000 });
      console.log('Late joiner entered game screen');
    } catch (err) {
      const errorMsg = await playerPage.evaluate(() => {
        const errEl = document.getElementById('lobby-error');
        return errEl ? errEl.textContent : 'No error shown';
      });
      console.log(`Late joiner failed to enter game: ${errorMsg}`);
      throw new Error(`Late joiner failed to enter game screen. Page error: ${errorMsg}`);
    }

    // Verify spectator controls are visible for the late joiner
    await playerPage.waitForSelector('#spectator-controls:not(.hidden)', { timeout: 5000 });
    const isSpectating = await playerPage.evaluate(() => {
      const controls = document.getElementById('spectator-controls');
      return !controls.classList.contains('hidden');
    });
    expect(isSpectating).toBe(true);

    const spectatorName = await playerPage.evaluate(() => {
      return document.getElementById('spectating-name').textContent;
    });
    console.log(`Late joiner is spectating: ${spectatorName}`);
    expect(spectatorName).toBeTruthy();

    await playerPage.close();
    await playerContext.close();
    await hostPage.close();
  }, 60000);
});
