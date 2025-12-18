# Game Session API

REST API client for managing game sessions in Supabase.

## Quick Start

### 1. Set up Supabase

Follow the [SUPABASE_SETUP.md](../SUPABASE_SETUP.md) guide to:
- Create the `game_sessions` table
- Get your Supabase credentials
- Set environment variables

### 2. Run the Manual Test

```bash
SUPABASE_URL=your_url SUPABASE_KEY=your_key node src/testGameSessionAPI.js
```

Or with a .env file:

```bash
npm install dotenv
node -r dotenv/config src/testGameSessionAPI.js
```

### 3. Run Jest Tests

```bash
export SUPABASE_URL=your_url
export SUPABASE_KEY=your_key
npm test src/gameSession.test.js
```

## API Reference

### `GameSessionAPI`

Client for interacting with the game_sessions table via Supabase REST API.

#### Constructor

```javascript
import { GameSessionAPI } from './gameSession.js';

const api = new GameSessionAPI(supabaseUrl, supabaseKey);
```

#### Methods

##### `createGameSession(hostId, joinCode)`

Creates a new game session.

```javascript
const session = await api.createGameSession(
  '123e4567-e89b-12d3-a456-426614174000', // hostId (UUID)
  'ABC123' // joinCode (6 characters)
);

// Returns:
// {
//   id: 'uuid',
//   join_code: 'ABC123',
//   host_id: 'uuid',
//   status: 'lobby',
//   game_phase: 'lobby',
//   max_players: 12,
//   current_player_count: 1,
//   created_at: '2025-01-01T00:00:00Z',
//   expires_at: '2025-01-01T02:00:00Z',
//   ...
// }
```

##### `getGameSession(joinCode)`

Retrieves a session by join code.

```javascript
const session = await api.getGameSession('ABC123');
// Returns session object or null if not found
```

##### `updateGameSession(sessionId, updates)`

Updates a session's fields.

```javascript
const updated = await api.updateGameSession(sessionId, {
  status: 'active',
  started_at: new Date().toISOString(),
  conflict_zone_radius: 600
});
```

##### `deleteGameSession(sessionId)`

Deletes a session.

```javascript
await api.deleteGameSession(sessionId);
```

## Schema

See [NETWORK_DESIGN.md](../NETWORK_DESIGN.md) for the complete database schema and architecture.

### game_sessions Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | auto | Primary key |
| `join_code` | VARCHAR(6) | required | Unique 6-character code |
| `host_id` | UUID | required | Host player UUID |
| `status` | VARCHAR(20) | 'lobby' | 'lobby', 'active', or 'ended' |
| `game_phase` | VARCHAR(20) | 'lobby' | 'lobby', 'deployment', 'combat', 'ended' |
| `max_players` | INTEGER | 12 | Maximum players allowed |
| `current_player_count` | INTEGER | 1 | Current number of players |
| `conflict_zone_radius` | REAL | null | Current conflict zone radius |
| `conflict_zone_center_x` | REAL | null | Conflict zone center X coordinate |
| `conflict_zone_center_y` | REAL | null | Conflict zone center Y coordinate |
| `created_at` | TIMESTAMP | NOW() | Session creation time |
| `started_at` | TIMESTAMP | null | Game start time |
| `ended_at` | TIMESTAMP | null | Game end time |
| `expires_at` | TIMESTAMP | NOW() + 2h | Session expiration time |

## Testing

### Unit Tests

The Jest test suite (`gameSession.test.js`) includes tests for:

- ✅ Creating sessions with valid data
- ✅ Default values (status, player count, timestamps)
- ✅ Unique join code constraint
- ✅ Getting sessions by join code
- ✅ Updating session fields
- ✅ Deleting sessions

### Manual Testing

The manual test script (`testGameSessionAPI.js`) performs end-to-end testing:

1. Creates a session with a random join code
2. Retrieves the session by join code
3. Updates session status and conflict zone data
4. Tests retrieving non-existent sessions
5. Deletes the session and verifies deletion

## Error Handling

All API methods throw errors with descriptive messages:

```javascript
try {
  await api.createGameSession(hostId, joinCode);
} catch (error) {
  console.error('Failed to create session:', error.message);
  // Error: Failed to create session: {"message":"duplicate key value..."}
}
```

Common errors:
- Duplicate join code (unique constraint violation)
- Invalid UUID format
- Missing required fields
- Network/connection issues
- Invalid Supabase credentials

## Next Steps

This API currently only handles the `game_sessions` table. Future work includes:

1. Implement `SessionPlayersAPI` for managing players in sessions
2. Implement `SessionItemsAPI` for managing items in sessions
3. Implement `SessionEventsAPI` for event logging
4. Add Supabase Realtime channel integration
5. Integrate with the Network class for full multiplayer support
