/**
 * End-to-End Tests for Conflict Zone: East vs West
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

describe('Conflict Zone: East vs West E2E', () => {
  let browser;
  let page;
  let viteUrl;

  beforeAll(async () => {
    viteUrl = await startViteServer();
    browser = await puppeteer.launch(getPuppeteerConfig());
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    await stopViteServer();
  });

  test('should load the game page correctly', async () => {
    await page.goto(viteUrl);

    const title = await page.title();
    expect(title).toBe('Conflict Zone: East vs West');
  });

  test('should display intro screen on load', async () => {
    await page.goto(viteUrl);

    // Wait for AssetManager to finish loading and transition to intro-screen
    await page.waitForSelector('#intro-screen.active', { timeout: 10000 });

    const introVisible = await page.$eval('#intro-screen', (el) =>
      el.classList.contains('active')
    );
    expect(introVisible).toBe(true);
  });

  test('should have host game button', async () => {
    await page.goto(viteUrl);
    await page.waitForSelector('#intro-screen.active');

    const hostBtn = await page.$('#host-game-btn');
    expect(hostBtn).not.toBeNull();

    const buttonText = await page.$eval('#host-game-btn', (el) => el.textContent);
    expect(buttonText).toBe('Host Game');
  });

  test('should have join game controls', async () => {
    await page.goto(viteUrl);
    await page.waitForSelector('#intro-screen.active');

    const joinInput = await page.$('#join-code-input');
    const joinBtn = await page.$('#join-game-btn');

    expect(joinInput).not.toBeNull();
    expect(joinBtn).not.toBeNull();
  });

  test('should have game canvas element', async () => {
    await page.goto(viteUrl);
    await page.waitForSelector('#intro-screen.active');

    const canvas = await page.$('#game-canvas');
    expect(canvas).not.toBeNull();
  });
});
