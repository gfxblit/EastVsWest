-- Enable Row Level Security for session_players table and define access policies

-- Enable RLS for the table
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;

-- Helper function to check if a user is a member of a session
-- Uses SECURITY DEFINER to bypass RLS and avoid recursion
CREATE OR REPLACE FUNCTION is_session_member(p_session_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.session_players
    WHERE session_id = p_session_id AND player_id = p_user_id
  );
END;
$$;

-- 1. Allow read access to session players in sessions the user has joined
-- Uses helper function to avoid infinite recursion
-- Also allows reading own records directly to handle INSERT...RETURNING
-- Note: Anonymous sign-ins get the 'authenticated' role, not 'anon'
CREATE POLICY "Allow read access to session players"
  ON public.session_players
  FOR SELECT
  TO authenticated
  USING (
    player_id = auth.uid() OR is_session_member(session_id, auth.uid())
  );

-- 2. Allow players to self-insert into a session.
-- The Host is responsible for evicting players if the session is full or already started.
CREATE POLICY "Allow players to insert themselves"
  ON public.session_players
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = player_id);

-- 3. Allow host to evict players (delete rows in their own session).
CREATE POLICY "Allow host to evict players"
  ON public.session_players
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_sessions
      WHERE id = session_players.session_id AND host_id = auth.uid()
    )
  );

-- 4. Allow players to update their own data
-- This is for position updates, status changes, etc.
CREATE POLICY "Allow players to update their own data"
  ON public.session_players
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

-- 5. Allow players to delete their own session record (for leaving a game)
CREATE POLICY "Allow players to delete their own data"
  ON public.session_players
  FOR DELETE
  TO authenticated
  USING (auth.uid() = player_id);
