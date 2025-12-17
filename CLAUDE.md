# Test-Driven Development Workflow for SnakeClaude

## Overview
This workflow enforces strict Test-Driven Development (TDD) for the SnakeClaude game using Jest for unit/integration tests and Puppeteer for end-to-end tests. Follow each phase sequentially.

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

**Process:**
1. Create or locate the test file. By convention, for a file like `game.js`, the test file will be `game.test.js`.
2. Write tests that verify ALL requirements:
   - One test per acceptance criterion.
   - Use descriptive test names: `When[Condition]_Should[ExpectedBehavior]`.
   - Test edge cases and error conditions.
   - Tests MUST fail initially (no implementation exists yet).
3. **Run tests using `npm test` to confirm they fail.**
4. Verify failure messages are clear and helpful.

**Example Jest Test Structure:**
```javascript
import { aFunction } from './game.js';

describe('aFunction', () => {
  test('WhenCondition_ShouldDoSomething', () => {
    // Arrange
    const input = // ...
    
    // Act
    const result = aFunction(input);

    // Assert
    expect(result).toEqual(/* expected outcome */);
  });
});
```

**Exit Criteria:**
- All tests written and documented.
- All tests fail with clear error messages.
- Test run output confirmed.

---

## Phase 3: Implement Minimum Code

**Process:**
1. Write the **simplest possible code** in the corresponding module (`game.js`, `renderer.js`, etc.) to make ONE test pass.
2. No premature optimization or extra features.
3. Hard-code values if necessary (will refactor later).
4. **Run tests after each change:**
   ```bash
   npm test
   ```
5. If a test passes, commit that change.
6. Move to the next failing test.
7. Repeat until ALL tests pass.

**Rules:**
- ❌ Do NOT add features not required by tests.
- ❌ Do NOT refactor yet (that's Phase 4).
- ✅ DO use the simplest solution.
- ✅ DO make incremental changes.
- ✅ DO verify each test individually.

**Exit Criteria:** ALL tests pass (green).

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
   - **Run all tests:**
     ```bash
     npm test
     ```
   - Ensure all tests still pass.
   - If tests fail, revert the refactor.
4. Commit each successful refactor separately.

**Exit Criteria:**
- Clean, modular implementation.
- All tests still passing.
- Code follows project best practices.

---

## Phase 5: Final Verification

**Process:**
1. **Run the complete test suite one final time:**
   ```bash
   npm test
   ```
2. Verify all tests pass.
3. Review test coverage:
   - All requirements tested?
   - Edge cases covered?
   - Error conditions handled?
4. If gaps are found, return to Phase 2.

**Exit Criteria:**
- 100% of requirements have passing tests.
- No test failures.
- Code is clean and refactored.

---

## Phase 6: Commit Changes to a branch and Push to Origin

**Process:**
1. Commit all changes with descriptive messages:
   ```
   test: Add tests for [feature]
   feat: Implement [feature] with TDD approach
   refactor: Simplify [component] logic
   ```
   The committed changes will be available on the current branch. Push to origin. A human is then responsible for creating a Pull Request for review.

**Exit Criteria:** Changes committed with descriptive messages.

---

## TDD Workflow Checklist

Use this checklist for each feature:

- [ ] Phase 1: Requirements clarified and documented
- [ ] Phase 2: Failing tests written (all requirements covered)
- [ ] Phase 3: Minimal implementation (all tests green)
- [ ] Phase 4: Refactored to clean, modular code
- [ ] Phase 5: Final verification passed
- [ ] Phase 6: Changes committed

---

## Important Reminders

⚠️ **NEVER skip writing tests first.**
⚠️ **NEVER implement without failing tests.**
⚠️ **NEVER refactor before tests pass.**
⚠️ **NEVER commit failing tests.**
⚠️ **ALWAYS run tests after changes.**
⚠️ **ALWAYS clarify unclear requirements before coding.**

---

## Testing Guidelines

The project uses [Jest](https://jestjs.io/) for unit and integration testing and [Puppeteer](https://pptr.dev/) for end-to-end testing.

### Unit/Integration Tests (Jest)

- **File Location:** `[filename].test.js`.
- **Running Tests:** `npm test`
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

  describe('Snake Game E2E', () => {
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
      expect(title).toBe('SnakeClaude');
    });
  });
  ```
## Tools
- use the `gh` cli to interact with issues, workflows, etc.