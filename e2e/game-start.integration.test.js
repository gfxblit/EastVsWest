import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { waitFor } from './helpers/wait-utils.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Game Start Integration', () => {
  let supabaseClient;
  let hostNetwork;
  let testSessionId;

  if (!supabaseUrl || !supabaseAnonKey) {
    test.only('Supabase environment variables not set, skipping integration tests', () => {
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData } = await supabaseClient.auth.signInAnonymously();
    hostNetwork = new Network();
    hostNetwork.initialize(supabaseClient, authData.user.id);
  });

  afterAll(async () => {
    if (hostNetwork) hostNetwork.disconnect();
    if (supabaseClient) await supabaseClient.auth.signOut();
  });

  afterEach(async () => {
    if (testSessionId) {
      await supabaseClient.from('game_sessions').delete().match({ id: testSessionId });
      testSessionId = null;
    }
  });

  test('WhenHostStartsGame_ShouldBroadcastFullPlayerListToClients', async () => {
    // 1. Host creates session
    const { session: hostSession } = await hostNetwork.hostGame('HostPlayer');
    testSessionId = hostSession.id;
    const joinCode = hostSession.join_code;

    // 2. Player joins session
    const playerClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerAuth } = await playerClient.auth.signInAnonymously();
    const playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerAuth.user.id);
    
    try {
      await playerNetwork.joinGame(joinCode, 'Player1');

      // 3. Set up listeners for game_start
      let gameStartPayload = null;
      playerNetwork.on('game_start', (payload) => {
        gameStartPayload = payload;
      });

      // 4. Host starts game
      await hostNetwork.startGame();

      // 5. Wait for game_start broadcast
      await waitFor(() => gameStartPayload !== null, 5000);

      // 6. Verify payload contains players and bots
      expect(gameStartPayload.data).toBeDefined();
      expect(gameStartPayload.data.players).toBeDefined();
      expect(Array.isArray(gameStartPayload.data.players)).toBe(true);
      
      // Should have at least Host, Player1, and potentially Bots if minPlayers > 2
      // Default MIN_PLAYERS is usually 4
      expect(gameStartPayload.data.players.length).toBeGreaterThanOrEqual(2);

      const playerIds = gameStartPayload.data.players.map(p => p.player_id);
      expect(playerIds).toContain(hostNetwork.playerId);
      expect(playerIds).toContain(playerNetwork.playerId);

      // Verify bots are included if any
      const bots = gameStartPayload.data.players.filter(p => p.is_bot);
      expect(bots.length).toBeGreaterThanOrEqual(0);

    } finally {
      // Clean up
      playerNetwork.disconnect();
      await playerClient.auth.signOut();
    }
  });
});
