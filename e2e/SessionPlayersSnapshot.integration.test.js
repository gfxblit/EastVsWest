import { createClient } from '@supabase/supabase-js';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot.js';
import { Network } from '../src/network.js';
import { waitFor } from './helpers/test-utils.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('SessionPlayersSnapshot Integration with Network', () => {
  let hostClient;
  let playerClient;
  let hostNetwork;
  let playerNetwork;
  let hostSnapshot;
  let playerSnapshot;
  let testSessionId;
  let testJoinCode;
  let hostUser;
  let playerUser;

  // Skip tests if Supabase is not configured
  if (!supabaseUrl || !supabaseAnonKey) {
    test.only('Supabase environment variables not set, skipping integration tests', () => {
      console.warn('Set SUPABASE_URL and SUPABASE_ANON_KEY to run integration tests.');
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    // Create two separate clients (host and player)
    hostClient = createClient(supabaseUrl, supabaseAnonKey);
    playerClient = createClient(supabaseUrl, supabaseAnonKey);

    // Authenticate both clients
    const { data: hostAuth, error: hostAuthError } = await hostClient.auth.signInAnonymously();
    if (hostAuthError) {
      throw new Error(`Failed to authenticate host: ${hostAuthError.message}`);
    }
    hostUser = hostAuth.user;

    const { data: playerAuth, error: playerAuthError } = await playerClient.auth.signInAnonymously();
    if (playerAuthError) {
      throw new Error(`Failed to authenticate player: ${playerAuthError.message}`);
    }
    playerUser = playerAuth.user;

    // Create Network instances
    hostNetwork = new Network();
    hostNetwork.initialize(hostClient, hostUser.id);

    playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerUser.id);
  });

  afterAll(async () => {
    // Disconnect networks
    if (hostNetwork) {
      hostNetwork.disconnect();
    }
    if (playerNetwork) {
      playerNetwork.disconnect();
    }

    // Sign out both clients
    if (hostClient) {
      await hostClient.auth.signOut();
    }
    if (playerClient) {
      await playerClient.auth.signOut();
    }
  });

  beforeEach(async () => {
    // Host creates a game session via Network
    const { session } = await hostNetwork.hostGame('HostPlayer');
    testSessionId = session.id;
    testJoinCode = session.join_code;
  });

  afterEach(async () => {
    // Destroy snapshots first (clears intervals and unsubscribes from Network events)
    if (hostSnapshot) {
      hostSnapshot.destroy();
      hostSnapshot = null;
    }
    if (playerSnapshot) {
      playerSnapshot.destroy();
      playerSnapshot = null;
    }

    // Disconnect networks (removes channels)
    if (hostNetwork) {
      hostNetwork.disconnect();
    }
    if (playerNetwork) {
      playerNetwork.disconnect();
    }

    // Clean up test data FIRST (before waiting)
    if (testSessionId) {
      const sessionIdToDelete = testSessionId;
      testSessionId = null;
      // Delete players first (due to foreign key constraint)
      await hostClient.from('session_players').delete().eq('session_id', sessionIdToDelete);
      // Delete session
      await hostClient.from('game_sessions').delete().eq('id', sessionIdToDelete);
      
      // Wait for cleanup to be reflected in DB
      await waitFor(async () => {
        const { count } = await hostClient
          .from('game_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('id', sessionIdToDelete);
        return count === 0;
      });
    }

    // Small delay to allow Realtime to stabilize between tests (removals are async)
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  describe('Initialization and Snapshot', () => {
    test('should fetch initial snapshot filtered by session_id', async () => {
      // Create snapshot (host player was already added by hostGame)
      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);

      // Wait for initialization to complete
      await hostSnapshot.ready();

      const players = hostSnapshot.getPlayers();
      expect(players.size).toBe(1);
      expect(players.has(hostUser.id)).toBe(true);
      expect(players.get(hostUser.id).player_name).toBe('HostPlayer');
      expect(players.get(hostUser.id).is_host).toBe(true);
    });

    test('should only fetch players for the specific session', async () => {
      // Create another session with a different player
      const otherJoinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: otherSession, error: otherSessionError } = await hostClient
        .from('game_sessions')
        .insert({
          join_code: otherJoinCode,
          host_id: hostUser.id,
          status: 'lobby',
          realtime_channel_name: `game_session:${otherJoinCode}`,
        })
        .select()
        .single();

      expect(otherSessionError).toBeNull();

      // Add player to OTHER session
      await hostClient
        .from('session_players')
        .insert({
          session_id: otherSession.id,
          player_id: hostUser.id,
          player_name: 'OtherPlayer',
          is_host: true,
        });

      // Player joins TEST session via Network
      await playerNetwork.joinGame(testJoinCode, 'TestPlayer');

      // Create snapshot for test session
      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);

      await hostSnapshot.ready();

      const players = hostSnapshot.getPlayers();

      // Should ONLY see players from test session (host + player)
      expect(players.size).toBe(2);
      expect(players.has(hostUser.id)).toBe(true);
      expect(players.has(playerUser.id)).toBe(true);

      // Should NOT see player from other session
      const otherSessionPlayer = Array.from(players.values()).find(
        p => p.player_name === 'OtherPlayer'
      );
      expect(otherSessionPlayer).toBeUndefined();

      // Cleanup other session
      await hostClient.from('session_players').delete().eq('session_id', otherSession.id);
      await hostClient.from('game_sessions').delete().eq('id', otherSession.id);
    });
  });

  describe('Realtime Synchronization via Network', () => {
    test('should sync when new player joins via Network', async () => {
      // Create host snapshot
      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);
      await hostSnapshot.ready();

      expect(hostSnapshot.getPlayers().size).toBe(1);

      // Player joins via Network
      await playerNetwork.joinGame(testJoinCode, 'TestPlayer');

      // Wait for postgres_changes event to propagate through Network
      await waitFor(() => hostSnapshot.getPlayers().size === 2);

      const players = hostSnapshot.getPlayers();
      expect(players.size).toBe(2);
      expect(players.has(playerUser.id)).toBe(true);
      expect(players.get(playerUser.id).player_name).toBe('TestPlayer');
    });

    test('should sync when player is deleted', async () => {
      // Player joins first
      await playerNetwork.joinGame(testJoinCode, 'TestPlayer');

      // Create host snapshot
      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);
      await hostSnapshot.ready();

      expect(hostSnapshot.getPlayers().size).toBe(2);

      // Delete player directly from database
      await hostClient
        .from('session_players')
        .delete()
        .eq('player_id', playerUser.id)
        .eq('session_id', testSessionId);

      // Wait for postgres_changes event
      await waitFor(() => hostSnapshot.getPlayers().size === 1);

      const players = hostSnapshot.getPlayers();
      expect(players.size).toBe(1);
      expect(players.has(playerUser.id)).toBe(false);
    });

    test('should update player data on UPDATE events', async () => {
      // Create host snapshot
      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);
      await hostSnapshot.ready();

      const hostPlayerBefore = hostSnapshot.getPlayers().get(hostUser.id);
      expect(hostPlayerBefore.kills).toBe(0);

      // Update player data
      await hostClient
        .from('session_players')
        .update({ kills: 5, damage_dealt: 100 })
        .eq('player_id', hostUser.id)
        .eq('session_id', testSessionId);

      // Wait for postgres_changes event
      await waitFor(() => {
        const p = hostSnapshot.getPlayers().get(hostUser.id);
        return p.kills === 5;
      });

      const hostPlayerAfter = hostSnapshot.getPlayers().get(hostUser.id);
      expect(hostPlayerAfter.kills).toBe(5);
      expect(hostPlayerAfter.damage_dealt).toBe(100);
    });
  });

  describe('Movement Updates via Network Broadcasts', () => {
    test('should update player positions from Network broadcasts', async () => {
      // Player joins
      await playerNetwork.joinGame(testJoinCode, 'TestPlayer');

      // Create snapshot on player side
      playerSnapshot = new SessionPlayersSnapshot(playerNetwork, testSessionId);
      await playerSnapshot.ready();

      // Give delay for subscriptions to fully establish
      await new Promise(resolve => setTimeout(resolve, 200));

      const hostPlayerBefore = playerSnapshot.getPlayers().get(hostUser.id);
      expect(hostPlayerBefore).toBeDefined();
      // Initial position might vary depending on DB defaults or initialization
      const initialX = hostPlayerBefore.position_x;
      const initialY = hostPlayerBefore.position_y;
      expect(hostPlayerBefore.position_x).toBe(1200);
      expect(hostPlayerBefore.position_y).toBe(800);

      // Track player_state_update events received by playerNetwork
      const receivedEvents = [];
      const eventHandler = (payload) => receivedEvents.push(payload);
      playerNetwork.on('player_state_update', eventHandler);

      // Act: hostNetwork sends a position update
      hostNetwork.broadcastPlayerStateUpdate({
        player_id: hostUser.id,
        position_x: 100,
        position_y: 200,
        rotation: 1.5,
        velocity_x: 10,
        velocity_y: 5
      });

      // Wait for broadcast to propagate (Supabase Realtime latency)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Assert
      // First, verify that the player_state_update event reaches playerNetwork
      expect(receivedEvents.length).toBeGreaterThan(0);
      expect(receivedEvents[0].type).toBe('player_state_update');

      playerNetwork.off('player_state_update', eventHandler);

      // Position should update in playerSnapshot via Network broadcast handler
      const hostPlayerAfter = playerSnapshot.getPlayers().get(hostUser.id);

      // Note: Position updates are ephemeral (not written to DB)
      // They update the in-memory player object in the snapshot
      expect(hostPlayerAfter.position_x).toBe(100);
      expect(hostPlayerAfter.position_y).toBe(200);
      expect(hostPlayerAfter.rotation).toBe(1.5);
    }, 15000); // Increase test timeout to 15s
  });

  describe('Periodic Refresh', () => {
    test('should periodically refresh snapshot from database', async () => {
      // Player joins first to have a second player in session
      await playerNetwork.joinGame(testJoinCode, 'TestPlayer');

      // Create snapshot with short refresh interval
      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId, {
        refreshIntervalMs: 500,
      });

      await hostSnapshot.ready();
      expect(hostSnapshot.getPlayers().size).toBe(2);

      // Update player data directly in database (simulating data change that might be missed)
      await playerClient
        .from('session_players')
        .update({ kills: 10, damage_dealt: 500 })
        .eq('player_id', playerUser.id)
        .eq('session_id', testSessionId);

      // Wait for periodic refresh to pick up the changes
      await waitFor(() => {
        const p = hostSnapshot.getPlayers().get(playerUser.id);
        return p.kills === 10;
      });

      // Verify the snapshot was refreshed with updated data
      const playerData = hostSnapshot.getPlayers().get(playerUser.id);
      expect(playerData).toBeDefined();
      expect(playerData.kills).toBe(10);
      expect(playerData.damage_dealt).toBe(500);
    });
  });
});
