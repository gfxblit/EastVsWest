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
