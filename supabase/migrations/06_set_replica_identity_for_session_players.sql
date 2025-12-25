-- Set REPLICA IDENTITY FULL for session_players table
-- This ensures that DELETE events include the full old record (including player_id)
-- which is required for Supabase Realtime postgres_changes to work correctly

ALTER TABLE public.session_players REPLICA IDENTITY FULL;
