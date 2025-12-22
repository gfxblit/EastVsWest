import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';

// Ensure your local Supabase URL and anon key are set as environment variables
// before running this test.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Network Module Integration with Supabase', () => {
  let supabaseClient;
  let network;
  let testSessionId; // To store the ID of the created session for cleanup
  let hostUser; // Store authenticated host user
  let playerUser; // Store authenticated player user

  // A check to ensure the test doesn't run without the necessary config
  if (!supabaseUrl || !supabaseAnonKey) {
    test.only('Supabase environment variables not set, skipping integration tests', () => {
      console.warn('Set SUPABASE_URL and SUPABASE_ANON_KEY to run integration tests.');
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    // Initialize a REAL Supabase client
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Sign in anonymously to get an authenticated session for the host
    const { data: authData, error: authError } = await supabaseClient.auth.signInAnonymously();
    if (authError) {
      throw new Error(`Failed to authenticate host: ${authError.message}`);
    }
    hostUser = authData.user;

    network = new Network();
    network.initialize(supabaseClient, hostUser.id);
  });

  afterAll(async () => {
    // Sign out after all tests
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
  });

  afterEach(async () => {
    // Clean up the created test data after each test
    if (testSessionId) {
      await supabaseClient.from('game_sessions').delete().match({ id: testSessionId });
      testSessionId = null;
    }
  });

  test('hostGame() should create a new record in the game_sessions table', async () => {
    const joinCode = await network.hostGame();

    expect(joinCode).toBeDefined();
    expect(typeof joinCode).toBe('string');
    expect(joinCode.length).toBe(6);

    // Verify the record exists in the database
    const { data, error } = await supabaseClient
      .from('game_sessions')
      .select('*')
      .eq('join_code', joinCode)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.join_code).toBe(joinCode);
    expect(data.status).toBe('lobby');

    // Store the ID for cleanup
    testSessionId = data.id;
  });

  test('joinGame() should add a player to an existing session', async () => {
    // First, create a host session (using the existing authenticated host)
    const joinCode = await network.hostGame();

    // Store session ID for cleanup
    const { data: sessionData } = await supabaseClient
      .from('game_sessions')
      .select('id')
      .eq('join_code', joinCode)
      .single();
    testSessionId = sessionData.id;

    // Create a new Supabase client for the player and authenticate
    const playerClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerAuthData, error: playerAuthError } = await playerClient.auth.signInAnonymously();
    if (playerAuthError) {
      throw new Error(`Failed to authenticate player: ${playerAuthError.message}`);
    }
    playerUser = playerAuthData.user;

    // Now, create a new player network instance and join the session
    const playerNetwork = new Network();
    const playerName = 'TestPlayer';
    playerNetwork.initialize(playerClient, playerUser.id);

    const session = await playerNetwork.joinGame(joinCode, playerName);

    // Verify the session was returned
    expect(session).toBeDefined();
    expect(session.join_code).toBe(joinCode);
    expect(session.status).toBe('lobby');

    // Verify network state was updated
    expect(playerNetwork.isHost).toBe(false);
    expect(playerNetwork.joinCode).toBe(joinCode);
    expect(playerNetwork.connected).toBe(true);

    // Verify the player was added to session_players table
    const { data: playerData, error: playerError } = await supabaseClient
      .from('session_players')
      .select('*')
      .eq('session_id', sessionData.id)
      .eq('player_id', playerUser.id)
      .single();

    expect(playerError).toBeNull();
    expect(playerData).not.toBeNull();
    expect(playerData.player_name).toBe(playerName);
    expect(playerData.is_host).toBe(false);
    expect(playerData.is_connected).toBe(true);

    // Clean up: sign out the player
    await playerClient.auth.signOut();
  });

  test('joinGame() should fail when session does not exist', async () => {
    // Create a new authenticated player
    const playerClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerAuthData } = await playerClient.auth.signInAnonymously();

    const playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerAuthData.user.id);

    await expect(playerNetwork.joinGame('INVALID', 'TestPlayer'))
      .rejects.toThrow();

    // Clean up
    await playerClient.auth.signOut();
  });

  test('joinGame() should fail when session is not in lobby status', async () => {
    // Create a session using the existing authenticated host
    const joinCode = await network.hostGame();

    // Update session status to 'active'
    const { data: sessionData } = await supabaseClient
      .from('game_sessions')
      .select('id')
      .eq('join_code', joinCode)
      .single();
    testSessionId = sessionData.id;

    await supabaseClient
      .from('game_sessions')
      .update({ status: 'active' })
      .eq('id', sessionData.id);

    // Create a new authenticated player to try joining
    const playerClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerAuthData } = await playerClient.auth.signInAnonymously();

    const playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerAuthData.user.id);

    await expect(playerNetwork.joinGame(joinCode, 'TestPlayer'))
      .rejects.toThrow('Session is not joinable');

    // Clean up
    await playerClient.auth.signOut();
  });
});
