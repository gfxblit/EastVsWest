-- Enable Row Level Security for session_players table and define access policies

-- Enable RLS for the table
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;

-- 1. Allow read access to all session players
-- Players can query session_players to see who's in sessions
-- Access is controlled by knowing the session_id (which comes from join code)
-- Note: Anonymous sign-ins get the 'authenticated' role, not 'anon'
CREATE POLICY "Allow read access to session players"
  ON public.session_players
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Allow only the host to add players to a session.
-- This enforces the host-authority model. The check verifies that the
-- user performing the insert is the host of the session being inserted into.
CREATE POLICY "Allow host to insert players into their session"
  ON public.session_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.game_sessions
      WHERE id = session_players.session_id AND host_id = auth.uid()
    )
  );

-- 3. Allow players to update their own data
-- This is for position updates, status changes, etc.
CREATE POLICY "Allow players to update their own data"
  ON public.session_players
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

-- 4. Allow players to delete their own session record (for leaving a game)
CREATE POLICY "Allow players to delete their own data"
  ON public.session_players
  FOR DELETE
  TO authenticated
  USING (auth.uid() = player_id);
