-- This script enables Row Level Security (RLS) for the 'game_sessions' table
-- and defines the access policies according to the application's security model.

-- Enable RLS for the table.
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- 1. Allow read access for everyone.
-- This is required for players to find sessions by join_code.
-- Note: Anonymous sign-ins get the 'authenticated' role, not 'anon'
CREATE POLICY "Allow read access to all game sessions"
  ON public.game_sessions
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Allow authenticated users to create sessions.
-- The creator automatically becomes the host.
-- Note: This includes anonymous sign-ins (which get 'authenticated' role)
CREATE POLICY "Allow authenticated users to create game sessions"
  ON public.game_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_id);

-- 3. Allow hosts to update their own sessions.
-- This is for managing the game state (e.g., 'lobby' -> 'active').
CREATE POLICY "Allow host to update their own game session"
  ON public.game_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- 4. Allow hosts to delete their own sessions.
-- This is for cleaning up finished or abandoned games.
CREATE POLICY "Allow host to delete their own game session"
  ON public.game_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = host_id);