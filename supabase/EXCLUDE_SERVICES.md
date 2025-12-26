# Excluding Supabase Services in CI/CD

## Overview

For CI/CD workflows, we use the `--exclude` flag to disable unnecessary services and **reduce Docker startup time and resource usage** in GitHub Actions workflows.

## Why Exclude Services?

Starting all Supabase services requires 9+ Docker containers. By excluding unused services, we reduce startup time and resource consumption.

## Services Comparison

| Service | Local Development | CI/CD (Excluded) | Reason |
|---------|------------------|------------------|--------|
| **postgres** | ✅ Enabled | ✅ Enabled | Required - Database operations |
| **postgrest** | ✅ Enabled | ✅ Enabled | Required - REST API for database |
| **realtime** | ✅ Enabled | ✅ Enabled | Required - Channels & postgres_changes |
| **gotrue** (auth) | ✅ Enabled | ✅ Enabled | Required - Anonymous authentication |
| **kong** (gateway) | ✅ Enabled | ✅ Enabled | Required - API gateway |
| **studio** | ✅ Enabled | ❌ Excluded | Web UI not needed in CI/CD |
| **storage-api** | ✅ Enabled | ❌ Excluded | Not used (no file uploads) |
| **imgproxy** | ✅ Enabled | ❌ Excluded | Not used (image transformation) |
| **mailpit** | ✅ Enabled | ❌ Excluded | Not used (anonymous auth only) |
| **edge-runtime** | ✅ Enabled | ❌ Excluded | Not used (no serverless functions) |
| **logflare** | ✅ Enabled | ❌ Excluded | Not needed for tests (analytics) |
| **vector** | ✅ Enabled | ❌ Excluded | Not used (vector storage) |
| **supavisor** | ✅ Enabled | ❌ Excluded | Not needed (connection pooler) |
| **postgres-meta** | ✅ Enabled | ❌ Excluded | Not needed (used by Studio) |

## Performance Improvement

Excluding these 9 services saves:
- **9 Docker containers** (Studio, Storage, Imgproxy, Mailpit, Edge Runtime, Logflare, Vector, Supavisor, Postgres-Meta)
- **~20-40% faster startup time** in CI/CD workflows
- **Significantly reduced memory and CPU usage** during tests

## Usage

### In GitHub Actions Workflows

```yaml
- name: Start Supabase
  run: supabase start --exclude studio,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta
```

### Local Development

For local development, start all services (default):

```bash
supabase start
```

Or exclude the same services locally to match CI behavior:

```bash
supabase start --exclude studio,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta
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

When adding new features, remove services from the `--exclude` list in workflows:

1. **If you add file uploads** → Remove `storage-api,imgproxy` from exclude list
2. **If you add edge functions** → Remove `edge-runtime` from exclude list
3. **If you add email auth** → Remove `mailpit` from exclude list
4. **If you need Studio UI in CI** → Remove `studio,postgres-meta` from exclude list
5. **If you need vector storage** → Remove `vector` from exclude list
6. **If you need connection pooling** → Remove `supavisor` from exclude list

## Verification

To verify the excluded services approach works correctly:

```bash
# Start with excluded services (matching CI)
supabase start --exclude studio,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta

# Run tests
npm run test:e2e

# Clean up
supabase stop
```

All integration tests should pass with the excluded services.
