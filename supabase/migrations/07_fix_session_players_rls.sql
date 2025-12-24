-- Fix RLS policies for session_players to support client-authoritative join and host-authoritative eviction

-- Drop old insert policy
DROP POLICY IF EXISTS "Allow host to insert players into their session" ON public.session_players;

-- Allow players to insert themselves
CREATE POLICY "Allow players to insert themselves"
  ON public.session_players
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = player_id);

-- Allow host to evict players
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
