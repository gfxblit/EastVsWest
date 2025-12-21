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

  // A check to ensure the test doesn't run without the necessary config
  if (!supabaseUrl || !supabaseAnonKey) {
    test.only('Supabase environment variables not set, skipping integration tests', () => {
      console.warn('Set SUPABASE_URL and SUPABASE_ANON_KEY to run integration tests.');
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(() => {
    // Initialize a REAL Supabase client
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    network = new Network();

    // In a real app, you'd get the hostId from an authenticated user.
    // For this test, we can use a static UUID.
    const mockHostId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    network.initialize(supabaseClient, mockHostId);
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
    // First, create a host session
    const hostNetwork = new Network();
    const mockHostId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    hostNetwork.initialize(supabaseClient, mockHostId);
    const joinCode = await hostNetwork.hostGame();

    // Store session ID for cleanup
    const { data: sessionData } = await supabaseClient
      .from('game_sessions')
      .select('id')
      .eq('join_code', joinCode)
      .single();
    testSessionId = sessionData.id;

    // Now, create a new player and join the session
    const playerNetwork = new Network();
    const mockPlayerId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const playerName = 'TestPlayer';
    playerNetwork.initialize(supabaseClient, mockPlayerId);

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
      .eq('player_id', mockPlayerId)
      .single();

    expect(playerError).toBeNull();
    expect(playerData).not.toBeNull();
    expect(playerData.player_name).toBe(playerName);
    expect(playerData.is_host).toBe(false);
    expect(playerData.is_connected).toBe(true);
  });

  test('joinGame() should fail when session does not exist', async () => {
    const playerNetwork = new Network();
    const mockPlayerId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    playerNetwork.initialize(supabaseClient, mockPlayerId);

    await expect(playerNetwork.joinGame('INVALID', 'TestPlayer'))
      .rejects.toThrow();
  });

  test('joinGame() should fail when session is not in lobby status', async () => {
    // Create a session and manually set its status to 'active'
    const hostNetwork = new Network();
    const mockHostId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    hostNetwork.initialize(supabaseClient, mockHostId);
    const joinCode = await hostNetwork.hostGame();

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

    // Try to join
    const playerNetwork = new Network();
    const mockPlayerId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    playerNetwork.initialize(supabaseClient, mockPlayerId);

    await expect(playerNetwork.joinGame(joinCode, 'TestPlayer'))
      .rejects.toThrow('Session is not joinable');
  });
});
