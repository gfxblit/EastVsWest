# End-to-End Testing Guide

## Overview

This directory contains end-to-end (E2E) tests for Conflict Zone: East vs West using Puppeteer and Jest.

## Test Types

### Browser-Based E2E Tests (Puppeteer)
- `game.test.js` - Basic game page loading tests
- `lobby.test.js` - Lobby UI interaction tests

### Integration Tests (Real Supabase)
- `network.integration.test.js` - Network communication with real Supabase instance
- `SessionPlayersSnapshot.integration.test.js` - Real-time snapshot synchronization with Supabase Realtime

## Running Tests

### Local Development

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npm run test:e2e e2e/lobby.test.js

# Run with visible browser (non-headless)
HEADLESS=false npm run test:e2e e2e/lobby.test.js
```

### Integration Tests with Supabase

**Prerequisites:**
1. Supabase must be running locally
2. All migrations must be applied
3. Environment variables must be set

```bash
# Start Supabase locally (first time)
npx supabase start

# Or restart with latest migrations
npx supabase db reset

# Get credentials
npx supabase status

# Run all integration tests
SUPABASE_URL="http://127.0.0.1:54321" \
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
npm run test:e2e

# Run specific integration test
SUPABASE_URL="http://127.0.0.1:54321" \
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
npm run test:e2e e2e/SessionPlayersSnapshot.integration.test.js
```

**Important Notes:**
- Integration tests create and clean up their own test data
- Tests may take 7-10 seconds to run due to real-time synchronization delays
- Supabase Realtime requires ~100-500ms for event propagation
- Channel cleanup requires ~100-300ms delay between tests

## Puppeteer Configuration

The tests use an abstracted Puppeteer configuration (`e2e/helpers/puppeteer-config.js`) that automatically detects the appropriate Chrome executable path for different environments.

### Supported Environments

1. **Local macOS**: Uses `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
2. **Local Linux**: Uses `/usr/bin/google-chrome`
3. **Local Windows**: Uses `C:\Program Files\Google\Chrome\Application\chrome.exe`
4. **GitHub Actions**: Uses Puppeteer's bundled Chromium
5. **Google Cloud Shell**: Uses `/usr/bin/google-chrome`

### Custom Executable Path

You can override the automatic detection with an environment variable:

```bash
# Use a custom Chrome installation
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome npm run test:e2e

# Use Puppeteer's bundled Chromium
PUPPETEER_EXECUTABLE_PATH="" npm run test:e2e
```

### Debug Configuration

To see the detected Puppeteer configuration, you can use `console.log(getPuppeteerConfig())`.

## GitHub Actions Setup

The configuration automatically works in GitHub Actions without additional setup. The CI environment uses Puppeteer's bundled Chromium.

Example workflow:

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:e2e
```

## Google Cloud Shell Setup

The configuration automatically detects Google Cloud Shell and uses the system Chrome installation. No additional setup required.

```bash
# In Cloud Shell
npm run test:e2e
```

## Troubleshooting

### Integration Test Issues

#### "TIMED_OUT" or channel subscription failures
**Cause:** Supabase is not running or channels weren't properly cleaned up

**Solutions:**
1. Ensure Supabase is running: `npx supabase status`
2. Restart Supabase: `npx supabase stop && npx supabase start`
3. Check migrations were applied: `npx supabase db reset`

#### Tests pass individually but fail when run together
**Cause:** Channel cleanup timing issues between tests

**Solution:** The test suite includes automatic cleanup delays. If still failing:
- Increase `afterEach` cleanup delay to 500ms
- Run tests individually to isolate the issue

#### DELETE events not removing players
**Cause:** Supabase Realtime limitation - only sends primary key in DELETE events

**Solution:** This is handled automatically by SessionPlayersSnapshot. If tests fail:
1. Verify the player exists in the snapshot before deletion
2. Check that the player has an `id` field matching the DELETE event

#### Position broadcasts not received
**Cause:** Channels not configured with broadcast settings

**Solution:** Ensure channels are created with:
```javascript
channel = client.channel('game_session:CODE', {
  config: {
    broadcast: { ack: true }
  }
});
```

### "Failed to launch browser"

If tests fail to launch the browser, try:

1. **Verify Chrome is installed:**
   ```bash
   # macOS
   ls /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome

   # Linux/Cloud Shell
   which google-chrome
   ```

2. **Use bundled Chromium:**
   ```bash
   PUPPETEER_EXECUTABLE_PATH="" npm run test:e2e
   ```

3. **Check configuration:**
   Add logging to your test:
   ```javascript
   import { getPuppeteerConfig } from './helpers/puppeteer-config.js';
   console.log(getPuppeteerConfig());
   ```

### "Browser crashed" or "Page timeout"

Increase timeouts or add more memory:

```javascript
jest.setTimeout(60000); // 60 seconds

// Or in getPuppeteerConfig
getPuppeteerConfig({
  args: ['--disable-dev-shm-usage', '--no-sandbox']
});
```

## Best Practices

1. **Use the helper for all Puppeteer tests:**
   ```javascript
   import { getPuppeteerConfig } from './helpers/puppeteer-config.js';
   browser = await puppeteer.launch(getPuppeteerConfig());
   ```

2. **Clean up resources:**
   ```javascript
   afterAll(async () => {
     await browser.close();
     await stopViteServer();
   });
   ```

3. **Isolate tests:**
   - Each test should be independent
   - Use `beforeEach`/`afterEach` for test-specific setup
   - Clean up database records after integration tests

4. **Handle async operations:**
   ```javascript
   await page.waitForSelector('#element');
   await new Promise(resolve => setTimeout(resolve, 100));
   ```
