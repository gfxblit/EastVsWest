-- Allow host to insert bot records into their own session
CREATE POLICY "Allow host to insert bots"
  ON public.session_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_sessions
      WHERE id = session_players.session_id AND host_id = auth.uid()
    )
    AND is_bot = TRUE
  );
