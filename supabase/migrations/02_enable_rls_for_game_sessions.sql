-- This script enables Row Level Security (RLS) for the 'game_sessions' table
-- and defines the access policies according to the application's security model.

-- Enable RLS for the table.
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- 1. Allow read access for everyone.
-- This is required for players to find sessions by join_code.
CREATE POLICY "Allow read access to all game sessions"
  ON public.game_sessions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 2. Allow authenticated and anonymous users to create sessions.
-- The creator automatically becomes the host.
CREATE POLICY "Allow authenticated users to create game sessions"
  ON public.game_sessions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (auth.uid() = host_id);

-- 3. Allow hosts to update their own sessions.
-- This is for managing the game state (e.g., 'lobby' -> 'active').
CREATE POLICY "Allow host to update their own game session"
  ON public.game_sessions
  FOR UPDATE
  TO anon, authenticated
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- 4. Allow hosts to delete their own sessions.
-- This is for cleaning up finished or abandoned games.
CREATE POLICY "Allow host to delete their own game session"
  ON public.game_sessions
  FOR DELETE
  TO anon, authenticated
  USING (auth.uid() = host_id);