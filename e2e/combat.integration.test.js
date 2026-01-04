import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { Game } from '../src/game';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { waitFor } from './helpers/wait-utils.js';

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
    // Small delay to allow Supabase Realtime to breathe between tests
    await new Promise(resolve => setTimeout(resolve, 500));

    hostNetwork = new Network();
    hostNetwork.initialize(hostSupabase, hostUserId);

    playerNetwork = new Network();
    playerNetwork.initialize(playerSupabase, playerUserId);
  });

  afterAll(async () => {
    if (hostSupabase) await hostSupabase.auth.signOut();
    if (playerSupabase) await playerSupabase.auth.signOut();
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

  test('should process attack request and sync health', async () => {
    // 1. Host creates game
    const { session: hostSession } = await hostNetwork.hostGame('Host');
    testSessionId = hostSession.id;

    // Set host weapon to spear for the test
    await hostSupabase.from('session_players')
      .update({ equipped_weapon: 'spear', position_x: 1200, position_y: 800 })
      .eq('player_id', hostNetwork.playerId);

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

    // Set player position near host
    await playerSupabase.from('session_players')
      .update({ position_x: 1250, position_y: 800, health: 100 })
      .eq('player_id', playerNetwork.playerId);

    // Wait for player to appear in host snapshot AND have correct position
    await waitFor(() => {
      const p = hostSnapshot.getPlayers().get(playerNetwork.playerId);
      return p && Math.abs(p.position_x - 1250) < 1 && Math.abs(p.position_y - 800) < 1;
    }, 10000);

    // Wait for host weapon AND position to sync locally
    await waitFor(() => {
      hostGame.update(0.016); // Trigger sync
      // Also ensure host position in snapshot is correct (used by HostCombatManager)
      const hostInSnapshot = hostSnapshot.getPlayers().get(hostNetwork.playerId);
      const positionSynced = hostInSnapshot && Math.abs(hostInSnapshot.position_x - 1200) < 1;
      
      return hostGame.getLocalPlayer().weapon === 'spear' && positionSynced;
    }, 10000);

    // 3. Move Host East to set rotation
    hostGame.handleInput({
      moveX: 1,
      moveY: 0,
      attack: false,
      specialAbility: false
    });
    hostGame.update(0.05); // Move slightly

    // Stop moving
    hostGame.handleInput({
      moveX: 0,
      moveY: 0,
      attack: false,
      specialAbility: false
    });
    hostGame.update(0.05);

    // Attack (now facing East)
    hostGame.handleInput({
      attack: true,
      specialAbility: false,
      moveX: 0,
      moveY: 0
    });

    // 4. Verify player health reduction
    // Spear damage is 25.
    await waitFor(() => {
      hostGame.update(0.05);
      playerGame.update(0.05);
      const p = playerSnapshot.getPlayers().get(playerNetwork.playerId);
      return p && p.health < 100;
    }, 10000);

    hostGame.update(0.016);
    playerGame.update(0.016);

    const victimAtHost = hostSnapshot.getPlayers().get(playerNetwork.playerId);
    const victimAtPlayer = playerSnapshot.getPlayers().get(playerNetwork.playerId);

    expect(victimAtHost.health).toBe(75);
    expect(victimAtPlayer.health).toBe(75);
    expect(playerGame.getLocalPlayer().health).toBe(75);
  }, 30000);

  test('should process special attack request and sync health', async () => {
    // 1. Host creates game
    const { session: hostSession } = await hostNetwork.hostGame('Host');
    testSessionId = hostSession.id;

    // Set host weapon to spear for the test
    await hostSupabase.from('session_players')
      .update({ equipped_weapon: 'spear', position_x: 1200, position_y: 800 })
      .eq('player_id', hostNetwork.playerId);

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

    // Set player position near host
    await playerSupabase.from('session_players')
      .update({ position_x: 1250, position_y: 800, health: 100 })
      .eq('player_id', playerNetwork.playerId);

    // Wait for player to appear in host snapshot AND have correct position
    await waitFor(() => {
      const p = hostSnapshot.getPlayers().get(playerNetwork.playerId);
      return p && Math.abs(p.position_x - 1250) < 1 && Math.abs(p.position_y - 800) < 1;
    }, 10000);

    // Wait for host weapon AND position to sync locally
    await waitFor(() => {
      hostGame.update(0.016);
      const hostInSnapshot = hostSnapshot.getPlayers().get(hostNetwork.playerId);
      const positionSynced = hostInSnapshot && Math.abs(hostInSnapshot.position_x - 1200) < 1;
      
      return hostGame.getLocalPlayer().weapon === 'spear' && positionSynced;
    }, 10000);

    // 3. Move Host East to set rotation
    hostGame.handleInput({
      moveX: 1,
      moveY: 0,
      attack: false,
      specialAbility: false
    });
    hostGame.update(0.05); // Move slightly

    // Stop moving
    hostGame.handleInput({
      moveX: 0,
      moveY: 0,
      attack: false,
      specialAbility: false
    });
    hostGame.update(0.05);

    // Special Attack (now facing East)
    hostGame.handleInput({
      attack: false,
      specialAbility: true,
      moveX: 0,
      moveY: 0
    });

    // 4. Verify player health reduction
    // Spear special damage = 25 * 1.5 = 37.5
    await waitFor(() => {
      hostGame.update(0.05);
      playerGame.update(0.05);
      const p = playerSnapshot.getPlayers().get(playerNetwork.playerId);
      return p && p.health < 100;
    }, 10000);

    hostGame.update(0.05);
    playerGame.update(0.05);

    const victimAtHost = hostSnapshot.getPlayers().get(playerNetwork.playerId);
    const victimAtPlayer = playerSnapshot.getPlayers().get(playerNetwork.playerId);

    expect(victimAtHost.health).toBe(62.5); // 100 - 37.5
    expect(victimAtPlayer.health).toBe(62.5);
    expect(playerGame.getLocalPlayer().health).toBe(62.5);
  }, 30000);
});