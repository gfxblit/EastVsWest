# Network Layer Technical Design

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

A core pattern for **Host-Authoritative** actions (combat, item pickups, game state transitions) follows a **Request-Approve-Broadcast** model:

1.  **Request (Client → Host):** A **Client** sends a message to the **Host** requesting to perform an action.
2.  **Approve (Host):** The **Host** validates the request. If valid, the Host applies the change to the master state (Database) and broadcasts updates.
3.  **Broadcast (Host → All Clients):** The **Host** broadcasts the result to **all Clients**.

**Client-Authoritative** actions follow a **Tell-Broadcast** or **Self-Insert** model:

-   **Movement:** The **Client** moves locally and sends a `player_state_update` directly to peers.
-   **Joining:** The **Client** fetches the session via join code and self-inserts into `session_players`. The **Host** monitors the table to enforce `max_players` and reconcile state.

### Authority Distribution

- **Client-Authoritative**: Player movement, session joining (lobby phase), player position DB writes
- **Host-Authoritative**: Item pickups, combat interactions, health/equipment state, game state changes, zone progression, player eviction (max count enforcement)

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

  -- Game state metadata
  game_phase VARCHAR(20) DEFAULT 'lobby',
  conflict_zone_radius REAL,
  conflict_zone_center_x REAL,
  conflict_zone_center_y REAL,

  -- Session expiry
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours'),

  -- Realtime channel name, to be derived from the join code
  realtime_channel_name VARCHAR(255) UNIQUE,

  CONSTRAINT valid_status CHECK (status IN ('lobby', 'active', 'ended')),
  CONSTRAINT valid_phase CHECK (game_phase IN ('lobby', 'deployment', 'combat', 'ended'))
);

-- Index for fast join code lookups
CREATE UNIQUE INDEX idx_join_code ON game_sessions(join_code);

-- Index for cleanup queries (expired sessions)
CREATE INDEX idx_expires_at ON game_sessions(expires_at);
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
  velocity_x REAL DEFAULT 0,
  velocity_y REAL DEFAULT 0,
  rotation REAL DEFAULT 0,
  health REAL DEFAULT 100,

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

---

## Channel Communication Protocol

### Supabase Realtime Channels

Each game session uses a dedicated Realtime channel for pub/sub messaging.

#### Channel Naming Convention

```
game_session:{join_code}
```

The exact channel name is stored in the `game_sessions.realtime_channel_name` field for robustness.

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

#### 1. Connection & Lobby Flow

Joining is **Client-Authoritative** via Database Inserts.

1.  **Join:** Client calls `get_session_by_join_code` RPC to get `session_id`.
2.  **Insert:** Client performs `INSERT` into `session_players` with their metadata.

**DB INSERT (Client): `session_players`**
Supabase Realtime sends `INSERT` / `DELETE` events to all subscribed clients. This is the primary way the lobby list is kept in sync.

#### 2. Player State Updates (Client & Host)

**BROADCAST: `player_state_update`**

Used for both high-frequency movement updates (Client-Authoritative) and state changes like health/equipment (Host-Authoritative).

```javascript
{
  type: 'player_state_update',
  from: 'player_uuid',
  timestamp: 1703001234567,
  data: {
    // Client-Authoritative fields (sent by owner)
    position_x: 123.45,
    position_y: 678.90,
    rotation: 1.57,
    velocity_x: 1.0,
    velocity_y: 0.0,

    // Host-Authoritative fields (sent by host)
    health: 95.5,
    equipped_weapon: 'sword',
    equipped_armor: 'chainmail',
    kills: 3
  }
}
```

#### 3. Interaction Messages (Host-Authoritative)

**CLIENT → HOST: `pickup_request`**
```javascript
{
  type: 'pickup_request',
  from: 'player_uuid',
  data: {
    loot_id: 'loot-1'
  }
}
```

**HOST → ALL: `loot_picked_up`**
(Signifies the item is removed from the world. The equipment change comes via `player_state_update`)
```javascript
{
  type: 'loot_picked_up',
  from: 'host_uuid',
  data: {
    loot_id: 'loot-1',
    player_id: 'player_uuid'
  }
}
```

**CLIENT → HOST: `attack_request`**
```javascript
{
  type: 'attack_request',
  from: 'player_uuid',
  data: {
    weapon_id: 'sword',
    aim_x: 100,
    aim_y: 200,
    is_special: false
  }
}
```

**HOST → ALL: `player_death`**
```javascript
{
  type: 'player_death',
  from: 'host_uuid',
  data: {
    victim_id: 'player_uuid',
    killer_id: 'killer_uuid'
  }
}
```

#### 4. Loot Management

**HOST → ALL: `loot_spawned`**
```javascript
{
  type: 'loot_spawned',
  from: 'host_uuid',
  data: {
    id: 'loot-1',
    item_id: 'sword',
    type: 'weapon',
    x: 100,
    y: 100
  }
}
```

**HOST → SPECIFIC: `loot_sync`**
(Full list of active loot, sent to new joiners)
```javascript
{
  type: 'loot_sync',
  from: 'host_uuid',
  data: {
    loot: [ { id: 'loot-1', ... } ],
    target_player_id: 'new_player_uuid'
  }
}
```

**CLIENT → HOST: `request_loot_sync`**
Used by clients to request current loot state upon joining.

#### 5. Game State Lifecycle

**HOST → ALL: `game_start`**

**HOST → ALL: `game_over`**
```javascript
{
  type: 'game_over',
  from: 'host_uuid',
  data: {
    winner_id: 'player_uuid',
    stats: [ ... ]
  }
}
```

**HOST → ALL: `session_terminated`**
(Sent when host leaves)

---

## Data Flow for Host-Authority Model

### Detailed Data Flow: Movement Update (Client-Authoritative)

```
CLIENT A          SUPABASE CHANNEL          HOST              OTHER CLIENTS
   │                    │                     │                    │
   │ 1. Player moves    │                     │                    │
   │    (WASD input)    │                     │                    │
   │                    │                     │                    │
   │ 2. Publish update  │                     │                    │
   ├──player_state_────>│                     │                    │
   │   update           │                     │                    │
   │                    │                     │                    │
   │                    │ 3. Broadcast to all │                    │
   │                    │<──player_state_─────┼───────────────────>│
   │                    │   update            │                    │
   │                    │                     │                    │
   │ 4. Receive update  │                     │ 5. Receive update  │
   │    (confirmation)  │                     │    (other players) │
   │<──player_state_────┤                     ├──player_state_────>│
   │   update           │                     │   update           │
   │                    │                     │                    │
```

**Frequency**: 20 Hz (every ~50ms)
**Architecture**: Direct client broadcasting - each client broadcasts their own state updates directly to all peers.

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
   ├──pickup_request───>│                     │                    │
   │                    │                     │                    │
   │                    │ 4. Forward request  │                    │
   │                    ├──pickup_request────>│                    │
   │                    │                     │                    │
   │                    │                     │ 5. Validate:       │
   │                    │                     │    - Item exists?  │
   │                    │                     │    - Not picked?   │
   │                    │                     │    - In range?     │
   │                    │                     │                    │
   │                    │                     │ 6. Update DB       │
   │                    │                     ├─UPDATE session_────>│
   │                    │                     │  players SET       │
   │                    │                     │  equipped_weapon   │
   │                    │                     │                    │
   │                    │                     │ 7. Broadcast result│
   │                    │<──player_state_─────┤                    │
   │                    │   update            │                    │
   │                    │   (equipment)       │                    │
   │                    │                     │                    │
   │                    │<──loot_picked_up────┤                    │
   │                    │   (remove item)     │                    │
   │                    │                     │                    │
   │ 10. Update UI      │                     │                    │
   │     (equip item)   │                     │                    │
   │<──(both messages)──┤                     │                    │
   │                    │                     │                    │
```

### Detailed Data Flow: Combat Interaction

```
CLIENT (Attacker)      CHANNEL          HOST           DATABASE       CLIENTS (Others)
      │                   │               │                │                 │
      │ 1. Player attacks │               │                │                 │
      │    (mouse click)  │               │                │                 │
      │                   │               │                │                 │
      │ 2. Send request   │               │                │                 │
      ├──attack_request──>│               │                │                 │
      │                   │               │                │                 │
      │                   │ 3. Forward    │                │                 │
      │                   ├──attack_──────>│                │                 │
      │                   │   request     │                │                 │
      │                   │               │                │                 │
      │                   │               │ 4. Validate:   │                 │
      │                   │               │   - In range?  │                 │
      │                   │               │   - Has weapon?│                 │
      │                   │               │   - Target     │                 │
      │                   │               │     alive?     │                 │
      │                   │               │                │                 │
      │                   │               │ 5. Calculate:  │                 │
      │                   │               │   - Damage     │                 │
      │                   │               │                │                 │
      │                   │               │ 6. Update HP   │                 │
      │                   │               ├─UPDATE session_┼────────────────>│
      │                   │               │  players       │                 │
      │                   │               │  (periodic)    │                 │
      │                   │               │                │                 │
      │                   │               │ 7. Broadcast   │                 │
      │                   │<──player_state_─────┤                 │                 │
      │                   │   update (health)   │                 │                 │
      │                   │                     │                 │                 │
      │                   │               │ 8. If killed:  │                 │
      │                   │<──player_death──────┤                 │                 │
      │                   │                     │                 │                 │
```
