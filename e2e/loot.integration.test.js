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

    // Warm up Supabase Realtime connections to avoid cold-start timing issues
    // This establishes the WebSocket connection before the actual tests run
    const warmupChannel1 = hostSupabase.channel('warmup-host');
    const warmupChannel2 = playerSupabase.channel('warmup-player');

    await Promise.all([
      new Promise(resolve => warmupChannel1.subscribe(status => status === 'SUBSCRIBED' && resolve())),
      new Promise(resolve => warmupChannel2.subscribe(status => status === 'SUBSCRIBED' && resolve()))
    ]);

    // Keep channels connected briefly to ensure WebSocket is stable
    await new Promise(resolve => setTimeout(resolve, 200));

    // Clean up warmup channels
    await hostSupabase.removeChannel(warmupChannel1);
    await playerSupabase.removeChannel(warmupChannel2);

    // Longer delay after warmup to ensure connection is fully stable
    await new Promise(resolve => setTimeout(resolve, 300));
  });

  beforeEach(async () => {
    // Longer delay to ensure previous channels are fully closed
    await new Promise(resolve => setTimeout(resolve, 750));

    // Force remove ALL channels from Supabase clients before starting fresh
    // This ensures no lingering subscriptions from previous tests
    const hostChannels = hostSupabase.getChannels();
    for (const channel of hostChannels) {
      await hostSupabase.removeChannel(channel);
    }
    const playerChannels = playerSupabase.getChannels();
    for (const channel of playerChannels) {
      await playerSupabase.removeChannel(channel);
    }

    hostNetwork = new Network();
    hostNetwork.initialize(hostSupabase, hostUserId);

    playerNetwork = new Network();
    playerNetwork.initialize(playerSupabase, playerUserId);
  });

  afterEach(async () => {
    // Destroy snapshots first (they have listeners on networks)
    if (hostSnapshot) {
      hostSnapshot.destroy();
      hostSnapshot = null;
    }
    if (playerSnapshot) {
      playerSnapshot.destroy();
      playerSnapshot = null;
    }

    // Disconnect networks (closes Supabase channels)
    if (hostNetwork) {
      hostNetwork.disconnect();
      hostNetwork = null;
    }
    if (playerNetwork) {
      playerNetwork.disconnect();
      playerNetwork = null;
    }

    // Clean up test data
    if (testSessionId) {
      await hostSupabase.from('game_sessions').delete().match({ id: testSessionId });
      testSessionId = null;
    }

    // Wait for Supabase channels to fully close before next test
    await new Promise(resolve => setTimeout(resolve, 500));
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

    // Wait for Host to see player in snapshot before moving
    await waitFor(() => {
      return hostSnapshot.getPlayers().has(playerNetwork.playerId);
    }, 10000);

    // 3. Host spawns a spear
    const lootX = 1300;
    const lootY = 900;
    const spawnedSpear = hostGame.hostLootManager.spawnLoot('spear', lootX, lootY);

    // Verify loot appears on both
    let syncRequestTime = 0;
    await waitFor(() => {
      // Run updates to process events
      hostGame.update(0.05);
      playerGame.update(0.05);

      const expectedCount = CONFIG.GAME.INITIAL_LOOT_COUNT + 1;

      // If player is missing loot, request sync periodically (every 2s)
      if (playerGame.state.loot.length < expectedCount) {
        const now = Date.now();
        if (now - syncRequestTime > 2000) {
          console.log('Test: Player missing loot, requesting sync...');
          playerNetwork.send('request_loot_sync', {});
          syncRequestTime = now;
        }
      }

      if (hostGame.state.loot.length !== expectedCount || playerGame.state.loot.length !== expectedCount) {
        // console.log(`Loot counts - Host: ${hostGame.state.loot.length}, Player: ${playerGame.state.loot.length} (Expected: ${expectedCount})`);
      }
      return hostGame.state.loot.length === expectedCount && playerGame.state.loot.length === expectedCount;
    }, 20000);

    const foundSpear = playerGame.state.loot.find(l => l.id === spawnedSpear.id);
    expect(foundSpear).toBeDefined();
    expect(foundSpear.item_id).toBe('spear');

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
    }, 15000);

    // Update player game to trigger collision detection
    await waitFor(() => {
      playerGame.update(0.1);
      hostGame.update(0.1);
      return playerGame.getLocalPlayer().equipped_weapon === 'spear';
    }, 15000);

    // Verify loot is gone for both
    await waitFor(() => {
      playerGame.update(0.1);
      hostGame.update(0.1);

      const hasWeapon = playerGame.getLocalPlayer().equipped_weapon === 'spear';
      const hasLoot = playerGame.state.loot.some(item => item.id === spawnedSpear.id);

      if (hasWeapon && hasLoot) {
        const now = Date.now();
        if (now - syncRequestTime > 2000) {
          console.log('Test: Player has weapon but loot exists, requesting sync...');
          playerNetwork.send('request_loot_sync', {});
          syncRequestTime = now;
        }
      }

      return !playerGame.state.loot.some(item => item.id === spawnedSpear.id);
    }, 10000);

    expect(playerGame.state.loot.some(item => item.id === spawnedSpear.id)).toBe(false);
    expect(hostSnapshot.getPlayers().get(playerNetwork.playerId).equipped_weapon).toBe('spear');
  }, 40000);

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

    // Wait for Host to see player in snapshot before interacting
    await waitFor(() => {
      return hostSnapshot.getPlayers().has(playerNetwork.playerId);
    }, 10000);

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
      hostGame.update(0.1);
      return playerGame.state.loot.length >= CONFIG.GAME.INITIAL_LOOT_COUNT;
    }, 20000);

    // 3. Host spawns a spear
    const lootX = 1100;
    const lootY = 1100;
    const spawnedSpear = hostGame.hostLootManager.spawnLoot('spear', lootX, lootY);

    let syncRequestTime = 0;
    await waitFor(() => {
      hostGame.update(0.016);
      playerGame.update(0.016);

      // Retry sync if loot not found
      if (!playerGame.state.loot.some(l => l.id === spawnedSpear.id)) {
        const now = Date.now();
        if (now - syncRequestTime > 2000) {
          playerNetwork.send('request_loot_sync', {});
          syncRequestTime = now;
        }
      }
      return playerGame.state.loot.some(l => l.id === spawnedSpear.id);
    }, 25000);

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

    // Should still have bo and loot should still be there
    expect(playerGame.getLocalPlayer().equipped_weapon).toBe('bo');
    expect(playerGame.state.loot.some(l => l.id === spawnedSpear.id)).toBe(true);

    // 5. Player presses F (with retry logic for network robustness)
    await waitFor(async () => {
      // Press F
      playerGame.handleInput({ interact: true });

      // Run a few updates to allow message to send and process
      playerGame.update(0.1);
      hostGame.update(0.1);

      if (playerGame.getLocalPlayer().equipped_weapon === 'spear') return true;

      // Release F to reset the 'rising edge' detection
      playerGame.handleInput({ interact: false });
      playerGame.update(0.1);

      return playerGame.getLocalPlayer().equipped_weapon === 'spear';
    }, 15000, 200); // Polling every 200ms

    // 6. Verify old weapon 'bo' was dropped
    let droppedBo = null;
    await waitFor(() => {
      playerGame.update(0.1);
      hostGame.update(0.1);
      droppedBo = playerGame.state.loot.find(item => item.item_id === 'bo');
      return droppedBo !== undefined && !playerGame.state.loot.some(l => l.id === spawnedSpear.id);
    }, 15000);

    expect(droppedBo).toBeDefined();
    expect(playerGame.state.loot.some(l => l.id === spawnedSpear.id)).toBe(false);
  }, 50000);
});
