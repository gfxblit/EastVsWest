import { defineConfig } from 'vite';
import { getAvailablePort } from './scripts/port-utils.js';
import { resolve } from 'path';

export default defineConfig(async () => {
  const port = await getAvailablePort(3000);
  
  return {
    base: './',
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(process.cwd(), 'index.html'),
          frameTool: resolve(process.cwd(), 'tools/frame-tool/index.html'),
        },
      },
    },
    server: {
      port,
      open: true,
      host: true,
      allowedHosts: true,
    },
  };
});
