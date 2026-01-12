import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { LocalPlayerController } from '../src/LocalPlayerController';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { waitFor } from './helpers/wait-utils.js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

describe('Collision Integration', () => {
  let hostClient;
  let playerBClient;
  let hostNetwork;
  let playerBNetwork;
  let hostController;
  let testSessionId;

  beforeAll(async () => {
    hostClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: hostAuth } = await hostClient.auth.signInAnonymously();
    hostNetwork = new Network();
    hostNetwork.initialize(hostClient, hostAuth.user.id);

    playerBClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerBAuth } = await playerBClient.auth.signInAnonymously();
    playerBNetwork = new Network();
    playerBNetwork.initialize(playerBClient, playerBAuth.user.id);
  });

  afterAll(async () => {
    if (hostNetwork) hostNetwork.disconnect();
    if (playerBNetwork) playerBNetwork.disconnect();
    await hostClient.auth.signOut();
    await playerBClient.auth.signOut();
  });

  test('Host should be blocked by Player B in a real integration scenario', async () => {
    // 1. Host (Player A) creates a session
    const { session } = await hostNetwork.hostGame('Host');
    testSessionId = session.id;

    // 2. Player B joins the session
    await playerBNetwork.joinGame(session.join_code, 'PlayerB');

    // 3. Player B positions themselves at (1100, 1000)
    await playerBNetwork.writePlayerStateToDB(playerBNetwork.playerId, {
      position_x: 1100,
      position_y: 1000,
      health: 100
    });

    // 4. Host sets up LocalPlayerController and SessionPlayersSnapshot
    const snapshot = new SessionPlayersSnapshot(hostNetwork, session.id, { refreshIntervalMs: 100 });
    await snapshot.ready();

    hostController = new LocalPlayerController(hostNetwork, {
      position_x: 1000,
      position_y: 1000
    });

    // 5. Wait for snapshot to see Player B
    await waitFor(() => {
      const pB = snapshot.getPlayers().get(playerBNetwork.playerId);
      return pB && pB.position_x === 1100;
    }, 5000);

    // 6. Host tries to move towards Player B
    // Velocity is 200px/s. After 0.1s, x should be 1020.
    // Collision: Host radius 60, Player B radius 60.
    // Host at 1020: maxX = 1080. Player B at 1100: minX = 1040.
    // Overlap = 40. MTV = -40. Result x = 1020 - 40 = 980.
    hostController.handleInput({ moveX: 1, moveY: 0 });
    
    // Perform multiple updates to simulate real time and ensure resolution
    for(let i=0; i<5; i++) {
        hostController.update(0.02, snapshot);
    }

    const playerA = hostController.getPlayer();
    
    // Host should be pushed back from the 1000 + 200*0.1 = 1020 position
    expect(playerA.x).toBeLessThan(1000);
    
    snapshot.destroy();
  });
});
