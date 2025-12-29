### Refactoring Update: Velocity Synchronization & E2E Test Fixes

The transition to client-authoritative velocity synchronization is now complete across the entire codebase and documentation.

#### Changes Implemented:
- **Core Logic:** Updated `src/main.js` to utilize `startPeriodicMovementWrite`, incorporating real-time velocity data.
- **Database:** Reset local Supabase instance to apply schema changes (`velocity_x`, `velocity_y` columns in `session_players`).
- **Scripts:** Updated `scripts/player-repl.js` to use the refactored movement update methods.
- **Documentation:** Synchronized `NETWORK_DESIGN.md` and `CLAUDE.md` with new naming conventions (`movement_update`, `startPeriodicMovementWrite`) and updated architectural diagrams.

#### E2E Test Fixes (`e2e/camera.integration.test.js`):
- **Server-Based Testing:** Migrated from `file://` to Vite dev server to support ES modules.
- **Viewport Consistency:** Set viewport to 1200x800 to align with world-clamping logic.
- **Spawn Logic Reconcilliation:** Added center-map teleportation in `beforeEach` to ensure consistent starting state for camera follow tests.
- **Timing Improvements:** Increased movement durations to ensure edge-clamping thresholds are reliably reached.

#### Verification:
- Successfully executed all E2E tests via `e2e/run_e2e.sh`.
- **Results:** 8 test suites passed, 63 tests total.
