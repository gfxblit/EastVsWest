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
});
