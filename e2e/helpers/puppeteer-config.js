/**
 * Puppeteer Configuration Helper
 * Abstracts browser executable path for different environments:
 * - Local development (uses chrome-headless-shell to prevent focus stealing)
 * - GitHub Actions (CI/CD)
 * - Google Cloud Shell
 */

import { homedir } from 'os';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Finds the chrome-headless-shell binary in Puppeteer's cache
 * This binary has no window manager integration and won't steal focus on macOS
 * @returns {string|undefined} Path to chrome-headless-shell binary, or undefined if not found
 */
function findHeadlessShellBinary() {
  const cacheDir = join(process.platform === 'darwin' ? join(homedir(), 'Library', 'Caches', 'puppeteer') : join(homedir(), '.cache', 'puppeteer'), 'chrome-headless-shell');

  if (!existsSync(cacheDir)) {
    return undefined;
  }

  // Determine platform suffix
  let platformDir;
  if (process.platform === 'darwin') {
    platformDir = process.arch === 'arm64' ? 'mac_arm' : 'mac';
  } else if (process.platform === 'linux') {
    platformDir = 'linux64';
  } else if (process.platform === 'win32') {
    platformDir = 'win64';
  } else {
    return undefined;
  }

  // Find matching version directory (e.g., mac_arm-143.0.7499.169)
  const versions = readdirSync(cacheDir).filter(dir => dir.startsWith(platformDir));
  if (versions.length === 0) {
    return undefined;
  }

  // Use the most recent version (sorted alphabetically, higher version = later)
  versions.sort().reverse();
  const versionDir = versions[0];

  // Determine binary subdirectory name
  let binarySubdir;
  if (process.platform === 'darwin') {
    binarySubdir = process.arch === 'arm64' ? 'chrome-headless-shell-mac-arm64' : 'chrome-headless-shell-mac-x64';
  } else if (process.platform === 'linux') {
    binarySubdir = 'chrome-headless-shell-linux64';
  } else if (process.platform === 'win32') {
    binarySubdir = 'chrome-headless-shell-win64';
  }

  const binaryName = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  const binaryPath = join(cacheDir, versionDir, binarySubdir, binaryName);

  if (existsSync(binaryPath)) {
    return binaryPath;
  }

  return undefined;
}

/**
 * Detects the appropriate Chrome executable path based on the environment
 * @param {boolean} useHeadlessShell - Whether to prefer the headless shell binary
 * @returns {string|undefined} Chrome executable path, or undefined to use Puppeteer's bundled Chromium
 */
function getExecutablePath(useHeadlessShell = false) {
  // If explicitly set via environment variable, use that
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // GitHub Actions - uses Puppeteer's bundled Chromium
  if (process.env.CI && process.env.GITHUB_ACTIONS) {
    return undefined;
  }

  // Google Cloud Shell detection (has DEVSHELL_PROJECT_ID env var)
  if (process.env.DEVSHELL_PROJECT_ID || process.env.CLOUD_SHELL) {
    return '/usr/bin/google-chrome'; // Cloud Shell has Chrome at this path
  }

  // For headless mode on macOS, try to use chrome-headless-shell to prevent focus stealing
  // This is checked after CI/Cloud Shell to ensure those environments use their expected binaries
  if (useHeadlessShell && process.platform === 'darwin') {
    const shellBinary = findHeadlessShellBinary();
    if (shellBinary) {
      return shellBinary;
    }
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
  const isHeadless = process.env.HEADLESS !== 'false';
  const executablePath = getExecutablePath(isHeadless);

  // If using chrome-headless-shell binary, we use headless: true (it's always headless)
  // If using regular Chrome, we use headless: 'shell' mode
  const usingShellBinary = executablePath && executablePath.includes('chrome-headless-shell');

  const baseConfig = {
    headless: isHeadless ? (usingShellBinary ? true : 'shell') : false,
    pipe: isHeadless, // Use pipe transport to avoid window manager interaction on macOS
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

// Export for testing
export { findHeadlessShellBinary, getExecutablePath };
