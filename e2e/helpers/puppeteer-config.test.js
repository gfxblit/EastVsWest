/**
 * Unit tests for Puppeteer configuration helper
 */

import { getPuppeteerConfig, findHeadlessShellBinary, getExecutablePath } from './puppeteer-config.js';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

describe('Puppeteer Configuration Helper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('findHeadlessShellBinary', () => {
    test('WhenOnMacOS_ShouldFindChromeHeadlessShellBinary', () => {
      if (process.platform !== 'darwin') {
        // Skip on non-macOS
        return;
      }

      const shellBinary = findHeadlessShellBinary();

      // If the binary exists, it should be a valid path
      if (shellBinary) {
        expect(shellBinary).toContain('chrome-headless-shell');
        expect(existsSync(shellBinary)).toBe(true);
      }
    });
  });

  describe('getExecutablePath', () => {
    test('WhenPuppeteerExecutablePathSet_ShouldUseEnvironmentVariable', () => {
      process.env.PUPPETEER_EXECUTABLE_PATH = '/custom/path/to/chrome';
      const config = getPuppeteerConfig();
      expect(config.executablePath).toBe('/custom/path/to/chrome');
    });

    test('WhenOnLocalMacAndHeadless_ShouldUseChromeHeadlessShell', () => {
      if (process.platform !== 'darwin') {
        // Skip on non-macOS
        return;
      }

      delete process.env.PUPPETEER_EXECUTABLE_PATH;
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.DEVSHELL_PROJECT_ID;
      delete process.env.CLOUD_SHELL;
      process.env.HEADLESS = 'true';

      const config = getPuppeteerConfig();

      // On macOS with headless=true, should use chrome-headless-shell if available
      if (config.executablePath) {
        expect(config.executablePath).toContain('chrome-headless-shell');
      }
    });

    test('WhenInGitHubActions_ShouldUseBundledChromium', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
      const config = getPuppeteerConfig();
      expect(config.executablePath).toBeUndefined();
    });

    test('WhenInCloudShell_ShouldUseCloudShellChrome', () => {
      process.env.DEVSHELL_PROJECT_ID = 'test-project';
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
      const config = getPuppeteerConfig();
      expect(config.executablePath).toBe('/usr/bin/google-chrome');
    });
  });

  describe('getPuppeteerConfig', () => {
    test('WhenCustomOptionsProvided_ShouldMergeWithBaseConfig', () => {
      const customOptions = {
        slowMo: 100,
        args: ['--window-size=1920,1080'],
      };
      const config = getPuppeteerConfig(customOptions);

      expect(config.slowMo).toBe(100);
      expect(config.args).toContain('--no-sandbox');
      expect(config.args).toContain('--window-size=1920,1080');
    });

    test('WhenHeadlessEnvFalse_ShouldDisableHeadless', () => {
      process.env.HEADLESS = 'false';
      const config = getPuppeteerConfig();
      expect(config.headless).toBe(false);
    });

    test('WhenHeadlessAndUsingShellBinary_ShouldUseHeadlessTrue', () => {
      if (process.platform !== 'darwin') {
        // Skip on non-macOS
        return;
      }

      delete process.env.HEADLESS; // Default to headless
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.DEVSHELL_PROJECT_ID;
      delete process.env.CLOUD_SHELL;

      const config = getPuppeteerConfig();

      // If using chrome-headless-shell, headless should be true (not 'shell')
      if (config.executablePath && config.executablePath.includes('chrome-headless-shell')) {
        expect(config.headless).toBe(true);
      }
    });

    test('WhenOnMacOS_ShouldIncludeArchPreference', () => {
      if (process.platform === 'darwin' && process.arch === 'arm64') {
        const config = getPuppeteerConfig();
        expect(config.env.ARCHPREFERENCE).toBe('arm64');
      }
    });

    test('WhenBaseArgsExist_ShouldIncludeSecurityFlags', () => {
      const config = getPuppeteerConfig();
      expect(config.args).toContain('--no-sandbox');
      expect(config.args).toContain('--disable-setuid-sandbox');
      expect(config.args).toContain('--disable-dev-shm-usage');
      expect(config.args).toContain('--disable-gpu');
    });
  });
});
