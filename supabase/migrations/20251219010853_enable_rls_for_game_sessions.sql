-- Enable RLS for testing (NOT recommended for production)
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for testing"
  ON game_sessions
  FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);
