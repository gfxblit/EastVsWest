/**
 * End-to-End Tests for Lobby UI
 * Tests lobby screen interactions and validation
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Lobby UI Interactions', () => {
  let browser;
  let page;
  const indexPath = join(__dirname, '..', 'index.html');

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('file://' + indexPath);
  });

  afterEach(async () => {
    await page.close();
  });

  describe('Lobby Screen Elements', () => {
    test('WhenPageLoads_ShouldDisplayLobbyTitle', async () => {
      const title = await page.$eval('#lobby-screen h1', (el) => el.textContent);
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
      const isHidden = await page.$eval('#join-code-display', (el) => {
        return el.classList.contains('hidden') ||
               window.getComputedStyle(el).display === 'none';
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
    test('WhenClickingJoinWithEmptyInput_ShouldShowAlert', async () => {
      // Set up dialog handler before clicking
      const dialogPromise = new Promise((resolve) => {
        page.once('dialog', async (dialog) => {
          expect(dialog.message()).toBe('Please enter a join code');
          await dialog.accept();
          resolve();
        });
      });

      await page.click('#join-game-btn');
      await dialogPromise;
    });

    test('WhenClickingJoinWithWhitespaceInput_ShouldShowAlert', async () => {
      await page.type('#join-code-input', '   ');

      const dialogPromise = new Promise((resolve) => {
        page.once('dialog', async (dialog) => {
          expect(dialog.message()).toBe('Please enter a join code');
          await dialog.accept();
          resolve();
        });
      });

      await page.click('#join-game-btn');
      await dialogPromise;
    });

    test('WhenClickingJoinWithTooShortCode_ShouldShowAlert', async () => {
      await page.type('#join-code-input', 'ABC12');

      const dialogPromise = new Promise((resolve) => {
        page.once('dialog', async (dialog) => {
          expect(dialog.message()).toBe('Please enter a valid 6-character join code');
          await dialog.accept();
          resolve();
        });
      });

      await page.click('#join-game-btn');
      await dialogPromise;
    });

    test('WhenClickingJoinWithTooLongCode_ShouldShowAlert', async () => {
      await page.type('#join-code-input', 'ABC1234');

      const dialogPromise = new Promise((resolve) => {
        page.once('dialog', async (dialog) => {
          expect(dialog.message()).toBe('Please enter a valid 6-character join code');
          await dialog.accept();
          resolve();
        });
      });

      await page.click('#join-game-btn');
      await dialogPromise;
    });

    test('WhenClickingJoinWithInvalidCharacters_ShouldShowAlert', async () => {
      await page.type('#join-code-input', 'ABC@12');

      const dialogPromise = new Promise((resolve) => {
        page.once('dialog', async (dialog) => {
          expect(dialog.message()).toBe('Please enter a valid 6-character join code');
          await dialog.accept();
          resolve();
        });
      });

      await page.click('#join-game-btn');
      await dialogPromise;
    });

    test('WhenClickingJoinWithValidCode_ShouldAttemptToJoin', async () => {
      await page.type('#join-code-input', 'ABC123');

      // Set up a handler to catch any error dialogs (network will fail)
      const dialogPromise = new Promise((resolve) => {
        page.once('dialog', async (dialog) => {
          // We expect a network error since we're not connected to Supabase
          expect(dialog.message()).toContain('Error joining game');
          await dialog.accept();
          resolve();
        });
      });

      await page.click('#join-game-btn');
      await dialogPromise;
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

    test('WhenClickingHostButton_ShouldAttemptToHost', async () => {
      // Set up a handler to catch error dialogs (network will fail)
      const dialogPromise = new Promise((resolve) => {
        page.once('dialog', async (dialog) => {
          // We expect a network error since we're not connected to Supabase
          expect(dialog.message()).toContain('Error hosting game');
          await dialog.accept();
          resolve();
        });
      });

      await page.click('#host-game-btn');
      await dialogPromise;
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
