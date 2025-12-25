# Source Code Structure

This directory contains the source code for **Conflict Zone: East vs West**.

## File Descriptions

- **config.js**: Game configuration constants including weapon stats, armor types, game settings, and input mappings based on GAME_DESIGN.md
- **main.js**: Application entry point that initializes the game and manages the game loop
- **game.js**: Core game logic including game state management, conflict zone mechanics, and game rules
- **renderer.js**: Canvas rendering system that draws the game state (players, conflict zone, loot)
- **input.js**: Input handler for keyboard, mouse, and touch controls (supports both desktop and mobile)
- **ui.js**: UI manager for screen transitions and HUD updates
- **network.js**: Network manager for multiplayer communication via Supabase
- **SessionPlayersSnapshot.js**: Real-time snapshot manager for session player state synchronization via Supabase Realtime

## Testing

- ***.test.js**: Unit and integration tests for corresponding modules
- **__mocks__/**: Mock files for testing (e.g., CSS imports)

## Architecture

See [ARCHITECTURE.md](../ARCHITECTURE.md) for detailed architecture information.
See [GAME_DESIGN.md](../GAME_DESIGN.md) for game design specifications.
