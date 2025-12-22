-- Enable Row Level Security for session_players table and define access policies

-- Enable RLS for the table
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;

-- 1. Allow read access to all session players
-- Players can query session_players to see who's in sessions
-- Access is controlled by knowing the session_id (which comes from join code)
CREATE POLICY "Allow read access to session players"
  ON public.session_players
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 2. Allow authenticated users to insert themselves into a session
-- This is for joining a game
CREATE POLICY "Allow authenticated users to join sessions"
  ON public.session_players
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (auth.uid() = player_id);

-- 3. Allow players to update their own data
-- This is for position updates, status changes, etc.
CREATE POLICY "Allow players to update their own data"
  ON public.session_players
  FOR UPDATE
  TO anon, authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

-- 4. Allow players to delete their own session record (for leaving a game)
CREATE POLICY "Allow players to delete their own data"
  ON public.session_players
  FOR DELETE
  TO anon, authenticated
  USING (auth.uid() = player_id);
