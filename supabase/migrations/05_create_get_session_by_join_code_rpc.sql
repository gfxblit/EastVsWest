-- Migration for creating the RPC function to securely get a game session by join code.

CREATE OR REPLACE FUNCTION public.get_session_by_join_code(p_join_code VARCHAR(6))
RETURNS SETOF public.game_sessions
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with the privileges of the function creator (admin), bypassing RLS
AS $$
BEGIN
  RETURN QUERY
  SELECT
    id,
    join_code,
    host_id, -- host_id is public, it's just a UUID. The client will still need auth.uid() to claim it.
    status,
    created_at,
    started_at,
    ended_at,
    max_players,
    current_player_count,
    game_phase,
    conflict_zone_radius,
    conflict_zone_center_x,
    conflict_zone_center_y,
    expires_at,
    realtime_channel_name
  FROM public.game_sessions
  WHERE join_code = p_join_code;
END;
$$;

-- Grant execution privileges to authenticated users
-- Note: This includes anonymous sign-ins (which get 'authenticated' role)
GRANT EXECUTE ON FUNCTION public.get_session_by_join_code(VARCHAR(6)) TO authenticated;