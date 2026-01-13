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
    // Ignore error, will fallback below
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
  // Unsafe ports blocked by Chrome
  const unsafePorts = [
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 139, 143, 179,
    389, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 556, 563, 587, 601, 636,
    993, 995, 2049, 3659, 4045, 6000, 6665, 6666, 6667, 6668, 6669, 5060, 5061
  ];

  if (unsafePorts.includes(port)) {
    return false;
  }

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
 * Finds an available port starting from a base port plus branch hash and a random offset.
 * The random offset helps prevent race conditions when multiple processes start at the same time.
 * @param {number} basePort 
 * @returns {Promise<number>}
 */
export async function getAvailablePort(basePort) {
  const hash = getBranchHash();
  // Remove random offset to ensure deterministic port selection for tests
  const startPort = basePort + hash;
  let port = startPort;
  
  // Try up to 100 ports to find a free one
  for (let i = 0; i < 100; i++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }
  
  throw new Error(`Could not find an available port after 100 tries starting from ${startPort}.`);
}
