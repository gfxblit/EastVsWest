export default {
  testEnvironment: 'node',
  testMatch: ['**/e2e/**/*.test.js'],
  transform: {},
  testTimeout: 30000,
  maxWorkers: 1 // Run tests serially to avoid port conflicts with Vite server
};
