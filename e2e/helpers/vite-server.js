/**
 * Vite Dev Server Helper for E2E Tests
 * Starts and stops a Vite dev server for testing
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getAvailablePort } from '../../scripts/port-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

let viteProcess = null;
let currentViteUrl = null;

/**
 * Start the Vite dev server
 * @param {number} retries - Number of retries if port is already in use
 * @returns {Promise<string>} The URL of the server
 */
export async function startViteServer(retries = 3) {
  if (currentViteUrl) return currentViteUrl;

  try {
    return await _startViteServer();
  } catch (error) {
    if (retries > 0 && error.message.includes('port conflict')) {
      console.warn(`Vite server port conflict, retrying... (${retries} left)`);
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
      return startViteServer(retries - 1);
    }
    throw error;
  }
}

/**
 * Internal helper to start the Vite dev server
 * @returns {Promise<string>}
 */
async function _startViteServer() {
  const port = await getAvailablePort(5000);
  const url = `http://localhost:${port}`;

  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    // Only set VITE_ env vars if they are provided in the process environment.
    // Otherwise, let Vite load them from .env.local / .env files.
    if (process.env.SUPABASE_URL) {
      env.VITE_SUPABASE_URL = process.env.SUPABASE_URL;
    }
    if (process.env.SUPABASE_ANON_KEY) {
      env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    }

    viteProcess = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort', '--no-open'], {
      cwd: projectRoot,
      stdio: 'pipe',
      env,
      detached: true, // Run in separate process group to prevent focus stealing on macOS
    });

    // Prevent the parent process from waiting for the detached child
    viteProcess.unref();

    let output = '';
    let startTimeout = null;

    viteProcess.stdout.on('data', (data) => {
      output += data.toString();
      // Look for the server ready message
      if (output.includes('Local:') || output.includes(`localhost:${port}`)) {
        // Clear the timeout as soon as we know it's starting
        if (startTimeout) {
          clearTimeout(startTimeout);
          startTimeout = null;
        }
        // Give it a moment to fully start
        setTimeout(() => {
          currentViteUrl = url;
          resolve(url);
        }, 1000);
      }
    });

    viteProcess.stderr.on('data', (data) => {
      const message = data.toString();
      // Don't log expected warnings/info to stderr if it's just vite output
      if (message.includes('Port') && message.includes('is already in use')) {
        if (startTimeout) {
          clearTimeout(startTimeout);
          startTimeout = null;
        }
        // Kill the process if it failed to start
        if (viteProcess) {
          viteProcess.kill('SIGKILL');
          viteProcess = null;
        }
        reject(new Error(`Vite server port conflict: ${message.trim()}`));
      } else {
        // Log other errors
        console.error('Vite server stderr:', message);
      }
    });

    viteProcess.on('error', (error) => {
      if (startTimeout) {
        clearTimeout(startTimeout);
        startTimeout = null;
      }
      reject(new Error(`Failed to start Vite server: ${error.message}`));
    });

    viteProcess.on('exit', (code) => {
      if (startTimeout) {
        clearTimeout(startTimeout);
        startTimeout = null;
      }
      if (code !== 0 && code !== null && !currentViteUrl) {
        reject(new Error(`Vite server exited with code ${code}`));
      }
    });

    // Timeout after 30 seconds
    startTimeout = setTimeout(() => {
      if (viteProcess && !currentViteUrl) {
        viteProcess.kill('SIGKILL');
        viteProcess = null;
        reject(new Error('Vite server failed to start within 30 seconds'));
      }
    }, 30000);
  });
}

/**
 * Stop the Vite dev server
 */
export async function stopViteServer() {
  return new Promise((resolve) => {
    if (viteProcess) {
      let forceKillTimeout = null;

      const onExit = () => {
        if (forceKillTimeout) {
          clearTimeout(forceKillTimeout);
          forceKillTimeout = null;
        }
        viteProcess = null;
        currentViteUrl = null;
        resolve();
      };

      // Set up exit handler before killing
      viteProcess.once('exit', onExit);

      // Kill the process
      viteProcess.kill('SIGTERM');

      // Force kill after 2 seconds if not stopped
      forceKillTimeout = setTimeout(() => {
        if (viteProcess) {
          viteProcess.kill('SIGKILL');
        }
      }, 2000);
    } else {
      resolve();
    }
  });
}
