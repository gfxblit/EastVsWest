/**
 * Puppeteer Configuration Helper
 * Abstracts browser executable path for different environments:
 * - Local development (macOS, Linux, Windows)
 * - GitHub Actions (CI/CD)
 * - Google Cloud Shell
 */

/**
 * Detects the appropriate Chrome executable path based on the environment
 * @returns {string|undefined} Chrome executable path, or undefined to use Puppeteer's bundled Chromium
 */
function getExecutablePath() {
  // If explicitly set via environment variable, use that
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // GitHub Actions - uses system Chrome
  if (process.env.CI && process.env.GITHUB_ACTIONS) {
    return undefined; // Use Puppeteer's bundled Chromium
  }

  // Google Cloud Shell detection (has DEVSHELL_PROJECT_ID env var)
  if (process.env.DEVSHELL_PROJECT_ID || process.env.CLOUD_SHELL) {
    return '/usr/bin/google-chrome'; // Cloud Shell has Chrome at this path
  }

  // Local development paths by platform
  const platform = process.platform;

  if (platform === 'darwin') {
    // macOS
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (platform === 'linux') {
    // Linux (Ubuntu/Debian)
    return '/usr/bin/google-chrome';
  } else if (platform === 'win32') {
    // Windows
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  // Fallback to Puppeteer's bundled Chromium
  return undefined;
}

/**
 * Returns Puppeteer launch options optimized for the current environment
 * @param {Object} customOptions - Additional custom options to merge
 * @returns {Object} Puppeteer launch options
 */
export function getPuppeteerConfig(customOptions = {}) {
  const executablePath = getExecutablePath();

  const baseConfig = {
    headless: process.env.HEADLESS !== 'false' ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Overcome limited resource problems
      '--disable-gpu',
    ],
    dumpio: false,
  };

  // Only set executablePath if we have one
  if (executablePath) {
    baseConfig.executablePath = executablePath;
  }

  // Add architecture preference for macOS ARM64
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    baseConfig.env = { ...process.env, ARCHPREFERENCE: 'arm64' };
  }

  // Merge custom options
  return {
    ...baseConfig,
    ...customOptions,
    args: [...(baseConfig.args || []), ...(customOptions.args || [])],
  };
}

/**
 * Logs the detected configuration for debugging
 */
export function logPuppeteerConfig() {
  const config = getPuppeteerConfig();
  console.log('Puppeteer Configuration:');
  console.log('  Platform:', process.platform);
  console.log('  Architecture:', process.arch);
  console.log('  Executable:', config.executablePath || 'Bundled Chromium');
  console.log('  Headless:', config.headless);
  console.log('  CI:', process.env.CI || 'false');
  console.log('  GitHub Actions:', process.env.GITHUB_ACTIONS || 'false');
  console.log('  Cloud Shell:', process.env.DEVSHELL_PROJECT_ID || 'false');
}
