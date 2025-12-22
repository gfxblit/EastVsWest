# Network Layer Technical Design

**Version:** 1.0
**Date:** December 18, 2025
**Status:** Design Specification

## Table of Contents

1. [Overview](#overview)
2. [Supabase Schema Design](#supabase-schema-design)
3. [Channel Communication Protocol](#channel-communication-protocol)
4. [Data Flow for Host-Authority Model](#data-flow-for-host-authority-model)
5. [Implementation Considerations](#implementation-considerations)
6. [Security & Error Handling](#security--error-handling)

---

## Overview

### Architecture Model

The EastVsWest multiplayer system uses a **hybrid host-authority model** where:
- One player acts as both client and host (authoritative server)
- Real-time communication is powered by **Supabase Realtime** (PostgreSQL + WebSocket channels)
- Sessions are private and accessed via 6-character join codes
- Maximum 12 players per session

### Authoritative Action Flow

A core pattern for all host-authoritative actions (joining, combat, item pickups) follows a **Request-Approve-Broadcast** model:

1.  **Request (Client → Host):** A **Client** sends a message to the **Host** requesting to perform an action (e.g., `item_pickup_request`). The client does not change its own state yet.
2.  **Approve (Host):** The **Host** receives the request and validates it against the authoritative game state and rules. If valid, the Host applies the change to the master state (e.g., updates the Database).
3.  **Broadcast (Host → All Clients):** The **Host** broadcasts the result of the action (e.g., `item_pickup_result`) to **all Clients** in the session. Only upon receiving this broadcast do the clients update their local game state.

This ensures the Host is the single source of truth and prevents cheating.

### Authority Distribution

- **Client-Authoritative**: Player movement (position updates)
- **Host-Authoritative**: Item pickups, combat interactions, game state changes, zone progression

### Technology Stack

- **Database**: Supabase PostgreSQL
- **Real-time**: Supabase Realtime (WebSocket-based pub/sub)
- **Client**: Vanilla JavaScript (ES6 modules)
- **Authentication**: Anonymous auth with Supabase (no user accounts required)

---

## Supabase Schema Design

### Database Tables

#### 1. `game_sessions`

Stores active game sessions and their metadata.

```sql
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code VARCHAR(6) UNIQUE NOT NULL,
  host_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'lobby',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  max_players INTEGER DEFAULT 12,
  current_player_count INTEGER DEFAULT 1,

  -- Game state metadata
  game_phase VARCHAR(20) DEFAULT 'lobby',
  conflict_zone_radius REAL,
  conflict_zone_center_x REAL,
  conflict_zone_center_y REAL,

  -- Session expiry
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours'),

  CONSTRAINT valid_status CHECK (status IN ('lobby', 'active', 'ended')),
  CONSTRAINT valid_phase CHECK (game_phase IN ('lobby', 'deployment', 'combat', 'ended'))
);

-- Index for fast join code lookups
CREATE UNIQUE INDEX idx_join_code ON game_sessions(join_code);

-- Index for cleanup queries (expired sessions)
CREATE INDEX idx_expires_at ON game_sessions(expires_at);

-- Auto-delete expired sessions (cleanup job)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM game_sessions WHERE expires_at < NOW() AND status = 'ended';
END;
$$ LANGUAGE plpgsql;
```

#### 2. `session_players`

Tracks all players in a session with their connection state.

```sql
CREATE TABLE session_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  player_name VARCHAR(50) NOT NULL,
  is_host BOOLEAN DEFAULT FALSE,
  is_connected BOOLEAN DEFAULT TRUE,
  is_alive BOOLEAN DEFAULT TRUE,

  -- Player state
  position_x REAL DEFAULT 0,
  position_y REAL DEFAULT 0,
  rotation REAL DEFAULT 0,

  -- Equipment (nullable - players start with no equipment)
  equipped_weapon VARCHAR(50),
  equipped_armor VARCHAR(50),

  -- Stats
  kills INTEGER DEFAULT 0,
  damage_dealt REAL DEFAULT 0,

  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(session_id, player_id)
);

-- Index for fast player lookups within a session
CREATE INDEX idx_session_players ON session_players(session_id);

-- Index for host queries
CREATE INDEX idx_host_player ON session_players(session_id, is_host) WHERE is_host = TRUE;
```

#### 3. `session_items`

Tracks spawned items (weapons/armor) on the map.

```sql
CREATE TABLE session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL,
  item_name VARCHAR(50) NOT NULL,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  power_level INTEGER NOT NULL,
  is_picked_up BOOLEAN DEFAULT FALSE,
  picked_up_by UUID,
  picked_up_at TIMESTAMP WITH TIME ZONE,
  spawned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_item_type CHECK (item_type IN ('weapon', 'armor'))
);

-- Index for spatial queries (items in a session)
CREATE INDEX idx_session_items ON session_items(session_id, is_picked_up);
```

#### 4. `session_events`

Event log for debugging and replay functionality (optional but recommended).

```sql
CREATE TABLE session_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  player_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying events by session
CREATE INDEX idx_session_events ON session_events(session_id, created_at);
```

### Row Level Security (RLS) Policies

Enable RLS to ensure data isolation between sessions:

```sql
-- Enable RLS
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read sessions (to join via join code)
CREATE POLICY "Allow read access to game sessions"
  ON game_sessions FOR SELECT
  USING (TRUE);

-- Policy: Only host can update session
CREATE POLICY "Host can update session"
  ON game_sessions FOR UPDATE
  USING (auth.uid() = host_id);

-- Policy: Players can read data from their session
CREATE POLICY "Players can read session players"
  ON session_players FOR SELECT
  USING (
    session_id IN (
      SELECT session_id FROM session_players WHERE player_id = auth.uid()
    )
  );

-- Policy: Players can update their own data
CREATE POLICY "Players can update own data"
  ON session_players FOR UPDATE
  USING (player_id = auth.uid());

-- Similar policies for session_items and session_events
```

---

## Channel Communication Protocol

### Supabase Realtime Channels

Each game session uses a dedicated Realtime channel for pub/sub messaging.

#### Channel Naming Convention

```
game_session:{join_code}
```

Example: `game_session:ABC123`

### Message Types

All messages follow this base structure:

```javascript
{
  type: string,           // Message type identifier
  from: string,           // Sender player_id (UUID)
  timestamp: number,      // Unix timestamp in milliseconds
  data: object           // Message-specific payload
}
```

#### Message Type Catalog

##### 1. Connection Messages

**CLIENT → HOST: `player_join`**
```javascript
{
  type: 'player_join',
  from: 'player_uuid',
  timestamp: 1703001234567,
  data: {
    player_name: 'Player1',
    player_id: 'player_uuid'
  }
}
```

**HOST → ALL: `player_joined`**
```javascript
{
  type: 'player_joined',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    player_id: 'player_uuid',
    player_name: 'Player1',
    position: { x: 0, y: 0 },
    current_players: [
      { id: 'uuid1', name: 'Host', is_host: true },
      { id: 'uuid2', name: 'Player1', is_host: false }
    ]
  }
}
```

**CLIENT → HOST: `player_disconnect`**
```javascript
{
  type: 'player_disconnect',
  from: 'player_uuid',
  timestamp: 1703001234567,
  data: {
    reason: 'user_initiated' // or 'timeout', 'error'
  }
}
```

**HOST → ALL: `player_left`**
```javascript
{
  type: 'player_left',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    player_id: 'player_uuid',
    reason: 'disconnected'
  }
}
```

##### 2. Movement Messages (Client-Authoritative)

**CLIENT → HOST: `position_update`**
```javascript
{
  type: 'position_update',
  from: 'player_uuid',
  timestamp: 1703001234567,
  data: {
    position: { x: 123.45, y: 678.90 },
    rotation: 1.57,  // radians
    velocity: { x: 1.0, y: 0.0 }
  }
}
```

**HOST → ALL: `position_broadcast`**
```javascript
{
  type: 'position_broadcast',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    updates: [
      {
        player_id: 'uuid1',
        position: { x: 123.45, y: 678.90 },
        rotation: 1.57,
        velocity: { x: 1.0, y: 0.0 }
      },
      // ... more player updates
    ]
  }
}
```

##### 3. Interaction Messages (Host-Authoritative)

**CLIENT → HOST: `item_pickup_request`**
```javascript
{
  type: 'item_pickup_request',
  from: 'player_uuid',
  timestamp: 1703001234567,
  data: {
    item_id: 'item_uuid',
    player_position: { x: 100, y: 200 }
  }
}
```

**HOST → ALL: `item_pickup_result`**
```javascript
{
  type: 'item_pickup_result',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    success: true,
    player_id: 'player_uuid',
    item_id: 'item_uuid',
    item: {
      type: 'weapon',
      name: 'Spear',
      power_level: 5
    },
    dropped_item: {  // If player swapped equipment
      id: 'dropped_uuid',
      type: 'weapon',
      name: 'Fist',
      position: { x: 100, y: 200 }
    }
  }
}
```

**CLIENT → HOST: `attack_action`**
```javascript
{
  type: 'attack_action',
  from: 'player_uuid',
  timestamp: 1703001234567,
  data: {
    attack_type: 'basic',  // or 'special'
    direction: { x: 0.707, y: 0.707 },  // normalized vector
    position: { x: 100, y: 200 }
  }
}
```

**HOST → ALL: `combat_event`**
```javascript
{
  type: 'combat_event',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    attacker_id: 'player_uuid',
    target_id: 'target_uuid',  // or null for AoE
    attack_type: 'basic',
    weapon: 'Spear',
    damage: 25,
    hit: true,
    target_health: 75,
    target_eliminated: false
  }
}
```

**HOST → ALL: `player_eliminated`**
```javascript
{
  type: 'player_eliminated',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    eliminated_player_id: 'player_uuid',
    eliminated_by_id: 'killer_uuid',  // or null for zone damage
    cause: 'combat',  // or 'conflict_zone'
    dropped_items: [
      { id: 'item1', type: 'weapon', name: 'Spear', position: { x: 100, y: 200 } },
      { id: 'item2', type: 'armor', name: 'Chainmail', position: { x: 100, y: 200 } }
    ]
  }
}
```

##### 4. Game State Messages

**HOST → ALL: `game_start`**
```javascript
{
  type: 'game_start',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    players: [
      { id: 'uuid1', name: 'Player1', position: { x: 100, y: 100 } },
      // ...
    ],
    items: [
      { id: 'item1', type: 'weapon', name: 'Spear', position: { x: 200, y: 300 }, power_level: 5 },
      // ...
    ],
    conflict_zone: {
      center: { x: 500, y: 500 },
      radius: 1000
    }
  }
}
```

**HOST → ALL: `zone_update`**
```javascript
{
  type: 'zone_update',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    center: { x: 500, y: 500 },
    radius: 750,
    damage_per_second: 5,
    next_shrink_at: 1703001240000  // timestamp
  }
}
```

**HOST → ALL: `game_end`**
```javascript
{
  type: 'game_end',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    winner_id: 'player_uuid',
    winner_name: 'Player1',
    final_standings: [
      { player_id: 'uuid1', name: 'Player1', kills: 5, damage_dealt: 450, placement: 1 },
      { player_id: 'uuid2', name: 'Player2', kills: 3, damage_dealt: 320, placement: 2 },
      // ...
    ]
  }
}
```

##### 5. Heartbeat & Sync

**CLIENT → HOST: `heartbeat`**
```javascript
{
  type: 'heartbeat',
  from: 'player_uuid',
  timestamp: 1703001234567,
  data: {}
}
```

**HOST → SPECIFIC: `state_sync_request`**
```javascript
{
  type: 'state_sync_request',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    reason: 'reconnect'  // or 'desync_detected'
  }
}
```

**HOST → SPECIFIC: `full_state_sync`**
```javascript
{
  type: 'full_state_sync',
  from: 'host_uuid',
  timestamp: 1703001234567,
  data: {
    game_phase: 'combat',
    players: [ /* all player states */ ],
    items: [ /* all active items */ ],
    conflict_zone: { /* current zone */ },
    time_elapsed: 120000  // ms since game start
  }
}
```

### Message Flow Patterns

#### Pattern 1: Client-Authoritative Movement

```
Client A          Host              Other Clients
   |                |                     |
   |--position_---->|                     |
   |   update       |                     |
   |                |---position_-------->|
   |                |   broadcast         |
   |                |                     |
```

Host accepts position update and broadcasts to all clients (including sender for confirmation).

#### Pattern 2: Host-Authoritative Interaction

```
Client A          Host              Other Clients
   |                |                     |
   |--item_pickup-->|                     |
   |   request      |                     |
   |                |                     |
   |                | [Validates]          |
   |                | [Updates DB]         |
   |                |                     |
   |<--item_pickup--|                     |
   |   result       |                     |
   |                |---item_pickup------>|
   |                |   result            |
```

Host validates request, updates authoritative state, then broadcasts result.

---

## Data Flow for Host-Authority Model

### Session Lifecycle

```
┌─────────────┐
│   LOBBY     │  Players join via join code
│   PHASE     │  Host can start game when ready
└──────┬──────┘
       │ Host clicks "Start Game"
       ↓
┌─────────────┐
│ DEPLOYMENT  │  Players spawn at random positions
│   PHASE     │  Items spawn on map
└──────┬──────┘  Conflict zone initialized
       │ Automatic transition (2-3 seconds)
       ↓
┌─────────────┐
│   COMBAT    │  Main gameplay loop
│   PHASE     │  Position updates (60Hz)
└──────┬──────┘  Interaction requests (on-demand)
       │          Zone updates (periodic)
       │ Only 1 player alive OR timeout
       ↓
┌─────────────┐
│    ENDED    │  Winner declared
│   PHASE     │  Final statistics shown
└─────────────┘  Host can start next game
```

### Detailed Data Flow: Game Start

```
HOST                          SUPABASE                      CLIENTS
 │                               │                              │
 │ 1. User clicks "Start Game"   │                              │
 │                               │                              │
 │ 2. Update session status      │                              │
 ├──UPDATE game_sessions────────>│                              │
 │   SET status='active'         │                              │
 │   SET started_at=NOW()        │                              │
 │                               │                              │
 │ 3. Generate spawn positions   │                              │
 │ 4. Generate item spawns       │                              │
 │                               │                              │
 │ 5. Insert items to DB         │                              │
 ├──INSERT session_items────────>│                              │
 │   (bulk insert)               │                              │
 │                               │                              │
 │ 6. Broadcast game_start       │                              │
 ├──PUBLISH to channel──────────>│──────game_start──────────────>│
 │   {players, items, zone}      │                              │
 │                               │                              │
 │                               │                              │ 7. Clients receive
 │                               │                              │    Initialize game state
 │                               │                              │    Render initial state
 │                               │                              │
```

### Detailed Data Flow: Position Update (Client-Authoritative)

```
CLIENT A          SUPABASE CHANNEL          HOST              OTHER CLIENTS
   │                    │                     │                    │
   │ 1. Player moves    │                     │                    │
   │    (WASD input)    │                     │                    │
   │                    │                     │                    │
   │ 2. Publish update  │                     │                    │
   ├──position_update──>│                     │                    │
   │   (60 Hz)          │                     │                    │
   │                    │                     │                    │
   │                    │ 3. Forward to host  │                    │
   │                    ├──position_update───>│                    │
   │                    │                     │                    │
   │                    │                     │ 4. Update local    │
   │                    │                     │    state for       │
   │                    │                     │    player A        │
   │                    │                     │                    │
   │                    │ 5. Broadcast        │                    │
   │                    │<──position_─────────┤                    │
   │                    │   broadcast         │                    │
   │                    │   (all positions)   │                    │
   │                    │                     │                    │
   │ 6. Receive update  │                     │ 7. Receive update  │
   │    (confirmation)  │                     │    (other players) │
   │<──position_────────┤                     ├──position_────────>│
   │   broadcast        │                     │   broadcast        │
   │                    │                     │                    │
```

**Frequency**: 60 Hz (every ~16ms)
**Optimization**: Host batches position updates and sends one broadcast per tick containing all player positions.

### Detailed Data Flow: Item Pickup (Host-Authoritative)

```
CLIENT A          SUPABASE CHANNEL          HOST              DATABASE
   │                    │                     │                    │
   │ 1. Player walks    │                     │                    │
   │    over item       │                     │                    │
   │                    │                     │                    │
   │ 2. Detect overlap  │                     │                    │
   │    (local check)   │                     │                    │
   │                    │                     │                    │
   │ 3. Request pickup  │                     │                    │
   ├──item_pickup_─────>│                     │                    │
   │   request          │                     │                    │
   │                    │                     │                    │
   │                    │ 4. Forward request  │                    │
   │                    ├──item_pickup_──────>│                    │
   │                    │   request           │                    │
   │                    │                     │                    │
   │                    │                     │ 5. Validate:       │
   │                    │                     │    - Item exists?  │
   │                    │                     │    - Not picked?   │
   │                    │                     │    - In range?     │
   │                    │                     │                    │
   │                    │                     │ 6. Update DB       │
   │                    │                     ├─UPDATE session_────>│
   │                    │                     │  items SET         │
   │                    │                     │  is_picked_up=true │
   │                    │                     │                    │
   │                    │                     │ 7. Update player   │
   │                    │                     ├─UPDATE session_────>│
   │                    │                     │  players SET       │
   │                    │                     │  equipped_weapon   │
   │                    │                     │                    │
   │                    │                     │ 8. If swapping     │
   │                    │                     │    equipment:      │
   │                    │                     │    Insert new item │
   │                    │                     ├─INSERT session_────>│
   │                    │                     │  items (dropped)   │
   │                    │                     │                    │
   │                    │ 9. Broadcast result │                    │
   │                    │<──item_pickup_──────┤                    │
   │                    │   result            │                    │
   │                    │                     │                    │
   │ 10. Update UI      │                     │                    │
   │     (equip item)   │                     │                    │
   │<──item_pickup_─────┤                     │                    │
   │   result           │                     │                    │
```

**Validation Rules** (enforced by host):
- Item must exist in `session_items` with `is_picked_up = false`
- Distance between player position and item position < pickup_radius (e.g., 20 pixels)
- Player is alive (`is_alive = true`)

**Conflict Resolution**: If multiple clients request the same item simultaneously, host processes requests in the order received. First valid request wins, subsequent requests receive `success: false`.

### Detailed Data Flow: Combat Interaction

```
CLIENT (Attacker)      CHANNEL          HOST           DATABASE       CLIENTS (Others)
      │                   │               │                │                 │
      │ 1. Player attacks │               │                │                 │
      │    (mouse click)  │               │                │                 │
      │                   │               │                │                 │
      │ 2. Send action    │               │                │                 │
      ├──attack_action───>│               │                │                 │
      │                   │               │                │                 │
      │                   │ 3. Forward    │                │                 │
      │                   ├──attack_──────>│                │                 │
      │                   │   action      │                │                 │
      │                   │               │                │                 │
      │                   │               │ 4. Validate:   │                 │
      │                   │               │   - In range?  │                 │
      │                   │               │   - Has weapon?│                 │
      │                   │               │   - Target     │                 │
      │                   │               │     alive?     │                 │
      │                   │               │                │                 │
      │                   │               │ 5. Calculate:  │                 │
      │                   │               │   - Damage     │                 │
      │                   │               │   - Hit/miss   │                 │
      │                   │               │   - Armor      │                 │
      │                   │               │     reduction  │                 │
      │                   │               │                │                 │
      │                   │               │ 6. Update HP   │                 │
      │                   │               ├─UPDATE session_┼────────────────>│
      │                   │               │  players       │                 │
      │                   │               │                │                 │
      │                   │               │ 7. If killed:  │                 │
      │                   │               │    Mark dead,  │                 │
      │                   │               │    drop items  │                 │
      │                   │               ├─UPDATE/INSERT──┼────────────────>│
      │                   │               │                │                 │
      │                   │ 8. Broadcast  │                │                 │
      │                   │<──combat_─────┤                │                 │
      │                   │   event       │                │                 │
      │                   │               │                │                 │
      │ 9. Play effects   │               │                │ 10. Play effects│
      │    (animation)    │               │                │     (for all)   │
      │<──combat_event────┤               │                │<────combat_─────┤
      │                   │               │                │     event       │
```

**Damage Calculation** (performed by host):
```javascript
baseDamage = weapon.damage * weapon.powerLevel
damageMultiplier = armor.getReduction(weapon.damageType)  // 0.0 to 1.0
finalDamage = baseDamage * (1 - damageMultiplier)
```

### Host Responsibilities Summary

The host must maintain authoritative state and process:

1. **Session Management**
   - Create session with join code
   - Accept/reject join requests (max 12 players)
   - Track connected players
   - Handle disconnections and timeouts

2. **Game State Management**
   - Initialize game state (spawn positions, items)
   - Manage conflict zone progression
   - Track all player stats (health, kills, equipment)
   - Track all item states (spawned, picked up, dropped)

3. **Position Updates** (Client-Authoritative)
   - Receive position updates from all clients
   - Validate positions (basic sanity checks, no teleporting)
   - Broadcast aggregated positions to all clients

4. **Interaction Validation** (Host-Authoritative)
   - Validate item pickup requests (range, availability)
   - Validate combat actions (range, weapon equipped, target alive)
   - Calculate damage and health changes
   - Detect eliminations
   - Spawn dropped items from eliminated players

5. **Persistence**
   - Update database with authoritative state changes
   - Log events for debugging/replay

6. **Broadcasting**
   - Send state updates to all connected clients
   - Handle late-join state synchronization

### Client Responsibilities Summary

Each client (including the host's client instance) must:

1. **Local Input Handling**
   - Capture user input (movement, attacks, pickup attempts)
   - Immediately update local player position (client-prediction)
   - Send position updates to host (60 Hz)
   - Send interaction requests to host (on-demand)

2. **Remote State Rendering**
   - Receive position broadcasts from host
   - Interpolate other players' positions for smooth rendering
   - Receive and apply interaction results (item pickups, combat)
   - Render game state (players, items, conflict zone)

3. **UI Updates**
   - Display player inventory/equipment
   - Show game stats (kills, remaining players)
   - Show conflict zone warnings
   - Display spectator UI when eliminated

4. **Error Handling**
   - Handle network disconnections
   - Request state sync if desynced
   - Show connection status to user

### Conflict Zone Data Flow

```
HOST (Every 5 seconds)
  │
  │ 1. Calculate new zone
  │    - Shrink radius
  │    - Increase damage
  │
  │ 2. Identify players outside zone
  │
  │ 3. Apply zone damage to those players
  │
  ├──UPDATE session_players (health)────> DATABASE
  │
  │ 4. Broadcast zone update
  │
  ├──zone_update──> CHANNEL ──> ALL CLIENTS
  │
  │ 5. If any players eliminated by zone:
  │
  ├──player_eliminated──> CHANNEL ──> ALL CLIENTS
```

---

## Implementation Considerations

### Latency & Client Prediction

**Movement**: Clients immediately update their own position locally (client prediction) and send updates to the host. The host's broadcast serves as confirmation and sync point. If the host detects a significant deviation (anti-cheat), it can send a corrective `position_correction` message.

**Interactions**: Clients can show optimistic UI feedback (e.g., item pickup animation) but must wait for host confirmation before actually applying the state change. If the host rejects the action, the client must rollback the optimistic update.

### Message Rate Limiting

- **Position updates**: Maximum 60 Hz per client (every ~16ms)
- **Heartbeats**: Every 5 seconds
- **Host broadcasts**: Batched position updates at 60 Hz, other state changes sent immediately

### Database vs. Realtime Channel

| Data | Storage | Rationale |
|------|---------|-----------|
| Session metadata | Database | Persistent, required for join code lookups |
| Player list | Database + Channel | Database for persistence, Channel for real-time |
| Player positions | Channel only | High-frequency, ephemeral data |
| Item states | Database + Channel | Database for authority, Channel for sync |
| Combat events | Channel + Events log | Real-time sync, optional event log for debugging |
| Game state changes | Database + Channel | Database for authority, Channel for sync |

### Scalability Considerations

**Current Design (Phase 1)**:
- 12 players per session
- Estimated message rate: ~720 position updates/second (12 players * 60 Hz)
- Supabase Realtime can handle this easily

**Future Scaling** (if needed):
- Use Supabase's built-in connection pooling
- Implement message compression for position updates
- Consider delta compression (send only changed values)
- Add regional database replicas for global players

### State Synchronization for Late Joiners

When a player joins mid-game (if allowed) or reconnects after disconnect:

1. Client sends `join_game` request with join code
2. Host validates player can join
3. Host sends `full_state_sync` message to the joining client
4. Client reconstructs game state from sync data
5. Client enters game and starts normal message flow

---

## Security & Error Handling

### Security Measures

1. **Join Code Security**
   - 6-character alphanumeric codes (36^6 = 2.1 billion combinations)
   - Single-use codes (deleted when session ends)
   - Short expiry (2 hours max session length)

2. **Row Level Security (RLS)**
   - Players can only read/write data for their own session
   - Host has elevated permissions for their session
   - Anonymous auth prevents account-based attacks

3. **Input Validation** (Host-side)
   - Validate all interaction requests (range checks, state checks)
   - Sanitize position updates (prevent teleporting)
   - Rate limit message processing (prevent spam)

4. **Cheating Prevention** (Basic)
   - Host validates all authoritative actions
   - Position updates sanity-checked (max speed limits)
   - Combat calculations done server-side (host)
   - Event logging for post-game analysis

### Error Handling

**Network Errors**:
- Retry failed database operations (3 attempts with exponential backoff)
- Client timeout detection (no heartbeat for 15 seconds)
- Auto-reconnect with state sync for temporary disconnects
- Graceful degradation if host disconnects (end game, notify all)

**State Desyncs**:
- Clients can request `full_state_sync` if they detect inconsistencies
- Host periodically sends `heartbeat` to verify client connections
- Database serves as source of truth for conflict resolution

**Game Flow Errors**:
- Validate phase transitions (can't start game from 'ended' state)
- Validate player counts (can't start with <2 players)
- Handle edge cases (all players disconnect simultaneously)

### Monitoring & Debugging

**Event Logging**: The `session_events` table provides:
- Full replay capability
- Debugging tools for reported issues
- Anti-cheat analysis
- Performance metrics

**Health Checks**:
- Track message latency (timestamp comparison)
- Monitor connection states (heartbeat tracking)
- Alert on abnormal patterns (excessive disconnects, message spam)

---

## Appendix: Message Flow Diagrams

### Full Game Lifecycle

```
┌──────────┐
│  LOBBY   │
│          │  Host creates session
│          │  Players join via code
│          │
│  Events: │  • player_join
│          │  • player_joined
└────┬─────┘  • player_left
     │
     │ host sends: game_start
     ↓
┌──────────┐
│DEPLOYMENT│
│          │  Players spawn
│  Events: │  • game_start (full state)
└────┬─────┘
     │
     │ automatic transition
     ↓
┌──────────┐
│  COMBAT  │
│          │  Main gameplay loop
│          │
│  Events: │  • position_update (60 Hz)
│          │  • position_broadcast (60 Hz)
│          │  • item_pickup_request
│          │  • item_pickup_result
│          │  • attack_action
│          │  • combat_event
│          │  • player_eliminated
│          │  • zone_update (periodic)
│          │  • heartbeat (5s)
└────┬─────┘
     │
     │ only 1 player alive
     ↓
┌──────────┐
│  ENDED   │
│          │  Winner declared
│          │  Stats displayed
│  Events: │  • game_end
│          │  • player_left (cleanup)
└──────────┘
```

---

## Next Steps for Implementation

1. **Phase 1.1**: Supabase Project Setup
   - Create Supabase project
   - Run schema SQL scripts
   - Configure RLS policies
   - Set up anonymous authentication

2. **Phase 1.2**: Network Module Implementation
   - Install `@supabase/supabase-js` dependency
   - Implement `network.js` with Supabase client
   - Create session management (host/join)
   - Implement channel subscription

3. **Phase 1.3**: Message Handlers
   - Implement message sending/receiving
   - Create message type handlers
   - Add position update batching (60 Hz)

4. **Phase 1.4**: Integration with Game Logic
   - Connect `game.js` to network events
   - Implement client-authoritative movement
   - Implement host-authoritative interactions

5. **Phase 1.5**: Testing & Validation
   - Unit tests for network module
   - Integration tests for message flows
   - End-to-end tests with multiple clients
   - Latency and performance testing

---

**Document Version**: 1.0
**Last Updated**: December 18, 2025
**Status**: Ready for Implementation
