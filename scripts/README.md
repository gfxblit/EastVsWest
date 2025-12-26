# Test Scripts

## Join Test Script

Test script to join a game session and verify lobby synchronization.

### Usage

```bash
node scripts/join-test.js <JOIN_CODE>
```

### Example

1. Start Supabase (if not already running):
   ```bash
   npx supabase start
   ```

2. Open the game in a browser and host a game. Note the join code displayed.

3. Run the join test script with the join code:
   ```bash
   node scripts/join-test.js ABC123
   ```

4. Watch your browser lobby - you should see "TestPlayer-xxxx" appear!

5. The script will stay connected. Press `Ctrl+C` to disconnect and exit.

### What It Does

- Creates a Supabase client and authenticates anonymously
- Creates a Network instance
- Joins the game session with the provided join code
- Creates a SessionPlayersSnapshot to monitor the lobby
- Displays the current lobby players
- Listens for lobby updates and displays them in real-time
- Stays connected until you press Ctrl+C

### Environment Variables

You can override the default Supabase configuration:

```bash
SUPABASE_URL="http://127.0.0.1:54321" \
SUPABASE_ANON_KEY="your-anon-key" \
node scripts/join-test.js ABC123
```

### Debugging

The script shows:
- All postgres_changes events
- Current lobby state
- When players join/leave
- Network connection status

This helps you verify that:
- SessionPlayersSnapshot is properly syncing via Network
- Browser lobby UI updates when players join
- Real-time events are working correctly
