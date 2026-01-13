import { createClient } from '@supabase/supabase-js';
import { jest } from '@jest/globals';
import { Network } from '../src/network';
import { Game } from '../src/game';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { waitFor } from './helpers/wait-utils.js';
import { CONFIG } from '../src/config.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Combat Integration', () => {
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

  // Save original config to restore later
  const originalSpearSpeed = CONFIG.WEAPONS.SPEAR.attackSpeed;
  const originalSpecialCooldown = CONFIG.COMBAT.SPECIAL_ABILITY_COOLDOWN_MS;
  const originalNetworkInterval = CONFIG.NETWORK.GAME_SIMULATION_INTERVAL_MS;

  if (!supabaseUrl || !supabaseAnonKey) {
    test('Supabase environment variables not set, skipping integration tests', () => {
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    // Speed up cooldowns and network for tests
    CONFIG.WEAPONS.SPEAR.attackSpeed = 10; // 100ms cooldown
    CONFIG.COMBAT.SPECIAL_ABILITY_COOLDOWN_MS = 100;
    CONFIG.NETWORK.GAME_SIMULATION_INTERVAL_MS = 10;

    hostSupabase = createClient(supabaseUrl, supabaseAnonKey);
    playerSupabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: hostAuth } = await hostSupabase.auth.signInAnonymously();
    const { data: playerAuth } = await playerSupabase.auth.signInAnonymously();
    
    hostUserId = hostAuth.user.id;
    playerUserId = playerAuth.user.id;

    // Setup network and game once
    hostNetwork = new Network();
    hostNetwork.initialize(hostSupabase, hostUserId);

    playerNetwork = new Network();
    playerNetwork.initialize(playerSupabase, playerUserId);

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
  }, 20000);

  beforeEach(async () => {
    // Reset host combat manager cooldowns
    if (hostGame.hostCombatManager) {
        hostGame.hostCombatManager.playerCooldowns.clear();
    }
    // Reset local player controller cooldowns
    if (hostGame.localPlayerController && hostGame.localPlayerController.player) {
        hostGame.localPlayerController.player.lastAttackTime = 0;
        hostGame.localPlayerController.player.lastSpecialTime = 0;
        
        // Force local state to match desired test state
        hostGame.localPlayerController.player.x = 1200;
        hostGame.localPlayerController.player.y = 800;
        hostGame.localPlayerController.player.health = 100;
        hostGame.localPlayerController.player.velocity = { x: 0, y: 0 };
    }
    if (playerGame.localPlayerController && playerGame.localPlayerController.player) {
        playerGame.localPlayerController.player.x = 1340;
        playerGame.localPlayerController.player.y = 800;
        playerGame.localPlayerController.player.health = 100;
        playerGame.localPlayerController.player.velocity = { x: 0, y: 0 };
    }

    // Reset player states in DB
    await Promise.all([
        hostSupabase.from('session_players')
            .update({ equipped_weapon: 'spear', position_x: 1200, position_y: 800, health: 100, velocity_x: 0, velocity_y: 0 })
            .eq('player_id', hostUserId),
        playerSupabase.from('session_players')
            .update({ position_x: 1340, position_y: 800, health: 100, velocity_x: 0, velocity_y: 0 })
            .eq('player_id', playerUserId)
    ]);

    // Small sleep to let Realtime catch up
    await new Promise(resolve => setTimeout(resolve, 100));

    // Wait for state to sync in snapshots
    await waitFor(() => {
        hostGame.update(0.016);
        playerGame.update(0.016);
        const h = hostSnapshot.getPlayers().get(hostUserId);
        const p = hostSnapshot.getPlayers().get(playerUserId);
        
        if (!h || !p) return false;
        
        const healthSynced = h.health === 100 && p.health === 100;
        const posSynced = Math.abs(h.position_x - 1200) < 5 && Math.abs(p.position_x - 1340) < 5;
        
        return healthSynced && posSynced;
    }, 10000);

    // Ensure local controller is aware of weapon
    await waitFor(() => {
        hostGame.update(0.016);
        const localWeapon = hostGame.getLocalPlayer().equipped_weapon;
        return localWeapon === 'spear';
    }, 10000);
  });

  afterAll(async () => {
    // Restore original config
    CONFIG.WEAPONS.SPEAR.attackSpeed = originalSpearSpeed;
    CONFIG.COMBAT.SPECIAL_ABILITY_COOLDOWN_MS = originalSpecialCooldown;
    CONFIG.NETWORK.GAME_SIMULATION_INTERVAL_MS = originalNetworkInterval;

    if (hostNetwork) hostNetwork.disconnect();
    if (playerNetwork) playerNetwork.disconnect();
    if (hostSnapshot) hostSnapshot.destroy();
    if (playerSnapshot) playerSnapshot.destroy();
    if (testSessionId) {
      await hostSupabase.from('game_sessions').delete().match({ id: testSessionId });
    }
    if (hostSupabase) await hostSupabase.auth.signOut();
    if (playerSupabase) await playerSupabase.auth.signOut();
  });

  test('should process attack request and sync health', async () => {
    // Face East
    hostGame.localPlayerController.player.rotation = Math.PI / 2;

    // Attack
    hostGame.handleInput({ attack: true });
    hostGame.update(0.016);
    hostGame.handleInput({ attack: false });

    // 4. Verify player health reduction
    // Spear damage is 25.
    await waitFor(() => {
      hostGame.update(0.05);
      playerGame.update(0.05);
      const p = playerSnapshot.getPlayers().get(playerUserId);
      return p && p.health === 75;
    }, 5000);

    const victimAtHost = hostSnapshot.getPlayers().get(playerUserId);
    expect(victimAtHost.health).toBe(75);
  }, 10000);

  test('should process special attack request and sync health', async () => {
    // Face East
    hostGame.localPlayerController.player.rotation = Math.PI / 2;

    // Special Attack
    hostGame.handleInput({ specialAbility: true });
    hostGame.update(0.016);
    hostGame.handleInput({ specialAbility: false });

    // 4. Verify player health reduction
    // Spear special damage = 25 * 1.5 = 37.5
    await waitFor(() => {
      hostGame.update(0.05);
      playerGame.update(0.05);
      const p = playerSnapshot.getPlayers().get(playerUserId);
      return p && p.health === 62.5;
    }, 5000);

    const victimAtHost = hostSnapshot.getPlayers().get(playerUserId);
    expect(victimAtHost.health).toBe(62.5);
  }, 10000);

  test('should auto-attack when holding the attack button', async () => {
    // Face East
    hostGame.localPlayerController.player.rotation = Math.PI / 2;

    // 4. Hold attack button and update over time
    // Spear cooldown is now 100ms.
    hostGame.handleInput({ attack: true });
    
    // Manual loop with updates for both games
    const startTime = Date.now();
    let victimAtHost = null;
    while (Date.now() - startTime < 5000) {
        hostGame.update(0.1);
        playerGame.update(0.1);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        victimAtHost = hostSnapshot.getPlayers().get(playerUserId);
        if (victimAtHost && victimAtHost.health <= 50) break;
    }
    hostGame.handleInput({ attack: false });

    expect(victimAtHost.health).toBeLessThanOrEqual(50);
  }, 15000);

  test('should auto-special when holding the special button', async () => {
    // Face East
    hostGame.localPlayerController.player.rotation = Math.PI / 2;

    // 4. Hold special button and update over time
    // Special cooldown is now 100ms. 
    hostGame.handleInput({ specialAbility: true });
    
    const startTime = Date.now();
    let victimAtHost = null;
    while (Date.now() - startTime < 5000) {
        hostGame.update(0.1);
        playerGame.update(0.1);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        victimAtHost = hostSnapshot.getPlayers().get(playerUserId);
        if (victimAtHost && victimAtHost.health <= 25) break;
    }
    hostGame.handleInput({ specialAbility: false });

    expect(victimAtHost.health).toBeLessThanOrEqual(25);
  }, 15000);
});
