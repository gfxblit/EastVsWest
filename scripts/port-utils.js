import { execSync } from 'child_process';
import net from 'net';
import path from 'path';

/**
 * Gets a numeric hash based on the current Git branch name.
 * Fallback to directory name if not in a git repo.
 * @returns {number} A hash between 0 and 999
 */
export function getBranchHash() {
  let name = '';
  try {
    name = execSync('git branch --show-current', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    // Fallback to directory name if not in a git repo or git fails
    try {
      name = path.basename(process.cwd());
    } catch (err) {
      name = 'default';
    }
  }
  
  if (!name) {
    try {
      name = path.basename(process.cwd());
    } catch (err) {
      name = 'default';
    }
  }

  // Simple string hash (DJB2-like)
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash) + name.charCodeAt(i);
  }
  
  return Math.abs(hash) % 1000;
}

/**
 * Checks if a port is available.
 * @param {number} port 
 * @returns {Promise<boolean>}
 */
export async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false); // Assume unavailable for other errors
        }
      })
      .once('listening', () => {
        server.close(() => resolve(true));
      })
      .listen(port, '0.0.0.0');
  });
}

/**
 * Finds an available port starting from a base port plus branch hash.
 * @param {number} basePort 
 * @returns {Promise<number>}
 */
export async function getAvailablePort(basePort) {
  const hash = getBranchHash();
  let port = basePort + hash;
  
  // Try up to 100 ports to find a free one
  for (let i = 0; i < 100; i++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }
  
  return basePort + hash; // Fallback to original hashed port if all fail
}
