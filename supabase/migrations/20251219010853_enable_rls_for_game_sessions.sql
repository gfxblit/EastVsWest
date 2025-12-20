-- Enable RLS and default to deny all access
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all operations"
  ON game_sessions
  FOR ALL
  USING (FALSE);
