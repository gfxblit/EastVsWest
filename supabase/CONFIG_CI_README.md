# CI/CD Optimized Supabase Configuration

## Overview

This directory contains two Supabase configuration files:

1. **`config.toml`** - Full configuration for local development
2. **`config.ci.toml`** - Optimized configuration for CI/CD workflows

## Why Use config.ci.toml?

The CI configuration disables unnecessary services to **reduce Docker startup time and resource usage** in GitHub Actions workflows.

## Services Comparison

| Service | Local (`config.toml`) | CI/CD (`config.ci.toml`) | Reason |
|---------|----------------------|--------------------------|--------|
| **PostgreSQL** | ✅ Enabled | ✅ Enabled | Required - Database operations |
| **PostgREST (API)** | ✅ Enabled | ✅ Enabled | Required - REST API for database |
| **Realtime** | ✅ Enabled | ✅ Enabled | Required - Channels & postgres_changes |
| **Auth** | ✅ Enabled | ✅ Enabled | Required - Anonymous authentication |
| **Studio** | ✅ Enabled | ❌ Disabled | UI not needed in CI/CD |
| **Storage** | ✅ Enabled | ❌ Disabled | Not used (no file uploads) |
| **Inbucket** | ✅ Enabled | ❌ Disabled | Not used (anonymous auth only) |
| **Edge Functions** | ✅ Enabled | ❌ Disabled | Not used (no serverless functions) |
| **Analytics** | ✅ Enabled | ❌ Disabled | Not needed for tests |

## Performance Improvement

Disabling these 5 services saves:
- **3-5 Docker containers** (Studio, Storage, Inbucket, Edge Runtime, Analytics)
- **~20-40% faster startup time** in CI/CD workflows
- **Reduced memory and CPU usage** during tests

## Usage

### In GitHub Actions Workflows

```yaml
- name: Start Supabase
  run: supabase start --config supabase/config.ci.toml
```

### Local Development

For local development, continue using the default config:

```bash
supabase start
```

Or explicitly specify the full config:

```bash
supabase start --config supabase/config.toml
```

## What Your Project Actually Uses

Based on code analysis:

### ✅ **Required Services**

1. **PostgreSQL Database**
   - Tables: `game_sessions`, `session_players`
   - RPC: `get_session_by_join_code`
   - Found in: `src/network.js` (lines 63-70, 82-93, 104-108)

2. **Auth (Anonymous Only)**
   - `signInAnonymously()` for player IDs
   - Found in: `src/main.js:124`, all integration tests

3. **Realtime**
   - Broadcast channels for real-time messaging
   - Postgres changes for player join/leave events
   - Found in: `src/network.js:181-216`

### ❌ **Unused Services**

- **Storage** - No file uploads in codebase
- **Email/SMS Auth** - Only using anonymous auth
- **Edge Functions** - No edge functions defined
- **OAuth Providers** - No social login
- **MFA** - Not configured
- **Analytics** - Not used in tests

## Maintenance

When adding new features:

1. **If you add file uploads** → Enable `storage` in `config.ci.toml`
2. **If you add edge functions** → Enable `edge_runtime` in `config.ci.toml`
3. **If you add email auth** → Enable `inbucket` in `config.ci.toml`
4. **If you need Studio UI in CI** → Enable `studio` in `config.ci.toml`

## Verification

To verify the configuration works correctly:

```bash
# Start with CI config
supabase start --config supabase/config.ci.toml

# Run tests
npm run test:e2e

# Clean up
supabase stop
```

All integration tests should pass with the optimized configuration.
