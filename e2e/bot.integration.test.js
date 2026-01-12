
import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { waitFor } from './helpers/wait-utils.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Bot Integration', () => {
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
    if (testSessionId) {
      await supabaseClient.from('game_sessions').delete().match({ id: testSessionId });
      testSessionId = null;
    }
  });

  test('should add bots when starting game with insufficient players', async () => {
    const hostName = 'HostPlayer';
    const { session } = await network.hostGame(hostName);
    testSessionId = session.id;

    // Config says MIN_PLAYERS is 4. Currently 1 player (Host).
    // Should add 3 bots.
    
    // We assume network.startGame() will handle this logic or we call a new method
    // For TDD, let's assume we will modify network.startGame() to accept an option or handle it auto.
    // The requirements say "Bots are added only when the Host clicks 'Start Game'".
    // So network.startGame() is the likely place.
    
    await network.startGame();

    // Verify bots added to DB
    const { data: players, error } = await supabaseClient
      .from('session_players')
      .select('*')
      .eq('session_id', session.id);

    expect(error).toBeNull();
    
    const humanPlayers = players.filter(p => !p.is_bot);
    const botPlayers = players.filter(p => p.is_bot);

    expect(humanPlayers.length).toBe(1);
    expect(botPlayers.length).toBe(3); // 4 total - 1 human = 3 bots
    
    expect(botPlayers[0].player_name).toMatch(/Bot-\d+/);
    expect(botPlayers[0].is_bot).toBe(true);
  });
});
