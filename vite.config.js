import { defineConfig } from 'vite';

export default defineConfig({
  base: '/EastVsWest/',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 3000,
    open: true,
    allowedHosts: true
  }
});
