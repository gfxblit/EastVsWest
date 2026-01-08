import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { Game } from '../src/game';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { waitFor } from './helpers/wait-utils.js';
import { CONFIG } from '../src/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Loot Integration', () => {
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
  });

  beforeEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 500));

    hostNetwork = new Network();
    hostNetwork.initialize(hostSupabase, hostUserId);

    playerNetwork = new Network();
    playerNetwork.initialize(playerSupabase, playerUserId);
  });

  afterEach(async () => {
    if (hostNetwork) hostNetwork.disconnect();
    if (playerNetwork) playerNetwork.disconnect();
    if (hostSnapshot) hostSnapshot.destroy();
    if (playerSnapshot) playerSnapshot.destroy();
    if (testSessionId) {
      await hostSupabase.from('game_sessions').delete().match({ id: testSessionId });
      testSessionId = null;
    }
  });

  test('should spawn loot, auto-pickup when unarmed, and sync across clients', async () => {
    // 1. Host creates game
    const { session: hostSession } = await hostNetwork.hostGame('Host');
    testSessionId = hostSession.id;

    hostSnapshot = new SessionPlayersSnapshot(hostNetwork, hostSession.id);
    await hostSnapshot.ready();
    
    hostGame = new Game();
    hostGame.init(hostSnapshot, hostNetwork);

    // 2. Player joins game
    await playerNetwork.joinGame(hostSession.join_code, 'Player');
    
    playerSnapshot = new SessionPlayersSnapshot(playerNetwork, hostSession.id);
    await playerSnapshot.ready();

    playerGame = new Game();
    playerGame.init(playerSnapshot, playerNetwork);

    // 3. Host spawns a spear
    const lootX = 1300;
    const lootY = 900;
    hostGame.hostLootManager.spawnLoot('spear', lootX, lootY);

    // Verify loot appears on both
    await waitFor(() => {
      // Run updates to process events
      hostGame.update(0.05);
      playerGame.update(0.05);
      const expectedCount = CONFIG.GAME.INITIAL_LOOT_COUNT + 1;
      if (hostGame.state.loot.length !== expectedCount || playerGame.state.loot.length !== expectedCount) {
        console.log(`Loot counts - Host: ${hostGame.state.loot.length}, Player: ${playerGame.state.loot.length} (Expected: ${expectedCount})`);
      }
      return hostGame.state.loot.length === expectedCount && playerGame.state.loot.length === expectedCount;
    }, 20000);

    expect(playerGame.state.loot[0].item_id).toBe('spear');

    // 4. Player walks over loot (unarmed)
    // ALSO update local controller state directly so collision logic sees it
    playerGame.localPlayerController.player.x = lootX - 5;
    playerGame.localPlayerController.player.y = lootY - 5;

    // Send position update via network so Host sees it immediately
    playerNetwork.broadcastPlayerStateUpdate({
        player_id: playerNetwork.playerId,
        position_x: lootX - 5,
        position_y: lootY - 5,
        health: 100,
        velocity_x: 0,
        velocity_y: 0
    });

    // Wait for player position to sync at host (so pickup logic can run)
    await waitFor(() => {
      hostGame.update(0.05); // Run host update to process incoming messages
      const p = hostSnapshot.getPlayers().get(playerNetwork.playerId);
      return p && Math.abs(p.position_x - (lootX - 5)) < 1;
    }, 10000);

    // Update player game to trigger collision detection
    await waitFor(() => {
        playerGame.update(0.1);
        hostGame.update(0.1);
        return playerGame.getLocalPlayer().equipped_weapon === 'spear';
    }, 15000);

    // Verify loot is gone for both
    const finalExpectedCount = CONFIG.GAME.INITIAL_LOOT_COUNT;
    expect(playerGame.state.loot).toHaveLength(finalExpectedCount);
    expect(hostGame.state.loot).toHaveLength(finalExpectedCount);
    expect(hostSnapshot.getPlayers().get(playerNetwork.playerId).equipped_weapon).toBe('spear');
  }, 30000);

  test('should swap weapons when pressing F and drop old weapon', async () => {
    // 1. Host creates game
    const { session: hostSession } = await hostNetwork.hostGame('Host');
    testSessionId = hostSession.id;

    hostSnapshot = new SessionPlayersSnapshot(hostNetwork, hostSession.id);
    await hostSnapshot.ready();
    
    hostGame = new Game();
    hostGame.init(hostSnapshot, hostNetwork);

    // 2. Player joins game
    await playerNetwork.joinGame(hostSession.join_code, 'Player');
    
    playerSnapshot = new SessionPlayersSnapshot(playerNetwork, hostSession.id);
    await playerSnapshot.ready();

    playerGame = new Game();
    playerGame.init(playerSnapshot, playerNetwork);

    // Give player a 'bo' initially
    await playerSupabase.from('session_players')
      .update({ equipped_weapon: 'bo', position_x: 1000, position_y: 1000 })
      .eq('player_id', playerNetwork.playerId);

    // Wait for weapon sync
    await waitFor(() => {
        playerGame.update(0.1);
        hostGame.update(0.1);
        const localP = playerGame.getLocalPlayer();
        return localP.equipped_weapon === 'bo';
    }, 15000);

    // Wait for initial loot sync (20 items)
    await waitFor(() => {
        playerGame.update(0.1);
        return playerGame.state.loot.length === CONFIG.GAME.INITIAL_LOOT_COUNT;
    }, 10000);

    // 3. Host spawns a spear
    const lootX = 1100;
    const lootY = 1100;
    hostGame.hostLootManager.spawnLoot('spear', lootX, lootY);

    await waitFor(() => {
        hostGame.update(0.016);
        playerGame.update(0.016);
        const expectedCount = CONFIG.GAME.INITIAL_LOOT_COUNT + 1;
        return playerGame.state.loot.length === expectedCount;
    }, 5000);

    // 4. Player moves to loot but does NOT press F (should NOT pickup)
    playerGame.localPlayerController.player.x = lootX - 5;
    playerGame.localPlayerController.player.y = lootY - 5;

    playerNetwork.broadcastPlayerStateUpdate({
        player_id: playerNetwork.playerId,
        position_x: lootX - 5,
        position_y: lootY - 5,
        velocity_x: 0,
        velocity_y: 0
    });

    // Wait for sync
    await waitFor(() => {
        hostGame.update(0.05);
        const p = hostSnapshot.getPlayers().get(playerNetwork.playerId);
        return p && Math.abs(p.position_x - (lootX - 5)) < 1;
    }, 10000);

    playerGame.update(0.1);
    hostGame.update(0.1);
    
    // Should still have bo and loot should still be there (random + specific)
    const initialExpectedCount = CONFIG.GAME.INITIAL_LOOT_COUNT + 1;
    expect(playerGame.getLocalPlayer().equipped_weapon).toBe('bo');
    expect(playerGame.state.loot).toHaveLength(initialExpectedCount);

    // 5. Player presses F
    playerGame.handleInput({ interact: true });
    
    await waitFor(() => {
        playerGame.update(0.1);
        hostGame.update(0.1);
        return playerGame.getLocalPlayer().equipped_weapon === 'spear';
    }, 15000);

    // 6. Verify old weapon 'bo' was dropped
    await waitFor(() => {
        playerGame.update(0.1);
        hostGame.update(0.1);
        return playerGame.state.loot.some(item => item.item_id === 'bo');
    }, 10000);

    // Count should still be the same (one picked up, one dropped)
    expect(playerGame.state.loot).toHaveLength(initialExpectedCount);
    expect(playerGame.state.loot.some(item => item.item_id === 'bo')).toBe(true);
  }, 40000);
});
