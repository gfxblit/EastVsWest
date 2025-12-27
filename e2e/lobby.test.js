/**
 * End-to-End Tests for Lobby UI
 * Tests lobby screen interactions and validation
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

describe('Lobby UI Interactions', () => {
  let browser;
  let page;
  let serverUrl;

  beforeAll(async () => {
    // Start Vite dev server
    serverUrl = await startViteServer();

    browser = await puppeteer.launch(getPuppeteerConfig());
  }, 60000); // Increase timeout for server startup

  afterAll(async () => {
    await browser.close();
    await stopViteServer();
  });

  beforeEach(async () => {
    page = await browser.newPage();

    // Capture console errors and logs for debugging
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error' || type === 'warning' || type === 'log') {
        console.log(`Browser ${type}:`, msg.text());
      }
    });

    page.on('pageerror', error => {
      console.log('Page script error:', error.message);
    });

    await page.goto(serverUrl);

    // Wait for page to load
    await page.waitForSelector('#lobby-screen');
  });

  afterEach(async () => {
    await page.close();
  });

  describe('Lobby Screen Elements', () => {
    test('WhenPageLoads_ShouldDisplayLobbyTitle', async () => {
      const title = await page.$eval('#intro-screen h1', (el) => el.textContent);
      expect(title).toBe('Conflict Zone: East vs West');
    });

    test('WhenPageLoads_ShouldDisplayHostButton', async () => {
      const hostBtn = await page.$('#host-game-btn');
      expect(hostBtn).not.toBeNull();

      const isVisible = await page.$eval('#host-game-btn', (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      expect(isVisible).toBe(true);
    });

    test('WhenPageLoads_ShouldDisplayJoinButton', async () => {
      const joinBtn = await page.$('#join-game-btn');
      expect(joinBtn).not.toBeNull();

      const isVisible = await page.$eval('#join-game-btn', (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      expect(isVisible).toBe(true);
    });

    test('WhenPageLoads_ShouldDisplayJoinCodeInput', async () => {
      const joinInput = await page.$('#join-code-input');
      expect(joinInput).not.toBeNull();

      const placeholder = await page.$eval('#join-code-input', (el) => el.placeholder);
      expect(placeholder).toBe('Enter Join Code');
    });

    test('WhenPageLoads_ShouldHideJoinCodeDisplay', async () => {
      // It's hidden because #lobby-screen is not active
      const isHidden = await page.$eval('#lobby-screen', (el) => {
        return window.getComputedStyle(el).display === 'none';
      });
      expect(isHidden).toBe(true);
    });

    test('WhenPageLoads_ShouldDisplayControlsInfo', async () => {
      const controlsInfo = await page.$('#controls-info');
      expect(controlsInfo).not.toBeNull();

      const heading = await page.$eval('#controls-info h3', (el) => el.textContent);
      expect(heading).toBe('Controls');
    });
  });

  describe('Join Code Input', () => {
    test('WhenTypingInJoinCodeInput_ShouldAcceptText', async () => {
      await page.type('#join-code-input', 'ABC123');
      const value = await page.$eval('#join-code-input', (el) => el.value);
      expect(value).toBe('ABC123');
    });

    test('WhenTypingLowercaseJoinCode_ShouldAcceptText', async () => {
      await page.type('#join-code-input', 'abc123');
      const value = await page.$eval('#join-code-input', (el) => el.value);
      expect(value).toBe('abc123');
    });

    test('WhenClearingJoinCodeInput_ShouldBeEmpty', async () => {
      await page.type('#join-code-input', 'ABC123');
      await page.click('#join-code-input', { clickCount: 3 }); // Select all
      await page.keyboard.press('Backspace');
      const value = await page.$eval('#join-code-input', (el) => el.value);
      expect(value).toBe('');
    });
  });

  describe('Join Button Validation', () => {
    test('WhenClickingJoinWithEmptyInput_ShouldShowError', async () => {
      await page.click('#join-game-btn');

      // Wait for error message to appear
      await page.waitForSelector('#lobby-error:not(.hidden)', { timeout: 1000 });

      const errorText = await page.$eval('#lobby-error', (el) => el.textContent);
      expect(errorText).toBe('Please enter a join code');

      const isVisible = await page.$eval('#lobby-error', (el) => {
        return !el.classList.contains('hidden');
      });
      expect(isVisible).toBe(true);
    });

    test('WhenClickingJoinWithWhitespaceInput_ShouldShowError', async () => {
      await page.type('#join-code-input', '   ');
      await page.click('#join-game-btn');

      await page.waitForSelector('#lobby-error:not(.hidden)', { timeout: 1000 });

      const errorText = await page.$eval('#lobby-error', (el) => el.textContent);
      expect(errorText).toBe('Please enter a join code');
    });

    test('WhenClickingJoinWithTooShortCode_ShouldShowError', async () => {
      await page.type('#join-code-input', 'ABC12');
      await page.click('#join-game-btn');

      await page.waitForSelector('#lobby-error:not(.hidden)', { timeout: 1000 });

      const errorText = await page.$eval('#lobby-error', (el) => el.textContent);
      expect(errorText).toBe('Please enter a valid 6-character join code');
    });

    test('WhenClickingJoinWithTooLongCode_ShouldShowError', async () => {
      await page.type('#join-code-input', 'ABC1234');
      await page.click('#join-game-btn');

      await page.waitForSelector('#lobby-error:not(.hidden)', { timeout: 1000 });

      const errorText = await page.$eval('#lobby-error', (el) => el.textContent);
      expect(errorText).toBe('Please enter a valid 6-character join code');
    });

    test('WhenClickingJoinWithInvalidCharacters_ShouldShowError', async () => {
      await page.type('#join-code-input', 'ABC@12');
      await page.click('#join-game-btn');

      await page.waitForSelector('#lobby-error:not(.hidden)', { timeout: 1000 });

      const errorText = await page.$eval('#lobby-error', (el) => el.textContent);
      expect(errorText).toBe('Please enter a valid 6-character join code');
    });

    test('WhenClickingJoinWithValidCode_ShouldJoinSessionSuccessfully', async () => {
      // First, create a host session to get a valid join code
      await page.click('#host-game-btn');
      await page.waitForSelector('#join-code-display:not(.hidden)', { timeout: 5000 });

      // Wait for the join code text to be populated
      await page.waitForFunction(() => {
        const joinCodeEl = document.getElementById('join-code');
        return joinCodeEl && joinCodeEl.textContent && joinCodeEl.textContent.trim().length === 6;
      }, { timeout: 5000 });

      const joinCode = await page.$eval('#join-code', (el) => el.textContent);

      // Create a new incognito browser context for the joining player
      // This ensures they have a separate auth session from the host
      const playerContext = await browser.createBrowserContext();
      const playerPage = await playerContext.newPage();

      // Capture console logs for debugging
      playerPage.on('console', msg => {
        const type = msg.type();
        if (type === 'error' || type === 'warning' || type === 'log') {
          console.log(`Player browser ${type}:`, msg.text());
        }
      });

      playerPage.on('pageerror', error => {
        console.log('Player page script error:', error.message);
      });

      await playerPage.goto(serverUrl);

      // Wait for the intro screen to be active (indicates app is initialized)
      await playerPage.waitForSelector('#intro-screen.active', { timeout: 5000 });

      // Wait for the join code input to be visible and ready
      await playerPage.waitForSelector('#join-code-input', { timeout: 5000 });

      // Enter the join code using evaluate to set value directly
      // (more reliable than type() in some cases)
      await playerPage.evaluate((code) => {
        document.getElementById('join-code-input').value = code;
      }, joinCode);

      await playerPage.click('#join-game-btn');

      // Wait for the lobby screen to be visible
      await playerPage.waitForSelector('#lobby-screen.active', { timeout: 10000 });

      // Verify lobby screen is visible
      const lobbyVisible = await playerPage.$eval('#lobby-screen', (el) => {
        return el.classList.contains('active') && window.getComputedStyle(el).display !== 'none';
      });
      expect(lobbyVisible).toBe(true);

      // Verify player name is in the list
      await playerPage.waitForSelector('#player-list li', { timeout: 5000 });
      const players = await playerPage.$$eval('#player-list li', (lis) => lis.map(li => li.textContent));
      expect(players.some(p => p.includes('Player-'))).toBe(true);

      // Clean up
      await playerPage.close();
      await playerContext.close();
    });
  });

  describe('Host Button', () => {
    test('WhenClickingHostButton_ShouldBeClickable', async () => {
      // Verify the button is clickable by checking it doesn't throw
      const isClickable = await page.$eval('#host-game-btn', (btn) => {
        return !btn.disabled && btn.offsetParent !== null;
      });
      expect(isClickable).toBe(true);
    });

    test('WhenClickingHostButton_ShouldCreateSessionAndDisplayJoinCode', async () => {
      await page.click('#host-game-btn');

      // Wait for join code display to become visible
      await page.waitForSelector('#join-code-display:not(.hidden)', { timeout: 5000 });

      // Verify join code is displayed
      const isVisible = await page.$eval('#join-code-display', (el) => {
        return !el.classList.contains('hidden');
      });
      expect(isVisible).toBe(true);

      // Wait for the join code text to be populated
      await page.waitForFunction(() => {
        const joinCodeEl = document.getElementById('join-code');
        return joinCodeEl && joinCodeEl.textContent && joinCodeEl.textContent.trim().length === 6;
      }, { timeout: 5000 });

      // Get the displayed join code
      const joinCode = await page.$eval('#join-code', (el) => el.textContent);

      // Verify join code format (6 alphanumeric characters)
      expect(joinCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(joinCode.length).toBe(6);
    });
  });

  describe('Accessibility', () => {
    test('WhenCheckingHostButton_ShouldHaveButtonRole', async () => {
      const tagName = await page.$eval('#host-game-btn', (el) => el.tagName);
      expect(tagName).toBe('BUTTON');
    });

    test('WhenCheckingJoinButton_ShouldHaveButtonRole', async () => {
      const tagName = await page.$eval('#join-game-btn', (el) => el.tagName);
      expect(tagName).toBe('BUTTON');
    });

    test('WhenCheckingJoinInput_ShouldHaveTextInputType', async () => {
      const type = await page.$eval('#join-code-input', (el) => el.type);
      expect(type).toBe('text');
    });

    test('WhenCheckingJoinInput_ShouldHavePlaceholder', async () => {
      const placeholder = await page.$eval('#join-code-input', (el) => el.placeholder);
      expect(placeholder).toBeTruthy();
    });
  });
});
