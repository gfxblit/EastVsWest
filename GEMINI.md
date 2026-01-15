# Test-Driven Development Workflow for Gemini

## Setup
Before starting any development work, ensure the environment is correctly configured by running:
```bash
npm run setup
```
This script installs dependencies, sets up environment variables, and checks for required tools.

## Overview
Start by reading README.md

This workflow enforces strict Test-Driven Development (TDD) for the game using Jest for unit/integration tests and Puppeteer for end-to-end tests. Follow each phase sequentially.

## Architecture

Read docs/architecture.md to understand the game architecture and technologies used.

---

## Phase 1: Requirements Clarification

**Input:** User's feature request

**Process:**
1. Read the feature request carefully.
2. Identify any ambiguities or missing details.
3. If requirements are unclear:
   - **STOP** implementation.
   - Reply with specific clarifying questions:
     - What are the expected inputs and outputs?
     - What are the success criteria?
     - Are there edge cases to consider?
     - What components/systems will this interact with?
   - **WAIT** for user response before proceeding.
4. If requirements are clear:
   - Summarize your understanding.
   - List testable acceptance criteria.
   - Proceed to Phase 2.

**Exit Criteria:** Clear, testable requirements documented.

---

## Phase 2: Write Failing Tests

**CRITICAL: For features with external dependencies (network, database, APIs), write BOTH unit tests AND integration tests.**

**Process:**

### Step 1: Write Unit Tests (with mocked dependencies)
1. Create or locate the test file. By convention, for a file like `network.js`, the test file will be `network.test.js`.
2. Write tests that verify ALL requirements with mocked dependencies:
   - One test per acceptance criterion
   - Use descriptive test names: `When[Condition]_Should[ExpectedBehavior]`
   - Mock external dependencies (Supabase, channels, etc.)
   - Test edge cases and error conditions
   - Tests MUST fail initially (no implementation exists yet)
3. **Run unit tests: `npm test src/[module].test.js`** to confirm they fail
4. Verify failure messages are clear and helpful

**Example Unit Test Structure:**
```javascript
import { Network } from './network.js';

describe('Network', () => {
  test('WhenClientSendsPositionUpdate_ShouldSendCorrectMessage', () => {
    // Arrange
    const mockChannel = { send: jest.fn() };
    const network = new Network();
    network.channel = mockChannel;

    // Act
    network.sendMovementUpdate({ position_x: 100, position_y: 200, velocity_x: 0, velocity_y: 0 });

    // Assert
    expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'broadcast',
      payload: expect.objectContaining({ type: 'movement_update' })
    }));
  });
});
```

### Step 2: Write Integration Tests (REQUIRED for network/database features)
1. Create integration test file in `e2e/` directory (e.g., `e2e/network.integration.test.js`)
2. Write tests that verify the SAME requirements with REAL dependencies:
   - Test actual communication flow (e.g., multiple clients, real Supabase channels)
   - Test realistic scenarios with timing and concurrency
   - Test the full network stack, not just individual methods
   - Tests should fail initially or be skipped if Supabase is not running
3. **Setup Supabase (if not already running):**
   ```bash
   npm run supabase:start
   npm run supabase:status  # Get SUPABASE_URL and SUPABASE_ANON_KEY
   ```
4. **Run integration tests:**
   ```bash
   SUPABASE_URL="<url>" SUPABASE_ANON_KEY="<key>" npm run test:e2e e2e/[module].integration.test.js
   ```
5. Verify tests fail initially (or skip if Supabase not available)

**Example Integration Test Structure:**
```javascript
import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';

describe('Network Integration', () => {
  let supabaseClient;
  let hostNetwork;

  beforeAll(async () => {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data } = await supabaseClient.auth.signInAnonymously();
    hostNetwork = new Network();
    hostNetwork.initialize(supabaseClient, data.user.id);
  });

  test('should send movement updates through real Supabase channel', async () => {
    // Test with real Supabase Realtime channels
    const { session } = await hostNetwork.hostGame('Host');

    // Create second client to receive broadcasts
    const playerClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: playerAuth } = await playerClient.auth.signInAnonymously();
    const playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerAuth.user.id);

    await playerNetwork.joinGame(session.join_code, 'Player1');

    // Test real message flow
    const broadcasts = [];
    playerNetwork.on('movement_update', (msg) => broadcasts.push(msg));

    playerNetwork.sendMovementUpdate({ position_x: 100, position_y: 200, velocity_x: 0, velocity_y: 0 });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(broadcasts.length).toBeGreaterThan(0);
  });
});
```

**Exit Criteria:**
- ✅ All unit tests written and fail with clear error messages
- ✅ Unit test run output confirmed: `npm test src/[module].test.js`
- ✅ All integration tests written (for network/database features)
- ✅ Integration tests fail or skip if dependencies unavailable
- ✅ Integration test run output confirmed (if Supabase running)

---

## Phase 3: Implement Minimum Code

**Process:**
1. Write the **simplest possible code** in the corresponding module (`game.js`, `renderer.js`, etc.) to make ONE test pass.
2. No premature optimization or extra features.
3. Hard-code values if necessary (will refactor later).
4. **Run unit tests after each change:**
   ```bash
   npm test src/[module].test.js
   ```
5. If a unit test passes, move to the next failing test.
6. Repeat until ALL unit tests pass.
7. **If you wrote integration tests, run them now:**
   ```bash
   SUPABASE_URL="<url>" SUPABASE_ANON_KEY="<key>" npm run test:e2e e2e/[module].integration.test.js
   ```
8. Fix any integration test failures (these often reveal issues that mocked tests miss).

**Rules:**
- ❌ Do NOT add features not required by tests.
- ❌ Do NOT refactor yet (that's Phase 4).
- ✅ DO use the simplest solution.
- ✅ DO make incremental changes.
- ✅ DO verify each test individually.
- ✅ DO run integration tests before moving to Phase 4 (for network/database features).

**Exit Criteria:**
- ✅ ALL unit tests pass (green)
- ✅ ALL integration tests pass (green) - if applicable

---

## Phase 4: Refactor Implementation

**Process:**
1. Review the implementation for:
   - Code duplication
   - Hard-coded values that should be parameterized (move to `config.js` if needed).
   - Long methods that should be split.
   - Complex logic that needs simplification.
   - Missing modular structure.
2. Refactor to achieve:
   - **Simple:** Easy to understand and maintain.
   - **Modular:** Clear separation of concerns.
   - **DRY:** No unnecessary duplication.
3. After EACH refactor:
   - **Run all unit tests:**
     ```bash
     npm test
     ```
   - **Run integration tests (if applicable):**
     ```bash
     SUPABASE_URL="<url>" SUPABASE_ANON_KEY="<key>" npm run test:e2e e2e/[module].integration.test.js
     ```
   - Ensure all tests still pass.
   - If any tests fail, revert the refactor.
4. Commit each successful refactor separately.

**Exit Criteria:**
- ✅ Clean, modular implementation
- ✅ All unit tests still passing
- ✅ All integration tests still passing (if applicable)
- ✅ Code follows project best practices

---

## Phase 5: Final Verification

**CRITICAL: This phase requires running BOTH unit tests AND integration tests (if applicable).**

**Process:**
1. **Run the complete unit test suite:**
   ```bash
   npm test
   ```
2. **Run integration tests (REQUIRED for network/database features):**
   ```bash
   # Start Supabase if not already running
   npm run supabase:start

   # Get credentials
   npm run supabase:status

   # Run integration tests
   SUPABASE_URL="<url>" SUPABASE_ANON_KEY="<key>" npm run test:e2e
   ```
3. Verify ALL tests pass (both unit and integration).
4. Review test coverage:
   - All requirements tested in BOTH unit and integration tests?
   - Edge cases covered?
   - Error conditions handled?
   - Real network communication tested (for network features)?
5. If gaps are found, return to Phase 2.
6. **MANDATORY Self-Review:** After ALL tests pass, you MUST execute the `activate_skill` tool with `name: 'pr-reviewer'`. 
    - Perform a thorough self-review of your changes.
    - **You MUST review all feedback provided by the tool.**
    - **You MUST explicitly address all high and critical priority issues, logic errors, or style inconsistencies identified.**
    - If changes are made based on the review, re-run all tests to ensure continued correctness.
    - You are not finished until the review is complete and all high/critical feedback is integrated.

**Exit Criteria:**
- ✅ 100% of requirements have passing **unit** tests
- ✅ 100% of requirements have passing **integration** tests (if applicable)
- ✅ No test failures in either test suite
- ✅ `pr-reviewer` skill activated, self-review performed, and all feedback addressed
- ✅ Code is clean, refactored, and follows project standards

---

## Phase 6: Commit Changes to a branch and Push to Origin

**Process:**
1. Commit all changes with descriptive messages:
   ```
   test: Add tests for [feature]
   feat: Implement [feature] with TDD approach
   refactor: address review feedback on [component]
   refactor: Simplify [component] logic
   ```
   The committed changes will be available on the current branch. Push to origin. A human is then responsible for creating a Pull Request for review.

**Exit Criteria:** Changes committed with descriptive messages.

---

## TDD Workflow Checklist

Use this checklist for each feature:

- [ ] Phase 1: Requirements clarified and documented
- [ ] Phase 2: Failing tests written (unit tests + integration tests for network/database features)
- [ ] Phase 3: Minimal implementation (all unit tests green, all integration tests green)
- [ ] Phase 4: Refactored to clean, modular code (all tests still green)
- [ ] Phase 5: Final verification passed (BOTH unit and integration tests) AND **MANDATORY** `pr-reviewer` self-review complete
- [ ] Phase 6: Changes committed

---

## Important Reminders

⚠️ **NEVER skip writing tests first.**
⚠️ **NEVER implement without failing tests.**
⚠️ **NEVER refactor before tests pass.**
⚠️ **NEVER commit failing tests.**
⚠️ **ALWAYS run tests after changes.**
⚠️ **ALWAYS activate the `pr-reviewer` skill after tests pass, perform a review, and address all high/critical feedback.**
⚠️ **ALWAYS write BOTH unit tests AND integration tests for network/database features.**
⚠️ **ALWAYS run integration tests before considering a feature complete.**
⚠️ **ALWAYS clarify unclear requirements before coding.**

---

## Testing Guidelines

The project uses [Jest](https://jestjs.io/) for unit and integration testing and [Puppeteer](https://pptr.dev/) for end-to-end testing.

### Test Types: Unit vs Integration

**CRITICAL: Features with external dependencies (databases, APIs, real-time communication) require BOTH unit tests AND integration tests.**

#### Unit Tests (Mocked Dependencies)

- **Purpose**: Test individual methods and logic in isolation
- **File Location:** `[filename].test.js` (co-located with source files)
- **Running Tests:** `npm test`
- **When to Use:**
    - Testing individual methods and functions
    - Testing business logic without external dependencies
    - Fast feedback during development
    - Edge cases and error handling
- **Best Practices:**
    - Mock external dependencies (Supabase, network calls, etc.)
    - Use `jest.mock()` for module mocking
    - Fast execution (< 1 second per test suite)
    - Use `describe` to group related tests
    - Use `beforeEach` and `afterEach` for setup and teardown

#### Integration Tests (Real Dependencies)

- **Purpose**: Test actual communication with external systems (Supabase, databases, APIs)
- **File Location:** `e2e/[feature].integration.test.js` (in `e2e/` directory)
- **Running Tests:** `npm run test:e2e e2e/[feature].integration.test.js`
- **When to Use:**
    - **REQUIRED for network features** (session creation, join flow, real-time messaging, position updates)
    - Testing database queries and transactions
    - Testing Supabase Realtime channels
    - Testing actual message flow between clients
    - Verifying Row Level Security (RLS) policies
- **Setup Requirements:**
    - Requires running Supabase instance (`supabase start`)
    - Requires environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
    - May be slower than unit tests
- **Best Practices:**
    - Clean up test data after each test (delete sessions, players, etc.)
    - Use unique identifiers (UUIDs) to avoid conflicts
    - Test realistic scenarios (multiple clients, concurrent updates)
    - Verify both success and failure cases

#### TDD Workflow for Network Features

**Phase 2 (Write Tests) should include BOTH:**

1. **Unit Tests First**: Write mocked unit tests for individual methods
   - Test `sendMovementUpdate()` with mocked channel
   - Run: `npm test src/network.test.js`

2. **Integration Tests Second**: Write integration tests for real network flow
   - Test actual movement update flow through Supabase Realtime
   - Test multiple clients sending and receiving movement updates
   - Run: `npm run test:e2e e2e/network.integration.test.js`

**Phase 5 (Final Verification) must verify BOTH:**
- All unit tests pass: `npm test`
- All integration tests pass: `npm run test:e2e`

### Unit/Integration Tests (Jest)

- **Best Practices:**
    - Use `describe` to group related tests for a module or function.
    - Use `test` or `it` for individual test cases.
    - Use `beforeEach` and `afterEach` for setup and teardown.
    - Mock dependencies using `jest.mock()`.

### End-to-End Tests (Puppeteer)

- **Purpose**: For testing user interactions and visual output in a headless browser.
- **File Location**: E2E tests should be located in a separate `e2e/` directory.
- **Running Tests**: A separate command might be required, like `npm run test:e2e`.
- **Example:**
  ```javascript
  const puppeteer = require('puppeteer');

  describe('Game E2E', () => {
    let browser;
    let page;

    beforeAll(async () => {
      browser = await puppeteer.launch();
      page = await browser.newPage();
    });

    afterAll(() => browser.close());

    test('should load the game page correctly', async () => {
      // The path to index.html might need adjustment
      await page.goto('file://' + __dirname + '/../index.html');
      const title = await page.title();
      expect(title).toBe('EastVsWest');
    });
  });
  ```
## Tools
- use the `gh` cli to interact with issues, workflows, etc.
