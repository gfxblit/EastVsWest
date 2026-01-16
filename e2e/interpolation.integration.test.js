
import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { Renderer } from '../src/renderer';
import { AssetManager } from '../src/AssetManager';
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
    // Mock window for Renderer
    global.window = {
      innerWidth: 1200,
      innerHeight: 800,
    };
    global.Image = class {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.src = '';
      }
    };

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
    const mockCtx = {
      fillRect: () => { },
      save: () => { },
      restore: () => { },
      translate: () => { },
      rotate: () => { },
      drawImage: () => { },
      beginPath: () => { },
      arc: () => { },
      rect: () => { },
      fill: () => { },
      stroke: () => { },
      fillText: () => { },
      measureText: () => ({ width: 0 }),
      createPattern: () => ({}),
      strokeStyle: '',
      lineWidth: 0,
      textAlign: '',
      font: '',
      shadowColor: '',
      shadowBlur: 0
    };
    const mockCanvas = { getContext: () => mockCtx, width: 800, height: 600 };
    mockCtx.canvas = mockCanvas;
    renderer = new Renderer(mockCanvas, new AssetManager());
    renderer.init();
  });

  afterEach(async () => {
    if (playerSnapshot) {
      playerSnapshot.destroy();
      playerSnapshot = null;
    }
    // Clear event listeners to prevent handlers from previous games accumulating
    if (hostNetwork) hostNetwork.clearEventListeners();
    if (playerNetwork) playerNetwork.clearEventListeners();
  });

  afterAll(async () => {
    if (hostNetwork) hostNetwork.disconnect();
    if (playerNetwork) playerNetwork.disconnect();
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

    const result = playerSnapshot.getInterpolatedPlayerState(hostUser.id, renderTime);

    // halfway between 0 and 5 is 2.5
    expect(result.x).toBeCloseTo(2.5, 1);
    expect(result.y).toBe(0);
  }, 15000);

  test('should animate remote players based on interpolated velocity', async () => {
    // 1. Host Game
    const { session } = await hostNetwork.hostGame('HostAnimate');

    // 2. Join Game
    await playerNetwork.joinGame(session.join_code, 'PlayerAnimate');

    // 3. Setup Snapshot on Player side
    playerSnapshot = new SessionPlayersSnapshot(playerNetwork, session.id);
    await playerSnapshot.ready();

    // Wait for host player to appear in snapshot
    await waitFor(() => playerSnapshot.getPlayers().has(hostUser.id), 5000);

    // 4. Send movement updates from Host (velocity_x = 100)
    // We need at least 2 updates to have a velocity to interpolate
    for (let i = 0; i < 5; i++) {
      hostNetwork.broadcastPlayerStateUpdate({
        player_id: hostUser.id,
        position_x: i * 5,
        position_y: 0,
        rotation: 0,
        velocity_x: 100,
        velocity_y: 0
      });
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Wait for history to be populated on player side
    await waitFor(() => {
      const p = playerSnapshot.getPlayers().get(hostUser.id);
      return p && p.positionHistory && p.positionHistory.length >= 2;
    }, 5000);

    // 5. Simulate Render Loop on Player side
    // We'll call renderer.render manually multiple times
    const startTime = performance.now();
    const duration = 500; // 0.5s of animation
    const fps = 60;
    const dt = 1 / fps;
    const mockGameState = {
      conflictZone: { centerX: 0, centerY: 0, radius: 1000 },
      loot: []
    };

    for (let t = 0; t < duration; t += (1000 / fps)) {
      renderer.render(mockGameState, null, playerSnapshot, null, dt);
      await new Promise(resolve => setTimeout(resolve, 1000 / fps));
    }

    // 6. Verify Animation State
    const playerViewOfHost = playerSnapshot.getPlayers().get(hostUser.id);
    const animState = renderer.remoteAnimationStates.get(hostUser.id);

    expect(animState).toBeDefined();
    // At 100px/s, it should be moving, so frame should have advanced from 0
    expect(animState.currentFrame).toBeGreaterThan(0);
  }, 20000);
});
