/**
 * End-to-End Tests for Conflict Zone: East vs West
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Conflict Zone: East vs West E2E', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch(getPuppeteerConfig());
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('should load the game page correctly', async () => {
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);

    const title = await page.title();
    expect(title).toBe('Conflict Zone: East vs West');
  });

  test('should display intro screen on load', async () => {
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);

    const introVisible = await page.$eval('#intro-screen', (el) =>
      el.classList.contains('active')
    );
    expect(introVisible).toBe(true);
  });

  test('should have host game button', async () => {
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);

    const hostBtn = await page.$('#host-game-btn');
    expect(hostBtn).not.toBeNull();

    const buttonText = await page.$eval('#host-game-btn', (el) => el.textContent);
    expect(buttonText).toBe('Host Game');
  });

  test('should have join game controls', async () => {
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);

    const joinInput = await page.$('#join-code-input');
    const joinBtn = await page.$('#join-game-btn');

    expect(joinInput).not.toBeNull();
    expect(joinBtn).not.toBeNull();
  });

  test('should have game canvas element', async () => {
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto('file://' + indexPath);

    const canvas = await page.$('#game-canvas');
    expect(canvas).not.toBeNull();
  });
});
