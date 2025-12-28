-- Allow host to update player records in their session
-- This is necessary for the host to persist health and other state changes for all players
CREATE POLICY "Allow host to update players in their session"
  ON public.session_players
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_sessions
      WHERE id = session_players.session_id AND host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_sessions
      WHERE id = session_players.session_id AND host_id = auth.uid()
    )
  );
