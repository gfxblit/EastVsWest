import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { waitFor } from './helpers/wait-utils.js';

// Ensure your local Supabase URL and anon key are set as environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Position Synchronization Integration', () => {
  let supabaseClient;
  let network;
  let testSessionId;
  let hostUser;

  if (!supabaseUrl || !supabaseAnonKey) {
    test.only('Supabase environment variables not set, skipping integration tests', () => {
      console.warn('Set SUPABASE_URL and SUPABASE_ANON_KEY to run integration tests.');
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData, error: authError } = await supabaseClient.auth.signInAnonymously();
    if (authError) throw new Error(`Failed to authenticate host: ${authError.message}`);
    hostUser = authData.user;

    network = new Network();
    network.initialize(supabaseClient, hostUser.id);
  });

  afterAll(async () => {
    if (network) network.disconnect();
    if (supabaseClient) await supabaseClient.auth.signOut();
  });

  afterEach(async () => {
    network.stopPeriodicMovementWrite();
    if (testSessionId) {
      await supabaseClient.from('game_sessions').delete().match({ id: testSessionId });
      testSessionId = null;
    }
  });

  test('writeMovementToDB() should update player position and velocity in database', async () => {
    // 1. Host a game
    const { session: hostSession } = await network.hostGame('HostPlayer');
    testSessionId = hostSession.id;

    // 2. Define new position and velocity data
    const newPosition = { x: 123.45, y: 678.90 };
    const newRotation = 1.57; // 90 degrees
    const newVelocity = { x: 10.5, y: 20.5 };

    // 3. Call writeMovementToDB
    await network.writeMovementToDB(newPosition.x, newPosition.y, newRotation, newVelocity.x, newVelocity.y);

    // 4. Verify in Database
    const { data: playerDbData, error: playerDbError } = await supabaseClient
      .from('session_players')
      .select('*')
      .eq('session_id', hostSession.id)
      .eq('player_id', hostUser.id)
      .single();

    expect(playerDbError).toBeNull();
    expect(playerDbData.position_x).toBeCloseTo(newPosition.x);
    expect(playerDbData.position_y).toBeCloseTo(newPosition.y);
    expect(playerDbData.velocity_x).toBeCloseTo(newVelocity.x);
    expect(playerDbData.velocity_y).toBeCloseTo(newVelocity.y);
    expect(playerDbData.rotation).toBeCloseTo(newRotation);
  });

  test('startPeriodicMovementWrite() should perform an immediate write to DB', async () => {
    // 1. Host a game
    const { session: hostSession } = await network.hostGame('HostPlayer');
    testSessionId = hostSession.id;

    // 2. Define getters
    const getPosition = () => ({ x: 500.1, y: 300.2 });
    const getRotation = () => 3.14;
    const getVelocity = () => ({ x: 5.5, y: 6.6 });

    // 3. Start periodic write
    network.startPeriodicMovementWrite(getPosition, getRotation, getVelocity);

    // 4. Wait for the async DB write to complete by checking for the updated value
    await waitFor(async () => {
      const { data } = await supabaseClient
        .from('session_players')
        .select('position_x')
        .eq('session_id', hostSession.id)
        .eq('player_id', hostUser.id)
        .single();
      return data && Math.abs(data.position_x - 500.1) < 0.1;
    });

    // 5. Verify in Database (full verification)
    const { data: playerDbData, error: playerDbError } = await supabaseClient
      .from('session_players')
      .select('*')
      .eq('session_id', hostSession.id)
      .eq('player_id', hostUser.id)
      .single();

    expect(playerDbError).toBeNull();
    expect(playerDbData.position_x).toBeCloseTo(500.1);
    expect(playerDbData.position_y).toBeCloseTo(300.2);
    expect(playerDbData.velocity_x).toBeCloseTo(5.5);
    expect(playerDbData.velocity_y).toBeCloseTo(6.6);
    expect(playerDbData.rotation).toBeCloseTo(3.14);
  });

  test('SessionPlayersSnapshot should pick up DB position updates', async () => {
    const { SessionPlayersSnapshot } = await import('../src/SessionPlayersSnapshot.js');

    // 1. Host a game (as Player A)
    const { session: hostSession } = await network.hostGame('HostPlayer');
    testSessionId = hostSession.id;

    // 2. Create Player B and join
    const playerBClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerBAuth } = await playerBClient.auth.signInAnonymously();
    const playerBNetwork = new Network();
    playerBNetwork.initialize(playerBClient, playerBAuth.user.id);
    await playerBNetwork.joinGame(hostSession.join_code, 'PlayerB');

    // 3. Player B sets up SessionPlayersSnapshot
    // Use a short refresh interval for testing
    const snapshotB = new SessionPlayersSnapshot(playerBNetwork, hostSession.id, { refreshIntervalMs: 500 });
    await snapshotB.ready();

    // 4. Host (Player A) writes new position to DB
    const newPos = { x: 800, y: 600 };
    const newVel = { x: 10, y: 20 };
    await network.writeMovementToDB(newPos.x, newPos.y, 0, newVel.x, newVel.y);

    // 5. Wait for Snapshot B to refresh
    await waitFor(() => {
      const p = snapshotB.getPlayers().get(hostUser.id);
      return p && p.position_x === newPos.x;
    }, 5000);

    // 6. Verify Player B sees Player A's new position
    const players = snapshotB.getPlayers();
    const playerA = players.get(hostUser.id);
    
    expect(playerA).toBeDefined();
    expect(playerA.position_x).toBe(newPos.x);
    expect(playerA.position_y).toBe(newPos.y);
    expect(playerA.velocity_x).toBe(newVel.x);
    expect(playerA.velocity_y).toBe(newVel.y);

    // Cleanup
    snapshotB.destroy();
    playerBNetwork.disconnect();
    await playerBClient.auth.signOut();
  });
});
