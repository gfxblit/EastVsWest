/**
 * Unit tests for Puppeteer configuration helper
 */

import { getPuppeteerConfig } from './puppeteer-config.js';

describe('Puppeteer Configuration Helper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('WhenPuppeteerExecutablePathSet_ShouldUseEnvironmentVariable', () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = '/custom/path/to/chrome';
    const config = getPuppeteerConfig();
    expect(config.executablePath).toBe('/custom/path/to/chrome');
  });

  test('WhenInGitHubActions_ShouldUseBundledChromium', () => {
    process.env.CI = 'true';
    process.env.GITHUB_ACTIONS = 'true';
    const config = getPuppeteerConfig();
    expect(config.executablePath).toBeUndefined();
  });

  test('WhenInCloudShell_ShouldUseCloudShellChrome', () => {
    process.env.DEVSHELL_PROJECT_ID = 'test-project';
    const config = getPuppeteerConfig();
    expect(config.executablePath).toBe('/usr/bin/google-chrome');
  });

  test('WhenCustomOptionsProvided_ShouldMergeWithBaseConfig', () => {
    const customOptions = {
      slowMo: 100,
      args: ['--window-size=1920,1080']
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

  test('WhenHeadlessNotSet_ShouldDefaultToNew', () => {
    delete process.env.HEADLESS;
    const config = getPuppeteerConfig();
    expect(config.headless).toBe('new');
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
