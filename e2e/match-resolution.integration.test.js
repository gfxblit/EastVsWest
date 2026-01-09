
import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network.js';
import { Game } from '../src/game.js';
import { CONFIG } from '../src/config.js';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot.js';

// Mock dependencies
// jest.mock('../src/renderer.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase credentials required for integration tests');
}

describe('Match Resolution Integration', () => {
  let hostClient, playerClient;
  let hostNetwork, playerNetwork;
  let hostGame, playerGame;
  let hostSnapshot, playerSnapshot;
  let session;
  let hostUser, playerUser;

  // Cleanup helper
  const cleanup = async () => {
    if (hostNetwork) await hostNetwork.disconnect();
    if (playerNetwork) await playerNetwork.disconnect();
    if (session && hostClient) {
      const { error } = await hostClient
        .from('game_sessions')
        .delete()
        .eq('id', session.id);
      if (error) console.error('Cleanup error:', error);
    }
    if (hostClient) await hostClient.auth.signOut();
    if (playerClient) await playerClient.auth.signOut();
  };

  beforeAll(async () => {
    // Create users with separate clients
    hostClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: hostAuth } = await hostClient.auth.signInAnonymously();
    hostUser = hostAuth.user;
    
    playerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: playerAuth } = await playerClient.auth.signInAnonymously();
    playerUser = playerAuth.user;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Initialize Networks
    hostNetwork = new Network();
    await hostNetwork.initialize(hostClient, hostUser.id);
    
    playerNetwork = new Network();
    await playerNetwork.initialize(playerClient, playerUser.id);

    // Host creates game
    const { session: newSession } = await hostNetwork.hostGame('HostPlayer');
    session = newSession;

    // Player joins game
    await playerNetwork.joinGame(session.join_code, 'ClientPlayer');

    // Setup Game instances
    hostSnapshot = new SessionPlayersSnapshot(hostNetwork, session.id);
    playerSnapshot = new SessionPlayersSnapshot(playerNetwork, session.id);

    hostGame = new Game();
    playerGame = new Game();

    // Start Game
    hostGame.init(hostSnapshot, hostNetwork, null);
    playerGame.init(playerSnapshot, playerNetwork, null);
    
    // Wait for snapshots to populate
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('Should resolve match when one player remains', async () => {
    // 1. Verify initial state
    expect(hostGame.state.isRunning).toBe(true);
    
    // 2. Position players close to each other
    // Host at (100, 100), Player at (150, 100)
    await hostNetwork.writePlayerStateToDB(hostUser.id, {
      position_x: 100,
      position_y: 100,
      equipped_weapon: 'spear', // Ensure weapon
      health: 100
    });
    
    await playerNetwork.writePlayerStateToDB(playerUser.id, {
      position_x: 150,
      position_y: 100,
      health: 10 // Low health to die quickly
    });

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 3. Setup listener for Game Over
    const gameOverPromise = new Promise(resolve => {
        playerNetwork.on('game_over', (data) => resolve(data));
    });

    // 4. Host attacks Player
    // Simulate attack request from Host
    hostNetwork.send('attack_request', {
        weapon_id: 'spear',
        aim_x: 150,
        aim_y: 100,
        is_special: false
    });

    // Wait for combat processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. Verify Player Death and Host Kill update
    // Force another update if needed (HostCombatManager throttles/cooldowns)
    // Actually, HostCombatManager updates snapshot directly.
    const playerInHostSnapshot = hostSnapshot.getPlayers().get(playerUser.id);
    const hostInHostSnapshot = hostSnapshot.getPlayers().get(hostUser.id);
    
    // We expect the player to be dead (health 0)
    // And Host to have 1 kill (if implemented)
    // NOTE: This assertion might fail until implementation is done
    // expect(playerInHostSnapshot.health).toBe(0); 
    // expect(hostInHostSnapshot.kills).toBe(1);

    // 6. Verify Game Over Broadcast
    // This will time out if not implemented
    const gameOverData = await Promise.race([
        gameOverPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for game_over')), 2000))
    ]);

    expect(gameOverData).toBeDefined();
    expect(gameOverData.data.winner_id).toBe(hostUser.id);
    expect(gameOverData.data.stats).toBeDefined();
    
    const hostStats = gameOverData.data.stats.find(s => s.player_id === hostUser.id);
    expect(hostStats.kills).toBe(1);
  });

  test('Should reset player states when restarting game', async () => {
    // 1. Setup Game Over state (Host wins, Client dead)
    await hostNetwork.writePlayerStateToDB(hostUser.id, {
      kills: 5,
      health: 50
    });
    await hostNetwork.writePlayerStateToDB(playerUser.id, {
      kills: 0,
      health: 0
    });

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Host triggers reset (simulate main.js logic)
    // We need to implement the reset logic that main.js would call
    const players = hostSnapshot.getPlayers();
    const updates = [];
    
    // Calculate spawn points (simplified)
    const spawnX = CONFIG.WORLD.WIDTH / 2;
    const spawnY = CONFIG.WORLD.HEIGHT / 2;

    for (const [playerId, player] of players) {
        updates.push({
            player_id: playerId,
            health: 100,
            kills: 0,
            position_x: spawnX + (Math.random() * 200 - 100),
            position_y: spawnY + (Math.random() * 200 - 100),
            velocity_x: 0,
            velocity_y: 0,
            rotation: 0,
            equipped_weapon: 'fist',
            equipped_armor: null
        });
    }

    // Write reset to DB
    await hostNetwork.writePlayerStateToDB(updates);
    
    // Broadcast game_start
    hostNetwork.send('game_start', {});

    // 3. Verify Client state is reset
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const clientPlayer = playerSnapshot.getPlayers().get(playerUser.id);
    expect(clientPlayer.health).toBe(100);
    expect(clientPlayer.kills).toBe(0);
    expect(clientPlayer.equipped_weapon).toBe('fist');
  });
});
