-- This RLS policy is ONLY for local development/testing.
-- It should NOT be applied to production environments.
CREATE POLICY "Allow all operations for testing"
  ON game_sessions
  FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);
