import { getBranchHash, getAvailablePort, isPortAvailable } from './port-utils.js';
import net from 'net';

describe('Port Utilities', () => {
  describe('getBranchHash', () => {
    test('should return a number between 0 and 999', () => {
      const hash = getBranchHash();
      expect(typeof hash).toBe('number');
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(1000);
    });

    test('should be deterministic', () => {
      const hash1 = getBranchHash();
      const hash2 = getBranchHash();
      expect(hash1).toBe(hash2);
    });
  });

  describe('isPortAvailable', () => {
    test('should return true for an available port', async () => {
      // Pick a likely free port in a high range
      const isAvailable = await isPortAvailable(19999);
      expect(isAvailable).toBe(true);
    });

    test('should return false for an occupied port', async () => {
      const port = 19998;
      const server = net.createServer();
      
      await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
      
      try {
        const isAvailable = await isPortAvailable(port);
        expect(isAvailable).toBe(false);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  describe('getAvailablePort', () => {
    test('should return a port in the expected range', async () => {
      const basePort = 3000;
      const port = await getAvailablePort(basePort);
      const hash = getBranchHash();
      
      expect(port).toBeGreaterThanOrEqual(basePort + hash);
      expect(port).toBeLessThan(basePort + hash + 100);
    });

    test('should return a different port if the hashed one is taken', async () => {
      const basePort = 20000;
      const hash = getBranchHash();
      const hashedPort = basePort + hash;
      
      const server = net.createServer();
      await new Promise((resolve) => server.listen(hashedPort, '0.0.0.0', resolve));
      
      try {
        const port = await getAvailablePort(basePort);
        expect(port).toBeGreaterThan(hashedPort);
        
        // Check if the returned port is actually available
        const isAvailable = await isPortAvailable(port);
        expect(isAvailable).toBe(true);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    test('should throw an error if no port is available', async () => {
      const basePort = 21000;
      const hash = getBranchHash();
      const startPort = basePort + hash;
      const servers = [];

      // Occupy all 100 ports that will be checked
      for (let i = 0; i < 100; i++) {
        const portToOccupy = startPort + i;
        const server = net.createServer();
        await new Promise(resolve => server.listen(portToOccupy, '0.0.0.0', resolve));
        servers.push(server);
      }

      try {
        await expect(getAvailablePort(basePort)).rejects.toThrow(/Could not find an available port/);
      } finally {
        await Promise.all(servers.map(s => new Promise(resolve => s.close(resolve))));
      }
    });
  });
});
