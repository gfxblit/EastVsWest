
import puppeteer from 'puppeteer';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';

describe('Game Loading', () => {
    let browser;
    let page;
    let viteUrl;

    beforeAll(async () => {
        viteUrl = await startViteServer();
        const config = getPuppeteerConfig();
        browser = await puppeteer.launch(config.launch);
    });

    afterAll(async () => {
        if (browser) await browser.close();
        await stopViteServer();
    });

    test('should show loading screen on startup', async () => {
        page = await browser.newPage();
        await page.goto(viteUrl);

        // Check if loading screen exists and is visible
        // We expect an element with id="loading-screen"
        // This will fail initially as it doesn't exist
        try {
            await page.waitForSelector('#loading-screen', { timeout: 2000 });
        } catch (e) {
            throw new Error('Loading screen not found');
        }
        
        // Wait for it to disappear (class 'active' removed)
        try {
            await page.waitForSelector('#loading-screen:not(.active)', { timeout: 10000 });
        } catch (e) {
            throw new Error('Loading screen did not disappear');
        }
    });
});
