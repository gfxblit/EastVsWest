import { defineConfig } from 'vite';
import { getAvailablePort } from './scripts/port-utils.js';

export default defineConfig(async () => {
  const port = await getAvailablePort(3000);
  
  return {
    base: './',
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true
    },
    server: {
      port,
      open: true,
      host: true,
      allowedHosts: true
    }
  };
});
