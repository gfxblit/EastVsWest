
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
    test('Supabase environment variables not set, skipping integration tests', () => {
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

  test('should end game when a bot kills the host', async () => {
    // Use a unique session for this test
    const hostName = 'HostPlayer';
    const { session } = await network.hostGame(hostName);
    testSessionId = session.id;

    // Start game with bots
    await network.startGame();

    // Setup snapshot and game
    const { SessionPlayersSnapshot } = await import('../src/SessionPlayersSnapshot.js');
    const { Game } = await import('../src/game.js');
    
    const snapshot = new SessionPlayersSnapshot(network, session.id);
    await snapshot.ready();

    const game = new Game();
    game.init(snapshot, network, null);

    // Find the bot
    const players = snapshot.getPlayers();
    const bot = Array.from(players.values()).find(p => p.is_bot);
    expect(bot).toBeDefined();

    // Set all other bots to 0 health first
    const otherBots = Array.from(players.values()).filter(p => p.is_bot && p.player_id !== bot.player_id);
    const botUpdates = otherBots.map(b => ({
        player_id: b.player_id,
        health: 0
    }));
    if (botUpdates.length > 0) {
        await network.writePlayerStateToDB(botUpdates);
    }

    // Position host and bot close together and set low host health
    await network.writePlayerStateToDB(hostUser.id, {
        position_x: 100,
        position_y: 100,
        health: 5 // One hit kill
    });
    
    await network.writePlayerStateToDB(bot.player_id, {
        position_x: 110, // Close to host
        position_y: 100,
        health: 100,
        equipped_weapon: 'fist'
    });

    // Wait for snapshot to reflect the health and position updates
    await waitFor(() => {
        const h = snapshot.getPlayers().get(hostUser.id);
        const b = snapshot.getPlayers().get(bot.player_id);
        return h && h.health === 5 && b && b.position_x === 110;
    }, 5000, 100);

    // Listen for Game Over
    let gameOverData = null;
    network.on('game_over', (msg) => {
        gameOverData = msg;
    });

    // Manually trigger bot attack (simulating BotController)
    network.sendFrom(bot.player_id, 'attack_request', {
        aim_x: 100,
        aim_y: 100,
        is_special: false
    });

    // Wait for processing
    await waitFor(() => gameOverData !== null, 5000, 200);

    expect(gameOverData).toBeDefined();
    expect(gameOverData.data.winner_id).toBe(bot.player_id);
    expect(game.state.isRunning).toBe(false);
  });
});
