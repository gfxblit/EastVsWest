/**
 * End-to-end tests for SnakeClaude game
 * Uses Puppeteer to test the game in a headless browser
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SnakeClaude E2E', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should load the game page correctly', async () => {
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto(`file://${indexPath}`);

    const title = await page.title();
    expect(title).toBe('SnakeClaude');
  });

  test('should display the game canvas', async () => {
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto(`file://${indexPath}`);

    const canvas = await page.$('#game-canvas');
    expect(canvas).not.toBeNull();
  });

  test('should display the score element', async () => {
    const indexPath = join(__dirname, '..', 'index.html');
    await page.goto(`file://${indexPath}`);

    const scoreText = await page.$eval('#score', el => el.textContent);
    expect(scoreText).toBe('Score: 0');
  });
});
