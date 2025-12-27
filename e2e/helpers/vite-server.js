/**
 * Vite Dev Server Helper for E2E Tests
 * Starts and stops a Vite dev server for testing
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

let viteProcess = null;
const VITE_PORT = 5174; // Use a different port than default to avoid conflicts
const VITE_URL = `http://localhost:${VITE_PORT}`;

/**
 * Start the Vite dev server
 * @returns {Promise<string>} The URL of the server
 */
export async function startViteServer() {
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

    viteProcess = spawn('npm', ['run', 'dev', '--', '--port', String(VITE_PORT), '--strictPort'], {
      cwd: projectRoot,
      stdio: 'pipe',
      env
    });

    let output = '';

    viteProcess.stdout.on('data', (data) => {
      output += data.toString();
      // Look for the server ready message
      if (output.includes('Local:') || output.includes(`localhost:${VITE_PORT}`)) {
        // Give it a moment to fully start
        setTimeout(() => resolve(VITE_URL), 1000);
      }
    });

    viteProcess.stderr.on('data', (data) => {
      console.error('Vite server error:', data.toString());
    });

    viteProcess.on('error', (error) => {
      reject(new Error(`Failed to start Vite server: ${error.message}`));
    });

    viteProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Vite server exited with code ${code}`));
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (viteProcess) {
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
      const onExit = () => {
        viteProcess = null;
        resolve();
      };

      // Set up exit handler before killing
      viteProcess.once('exit', onExit);

      // Kill the process
      viteProcess.kill('SIGTERM');

      // Force kill after 2 seconds if not stopped
      setTimeout(() => {
        if (viteProcess) {
          viteProcess.kill('SIGKILL');
        }
      }, 2000);
    } else {
      resolve();
    }
  });
}
