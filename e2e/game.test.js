/**
 * End-to-End Tests for Conflict Zone: East vs West
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';
import { injectMockSupabase } from './helpers/puppeteer-mock-bridge.js';
import { resetMockBackend } from './helpers/mock-supabase.js';

describe('Conflict Zone: East vs West E2E', () => {
  let browser;
  let page;
  let serverUrl;

  beforeAll(async () => {
    resetMockBackend();
    serverUrl = await startViteServer();
    browser = await puppeteer.launch(getPuppeteerConfig());
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    await stopViteServer();
  });

  beforeEach(async () => {
    await injectMockSupabase(page);
  });

  test('should load the game page correctly', async () => {
    await page.goto(serverUrl);

    const title = await page.title();
    expect(title).toBe('Conflict Zone: East vs West');
  });

  test('should display intro screen on load', async () => {
    await page.goto(serverUrl);
    await page.waitForSelector('#intro-screen.active');

    const introVisible = await page.$eval('#intro-screen', (el) =>
      el.classList.contains('active')
    );
    expect(introVisible).toBe(true);
  });

  test('should have host game button', async () => {
    await page.goto(serverUrl);
    await page.waitForSelector('#host-game-btn');

    const hostBtn = await page.$('#host-game-btn');
    expect(hostBtn).not.toBeNull();

    const buttonText = await page.$eval('#host-game-btn', (el) => el.textContent);
    expect(buttonText).toBe('Host Game');
  });

  test('should have join game controls', async () => {
    await page.goto(serverUrl);
    await page.waitForSelector('#join-code-input');
    await page.waitForSelector('#join-game-btn');

    const joinInput = await page.$('#join-code-input');
    const joinBtn = await page.$('#join-game-btn');

    expect(joinInput).not.toBeNull();
    expect(joinBtn).not.toBeNull();
  });

  test('should have game canvas element', async () => {
    await page.goto(serverUrl);
    await page.waitForSelector('#game-canvas');

    const canvas = await page.$('#game-canvas');
    expect(canvas).not.toBeNull();
  });
});
