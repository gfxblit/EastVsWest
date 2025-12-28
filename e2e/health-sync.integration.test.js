import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { waitFor } from './helpers/wait-utils.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Health Synchronization Integration', () => {
  let supabaseClient;
  let hostUser, player1User, player2User;
  let hostNetwork, player1Network, player2Network;
  let player2Snapshot;
  let testSessionId;

  if (!supabaseUrl || !supabaseAnonKey) {
    test.only('Supabase environment variables not set, skipping integration tests', () => {
      console.warn('Set SUPABASE_URL and SUPABASE_ANON_KEY to run integration tests.');
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Create 3 authenticated users
    const createAuthUser = async () => {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      return { client, user: data.user };
    };

    const hostData = await createAuthUser();
    hostUser = hostData.user;
    hostNetwork = new Network();
    hostNetwork.initialize(hostData.client, hostUser.id);

    const player1Data = await createAuthUser();
    player1User = player1Data.user;
    player1Network = new Network();
    player1Network.initialize(player1Data.client, player1User.id);

    const player2Data = await createAuthUser();
    player2User = player2Data.user;
    player2Network = new Network();
    player2Network.initialize(player2Data.client, player2User.id);
  });

  afterAll(async () => {
    if (hostNetwork) hostNetwork.disconnect();
    if (player1Network) player1Network.disconnect();
    if (player2Network) player2Network.disconnect();
    if (player2Snapshot) player2Snapshot.destroy();
    
    // Cleanup users (optional, usually handled by Supabase cleanup)
    if (supabaseClient) await supabaseClient.auth.signOut();
  });

  afterEach(async () => {
    if (testSessionId) {
      // Explicitly cleanup players first (though cascade delete should handle it)
      await supabaseClient.from('session_players').delete().match({ session_id: testSessionId });
      // Cleanup the session
      await supabaseClient.from('game_sessions').delete().match({ id: testSessionId });
      testSessionId = null;
    }
  });

  test('should broadcast health updates through real Supabase channels and update SessionPlayersSnapshot', async () => {
    // 1. Host creates game
    const { session: hostSession } = await hostNetwork.hostGame('HostPlayer');
    testSessionId = hostSession.id;
    const joinCode = hostSession.join_code;

    // 2. Players join
    await player1Network.joinGame(joinCode, 'Player1');
    await player2Network.joinGame(joinCode, 'Player2');

    // 3. Initialize Snapshot on Player 2 to verify it receives updates
    player2Snapshot = new SessionPlayersSnapshot(player2Network, hostSession.id);
    await player2Snapshot.ready();

    // Wait for Player 1 to appear in Player 2's snapshot (via postgres_changes or initial fetch)
    await waitFor(() => player2Snapshot.getPlayers().has(player1User.id));

    // 4. Player 1 sends position_update with health
    const healthValue = 85;
    player1Network.sendPositionUpdate({
      position: { x: 100, y: 100 },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      health: healthValue
    });

    // 5. Host receives update (wait for buffer)
    await waitFor(() => hostNetwork.positionBuffer.has(player1User.id));

    // 6. Host broadcasts
    hostNetwork.broadcastPositionUpdates();

    // 7. Verify Player 2 receives broadcast and Snapshot updates
    // We poll the snapshot to see if the health value is updated
    await waitFor(() => {
      const p1 = player2Snapshot.getPlayers().get(player1User.id);
      return p1 && p1.health === healthValue;
    });

    const p1 = player2Snapshot.getPlayers().get(player1User.id);
    expect(p1.health).toBe(healthValue);
  }, 30000); // Increased timeout for network ops
});
