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
      return hostGame.state.loot.length === 1 && playerGame.state.loot.length === 1;
    }, 5000);

    expect(playerGame.state.loot[0].item_id).toBe('spear');

    // 4. Player walks over loot (unarmed)
    // Send position update via network so Host sees it immediately
    playerNetwork.broadcastPlayerStateUpdate({
        position_x: lootX - 5,
        position_y: lootY - 5,
        health: 100,
        velocity_x: 0,
        velocity_y: 0
    });
    
    // ALSO update local controller state directly so collision logic sees it
    playerGame.localPlayerController.player.x = lootX - 5;
    playerGame.localPlayerController.player.y = lootY - 5;

    // Wait for player position to sync at host (so pickup logic can run)
    await waitFor(() => {
      const p = hostSnapshot.getPlayers().get(playerNetwork.playerId);
      return p && Math.abs(p.position_x - (lootX - 5)) < 1;
    }, 5000);

    // Update player game to trigger collision detection
    await waitFor(() => {
        playerGame.update(0.1);
        hostGame.update(0.1);
        return playerGame.getLocalPlayer().equipped_weapon === 'spear';
    }, 10000);

    // Verify loot is gone for both
    expect(playerGame.state.loot).toHaveLength(0);
    expect(hostGame.state.loot).toHaveLength(0);
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
        const localP = playerGame.getLocalPlayer();
        console.log('Player weapon current:', localP.equipped_weapon);
        return localP.equipped_weapon === 'bo';
    }, 10000);

    // 3. Host spawns a spear
    const lootX = 1100;
    const lootY = 1100;
    hostGame.hostLootManager.spawnLoot('spear', lootX, lootY);

    await waitFor(() => playerGame.state.loot.length === 1, 5000);

    // 4. Player moves to loot but does NOT press F (should NOT pickup)
    playerNetwork.broadcastPlayerStateUpdate({
        position_x: lootX - 5,
        position_y: lootY - 5,
        velocity_x: 0,
        velocity_y: 0
    });

    playerGame.localPlayerController.player.x = lootX - 5;
    playerGame.localPlayerController.player.y = lootY - 5;

    // Wait for sync
    await waitFor(() => {
        const p = hostSnapshot.getPlayers().get(playerNetwork.playerId);
        return p && Math.abs(p.position_x - (lootX - 5)) < 1;
    }, 5000);

    playerGame.update(0.1);
    hostGame.update(0.1);
    
    // Should still have bo and loot should still be there
    expect(playerGame.getLocalPlayer().equipped_weapon).toBe('bo');
    expect(playerGame.state.loot).toHaveLength(1);

    // 5. Player presses F
    playerGame.handleInput({ interact: true });
    
    await waitFor(() => {
        playerGame.update(0.1);
        hostGame.update(0.1);
        return playerGame.getLocalPlayer().equipped_weapon === 'spear';
    }, 10000);

    // 6. Verify old weapon 'bo' was dropped
    await waitFor(() => {
        return playerGame.state.loot.some(item => item.item_id === 'bo');
    }, 5000);

    expect(playerGame.state.loot).toHaveLength(1);
    expect(playerGame.state.loot[0].item_id).toBe('bo');
  }, 40000);
});
