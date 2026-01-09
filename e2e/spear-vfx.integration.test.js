import puppeteer from 'puppeteer';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { waitFor } from './helpers/wait-utils.js';

describe('Spear VFX E2E', () => {
  let browser;
  let page;
  let serverUrl;

  beforeAll(async () => {
    serverUrl = await startViteServer();
    browser = await puppeteer.launch(getPuppeteerConfig());
  });

  afterAll(async () => {
    if (browser) await browser.close();
    await stopViteServer();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    // Set viewport to 800x600 for consistent rendering
    await page.setViewport({ width: 800, height: 600 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  test('WhenPlayerAttacksWithSpear_ShouldTriggerAttackAnimation', async () => {
    await page.goto(`${serverUrl}/index.html`);

    // Wait for the app to initialize
    await page.waitForSelector('body.loaded');

    // Host a game
    await page.click('#host-game-btn');
    await page.waitForSelector('#lobby-screen:not(.hidden)');
    
    // Wait for the start game button to be visible and not disabled (host role)
    await page.waitForSelector('#start-game-btn', { visible: true });
    await page.click('#start-game-btn');
    await page.waitForSelector('#game-screen:not(.hidden)');

    // Ensure we are in the game and have a local player
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const check = () => {
          if (window.game && window.game.getLocalPlayer()) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    });

    // Set weapon to spear
    await page.evaluate(() => {
      const player = window.game.getLocalPlayer();
      player.equipped_weapon = 'spear';
    });

    // Trigger attack
    await page.evaluate(() => {
      window.game.handleInput({ attack: true });
    });

    // Check if isAttacking is true (wait for it as it might take a frame)
    await waitFor(async () => {
      return await page.evaluate(() => {
        const p = window.game.getLocalPlayer();
        // Force update if needed
        window.game.update(0.016);
        return p.isAttacking;
      });
    }, 2000);

    const isAttacking = await page.evaluate(() => {
      return window.game.getLocalPlayer().isAttacking;
    });
    expect(isAttacking).toBe(true);

    // Wait for a few frames to ensure rendering happens
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify thrust image is loaded in renderer
    const thrustImagesLoaded = await page.evaluate(() => {
      const renderer = window.renderer;
      return renderer.playerRenderer.thrustImages.right && 
             renderer.playerRenderer.thrustImages.right.complete && 
             renderer.playerRenderer.thrustImages.right.naturalWidth > 0;
    });
    expect(thrustImagesLoaded).toBe(true);
  });
});
