import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { Game } from '../src/game';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { waitFor } from './helpers/wait-utils.js';
import { CONFIG } from '../src/config.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Slashing Sync Integration', () => {
  let hostSupabase;
  let playerSupabase;
  let hostNetwork;
  let playerNetwork;
  let hostGame;
  let playerGame;
  let hostSnapshot;
  let playerSnapshot;
  let testSessionId;
  let hostUserId;
  let playerUserId;

  if (!supabaseUrl || !supabaseAnonKey) {
    test('Supabase environment variables not set, skipping integration tests', () => {
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    hostSupabase = createClient(supabaseUrl, supabaseAnonKey);
    playerSupabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: hostAuth } = await hostSupabase.auth.signInAnonymously();
    const { data: playerAuth } = await playerSupabase.auth.signInAnonymously();
    
    hostUserId = hostAuth.user.id;
    playerUserId = playerAuth.user.id;

    hostNetwork = new Network();
    hostNetwork.initialize(hostSupabase, hostUserId);

    playerNetwork = new Network();
    playerNetwork.initialize(playerSupabase, playerUserId);

    const { session: hostSession } = await hostNetwork.hostGame('Host');
    testSessionId = hostSession.id;

    hostSnapshot = new SessionPlayersSnapshot(hostNetwork, hostSession.id);
    await hostSnapshot.ready();
    
    hostGame = new Game();
    hostGame.init(hostSnapshot, hostNetwork);

    await playerNetwork.joinGame(hostSession.join_code, 'Player');
    
    playerSnapshot = new SessionPlayersSnapshot(playerNetwork, hostSession.id);
    await playerSnapshot.ready();

    playerGame = new Game();
    playerGame.init(playerSnapshot, playerNetwork);
  }, 20000);

  afterAll(async () => {
    if (hostNetwork) hostNetwork.disconnect();
    if (playerNetwork) playerNetwork.disconnect();
    if (hostSnapshot) hostSnapshot.destroy();
    if (playerSnapshot) playerSnapshot.destroy();
    if (testSessionId) {
      await hostSupabase.from('game_sessions').delete().match({ id: testSessionId });
    }
  });

  test('should sync isAttacking state from host to player', async () => {
    // Host attacks
    hostGame.handleInput({ attack: true });
    hostGame.update(0.016);
    hostGame.handleInput({ attack: false });

    // Verify player sees host attacking
    await waitFor(() => {
      playerGame.update(0.016);
      const players = playerSnapshot.getPlayers();
      const hostAtPlayer = players.get(hostUserId);
      return hostAtPlayer && hostAtPlayer.is_attacking === true;
    }, 5000);

    // Verify it resets
    await waitFor(() => {
      playerGame.update(0.016);
      const players = playerSnapshot.getPlayers();
      const hostAtPlayer = players.get(hostUserId);
      return hostAtPlayer && hostAtPlayer.is_attacking === false;
    }, 5000);
  }, 15000);
});
