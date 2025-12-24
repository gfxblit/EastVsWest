-- Trigger to automatically update current_player_count in game_sessions
-- when players join or leave a session.

CREATE OR REPLACE FUNCTION update_session_player_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE game_sessions
    SET current_player_count = current_player_count + 1
    WHERE id = NEW.session_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE game_sessions
    SET current_player_count = current_player_count - 1
    WHERE id = OLD.session_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_player_count
AFTER INSERT OR DELETE ON session_players
FOR EACH ROW
EXECUTE FUNCTION update_session_player_count();
