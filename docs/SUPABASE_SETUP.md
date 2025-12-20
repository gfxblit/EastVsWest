# Supabase Setup Guide

This guide explains how to set up the Supabase database and test the game_sessions table.

## Prerequisites

1. A Supabase account (sign up at [supabase.com](https://supabase.com))
2. A Supabase project created
3. Node.js 18+ installed

## Step 1: Create the game_sessions Table

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run the following SQL to create the `game_sessions` table:

```sql
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code VARCHAR(6) UNIQUE NOT NULL,
  host_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'lobby',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  max_players INTEGER DEFAULT 12,
  current_player_count INTEGER DEFAULT 1,

  -- Game state metadata
  game_phase VARCHAR(20) DEFAULT 'lobby',
  conflict_zone_radius REAL,
  conflict_zone_center_x REAL,
  conflict_zone_center_y REAL,

  -- Session expiry
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours'),

  CONSTRAINT valid_status CHECK (status IN ('lobby', 'active', 'ended')),
  CONSTRAINT valid_phase CHECK (game_phase IN ('lobby', 'deployment', 'combat', 'ended'))
);

-- Index for fast join code lookups
CREATE UNIQUE INDEX idx_join_code ON game_sessions(join_code);

-- Index for cleanup queries (expired sessions)
CREATE INDEX idx_expires_at ON game_sessions(expires_at);
```

## Step 2: Enable Row Level Security (Optional for Testing)

For testing purposes, you can temporarily disable RLS or create permissive policies:

```sql
-- Disable RLS for testing (NOT recommended for production)
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY;

-- OR create a permissive policy for testing with anon key
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for testing"
  ON game_sessions
  FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);
```

## Step 3: Get Your Supabase Credentials

1. Go to your Supabase project settings
2. Navigate to **API** section
3. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (for testing) or **service_role key** (for full access)

## Step 4: Set Environment Variables

Create a `.env` file in the project root (or export in your shell):

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key
```

**Important:** Add `.env` to your `.gitignore` to avoid committing secrets!

## Step 5: Run the Manual Test Script

Run the manual test script to verify your setup:

```bash
# Using environment variables from shell
SUPABASE_URL=your_url SUPABASE_KEY=your_key node src/testGameSessionAPI.js

# Or if you have a .env file, use dotenv
npm install dotenv
node -r dotenv/config src/testGameSessionAPI.js
```

Expected output:
```
🚀 Testing Game Session API with Supabase

📍 Supabase URL: https://xxxxx.supabase.co
🔑 API Key: eyJhbGciOiJIUzI1NiI...

Test 1: Creating a game session...
  Host ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Join Code: TEST42
✅ Session created successfully!
  Session ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Status: lobby
  ...

🎉 All tests passed successfully!
```

## Step 6: Run Jest Tests (Optional)

To run the full test suite with Jest:

```bash
# Set environment variables
export SUPABASE_URL=your_url
export SUPABASE_KEY=your_key

# Run tests
npm test src/gameSession.test.js
```

**Note:** The Jest tests require a live Supabase database. Each test will create and clean up its own data.

## Troubleshooting

### Error: "Failed to create session"

- **Check credentials**: Verify your SUPABASE_URL and SUPABASE_KEY are correct
- **Check RLS**: Ensure Row Level Security policies allow inserts
- **Check table exists**: Verify the game_sessions table was created successfully

### Error: "duplicate key value violates unique constraint"

- This means a session with that join_code already exists
- The manual test script generates random join codes to avoid this
- Clean up old test data or use different join codes

### Error: "relation 'game_sessions' does not exist"

- The table hasn't been created yet
- Run the SQL from Step 1 in the Supabase SQL Editor

## Cleanup Test Data

To clean up test sessions:

```sql
-- Delete all test sessions
DELETE FROM game_sessions WHERE join_code LIKE 'TEST%';

-- Or delete all sessions (be careful!)
DELETE FROM game_sessions;
```

## Next Steps

Once the basic game_sessions table is working:

1. Create the `session_players` table
2. Create the `session_items` table
3. Create the `session_events` table
4. Set up Supabase Realtime channels
5. Implement the full multiplayer network layer

See `NETWORK_DESIGN.md` for the complete schema and architecture.

## Local vs. Production Configuration

Managing Supabase configurations differs between local development and production environments to optimize for development speed and production stability/security.

### 1. Database Schema Management (Migrations)

*   **Shared Source of Truth:** The `supabase/migrations/` directory contains version-controlled SQL files that define your database schema (tables, columns, indexes, constraints).
*   **Local:** When you run `npx supabase start`, these migrations are automatically applied to your local database to set up or update its structure.
*   **Production:** These same migrations are pushed to your live production database (e.g., via `npx supabase db push` in a CI/CD pipeline). This ensures that the fundamental database structure remains consistent across all environments.

### 2. Service Configuration

*   **Local (`supabase/config.toml`):** This file is exclusively for configuring your local Supabase Docker environment. It dictates which services (like `db.pooler` or `storage.image_transformation`) are enabled locally, their ports, and other development-specific settings. This file is **not** used in production.
*   **Production (Supabase Dashboard):** For your live project, service enablement and configuration (e.g., enabling the connection pooler, setting up image transformation, configuring authentication providers, environment variables) are managed directly through the Supabase Dashboard UI at `app.supabase.com`.

### 3. Environment-Specific Logic & Data (RLS Policies, Seed Data)

*   **The Challenge:** Some database elements, like Row Level Security (RLS) policies or initial data, need to be different between development and production. For example, a permissive RLS policy is useful for local testing, but dangerous for production.
*   **Local (`supabase/seed.sql`):** This file is designed for local-only setup. It runs *after* migrations every time your local database is reset. You can use it to:
    *   Apply permissive RLS policies for easy local testing (like the `"Allow all operations for testing"` policy).
    *   Insert test data (e.g., dummy users, game sessions).
    *   **Crucially, `seed.sql` is never automatically applied to your production database.**
*   **Production (Supabase Dashboard / Direct SQL):** Production-grade RLS policies, which should be highly restrictive and secure, are typically created and managed directly within the Supabase Dashboard's SQL Editor. These policies are separate from your local `seed.sql` and are designed for your live application. Initial production data is usually managed through application logic or specific data import processes, not via `seed.sql`.

In summary, migrations ensure schema consistency, `config.toml` manages your local dev stack, and the Supabase Dashboard controls your production setup. Environment-specific logic and data are carefully segregated, with `seed.sql` for local convenience and direct configuration/SQL for production security and robustness.
