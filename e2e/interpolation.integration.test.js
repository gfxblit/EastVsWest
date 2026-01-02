
import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { Renderer } from '../src/renderer';
import { CONFIG } from '../src/config';
import { waitFor } from './helpers/wait-utils.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Client Interpolation Integration (Real Network)', () => {
  let hostClient;
  let playerClient;
  let hostNetwork;
  let playerNetwork;
  let playerSnapshot;
  let renderer;
  let testSessionId;
  let hostUser;
  let playerUser;

  if (!supabaseUrl || !supabaseAnonKey) {
    test.only('Supabase environment variables not set, skipping integration tests', () => {
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    // 1. Setup Clients
    hostClient = createClient(supabaseUrl, supabaseAnonKey);
    playerClient = createClient(supabaseUrl, supabaseAnonKey);

    const [{ data: hostAuth }, { data: playerAuth }] = await Promise.all([
      hostClient.auth.signInAnonymously(),
      playerClient.auth.signInAnonymously()
    ]);

    hostUser = hostAuth.user;
    playerUser = playerAuth.user;

    hostNetwork = new Network();
    hostNetwork.initialize(hostClient, hostUser.id);

    playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerUser.id);

    // 2. Setup Renderer (for interpolation logic)
    const mockCanvas = { getContext: () => ({}), width: 800, height: 600 };
    renderer = new Renderer(mockCanvas);
    // Note: We don't call renderer.init() to avoid image loading in E2E environment
  });

  afterAll(async () => {
    if (hostNetwork) hostNetwork.disconnect();
    if (playerNetwork) playerNetwork.disconnect();
    if (playerSnapshot) playerSnapshot.destroy();
    if (hostClient) await hostClient.auth.signOut();
    if (playerClient) await playerClient.auth.signOut();
  });

  test('should fill history buffer and interpolate between real network updates', async () => {
    // 1. Host Game
    const { session } = await hostNetwork.hostGame('Host');
    testSessionId = session.id;

    // 2. Join Game
    await playerNetwork.joinGame(session.join_code, 'Player');

    // 3. Setup Snapshot on Player side
    playerSnapshot = new SessionPlayersSnapshot(playerNetwork, session.id);
    await playerSnapshot.ready();
    // Give more time for Realtime channel to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 4. Simulate Host Movement (3 updates, 100ms apart for stability)
    const sendUpdate = async (x) => {
      hostNetwork.broadcastPlayerStateUpdate({
        player_id: hostUser.id,
        position_x: x,
        position_y: 0,
        rotation: 0,
        velocity_x: 100,
        velocity_y: 0
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    };

    await sendUpdate(0);   // Snapshot 1
    await sendUpdate(5);   // Snapshot 2
    await sendUpdate(10);  // Snapshot 3

    // 5. Verify Buffer on Player Side
    await waitFor(() => {
      const p = playerSnapshot.getPlayers().get(hostUser.id);
      return p && p.positionHistory && p.positionHistory.length >= 3;
    }, 10000);

    const playerViewOfHost = playerSnapshot.getPlayers().get(hostUser.id);
    const history = playerViewOfHost.positionHistory;
    
    expect(history.length).toBe(CONFIG.NETWORK.INTERPOLATION_BUFFER_SIZE);

    // 6. Test Interpolation Logic with real timestamps
    // We'll target exactly halfway between the 1st and 2nd snapshots.
    const t1 = history[0].timestamp;
    const t2 = history[1].timestamp;
    const midpoint = t1 + (t2 - t1) / 2;
    
    // To target 'midpoint' time, we must pass 'midpoint + delay' to interpolatePosition
    const renderTime = midpoint + CONFIG.NETWORK.INTERPOLATION_DELAY_MS;
    
    const result = renderer.interpolatePosition(playerViewOfHost, renderTime);
    
    // halfway between 0 and 5 is 2.5
    expect(result.x).toBeCloseTo(2.5, 1);
    expect(result.y).toBe(0);
  }, 15000);
});
