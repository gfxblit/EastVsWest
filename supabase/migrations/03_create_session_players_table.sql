-- Migration for creating the session_players table to track players in each game session

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

-- Enable Realtime for session_players table
ALTER PUBLICATION supabase_realtime ADD TABLE session_players;
