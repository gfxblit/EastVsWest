
import { createClient } from '@supabase/supabase-js';
import { Game } from '../src/game.js';
import { Network } from '../src/network.js';
import { CONFIG } from '../src/config.js';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot.js';
import { waitFor } from './helpers/wait-utils.js';

describe('Health Synchronization Integration', () => {
  let hostClient, playerClient;
  let hostNetwork, playerNetwork;
  let hostGame, playerGame;
  let hostSnapshot, playerSnapshot;
  let sessionData;

  // Setup Supabase clients and networks
  beforeAll(async () => {
    // Host setup
    hostClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: hostAuth } = await hostClient.auth.signInAnonymously();
    hostNetwork = new Network();
    hostNetwork.initialize(hostClient, hostAuth.user.id);

    // Player setup
    playerClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: playerAuth } = await playerClient.auth.signInAnonymously();
    playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerAuth.user.id);
  });

  // Cleanup after all tests
  afterAll(async () => {
    if (hostNetwork) hostNetwork.disconnect();
    if (playerNetwork) playerNetwork.disconnect();
    
    // Explicitly disconnect Supabase Realtime sockets to prevent open handles
    if (hostClient && hostClient.realtime) await hostClient.realtime.disconnect();
    if (playerClient && playerClient.realtime) await playerClient.realtime.disconnect();

    // Clean up session
    if (sessionData && hostClient) {
      await hostClient.from('game_sessions').delete().eq('id', sessionData.id);
    }
  });

  // Setup game session before each test
  beforeEach(async () => {
    // Create game session
    const hostResult = await hostNetwork.hostGame('HostPlayer');
    sessionData = hostResult.session;
    
    // Join game
    await playerNetwork.joinGame(sessionData.join_code, 'ClientPlayer');
    
    // Setup Snapshots
    hostSnapshot = new SessionPlayersSnapshot(hostNetwork, sessionData.id);
    playerSnapshot = new SessionPlayersSnapshot(playerNetwork, sessionData.id);
    
    // Initialize Games
    hostGame = new Game();
    hostGame.init(hostSnapshot, hostNetwork);
    
    playerGame = new Game();
    playerGame.init(playerSnapshot, playerNetwork);
    
    // Wait for connection
    await waitFor(() => hostNetwork.connected && playerNetwork.connected);
    
    // Wait for players to appear in snapshots
    await waitFor(() => {
      const hostPlayers = hostSnapshot.getPlayers();
      const clientPlayers = playerSnapshot.getPlayers();
      return hostPlayers.size >= 2 && clientPlayers.size >= 2;
    });
  }, 30000); // 30s timeout for setup

  // Cleanup after each test
  afterEach(() => {
    if (hostSnapshot) hostSnapshot.destroy();
    if (playerSnapshot) playerSnapshot.destroy();
  });

  test('WhenHostCalculatesZoneDamage_ShouldPersistHealthToDB', async () => {
    // 1. Move player outside zone on host
    // We need to simulate the player being outside the zone.
    // Since we can't easily control the "real" player position from here without
    // sending network updates, we'll manually update the snapshot data on the host
    // to simulate the player being outside the zone, then run the host update loop.
    
    const playerId = playerNetwork.playerId;
    const hostPlayerMap = hostSnapshot.getPlayers();
    const playerOnHost = hostPlayerMap.get(playerId);
    
    // Force player position outside zone (0,0 is definitely outside)
    playerOnHost.position_x = 0;
    playerOnHost.position_y = 0;
    
    // Shrink zone to ensure 0,0 is outside
    hostGame.state.conflictZone.radius = 100;
    hostGame.state.conflictZone.centerX = CONFIG.WORLD.WIDTH / 2;
    hostGame.state.conflictZone.centerY = CONFIG.WORLD.HEIGHT / 2;
    
    // 2. Run host update loop multiple times to accumulate damage
    // Damage is per second, so we need some time to pass
    const iterations = 10;
    const deltaTime = 1.0; // 1 second per tick
    
    // Mock the network broadcast to avoid noise but verify it's called
    // actually we want real network for integration test, but for this specific test
    // we want to verify DB persistence.
    
    // Trigger the host-authoritative update
    for (let i = 0; i < iterations; i++) {
        // We need to access the method we are going to implement
        // Since it's not implemented yet, this test will fail
        if (typeof hostGame.updateAllPlayersHealth === 'function') {
            hostGame.updateAllPlayersHealth(deltaTime);
        }
    }
    
    // 3. Trigger periodic DB write
    // This is usually triggered by interval, but we can call the internal method if accessible
    // or wait for the interval. For reliability, we might need to expose a way to force write
    // or rely on the network method.
    
    // Let's manually trigger the write using the same mechanism the game would use
    // The game should call network.writePlayerStateToDB via startPeriodicPlayerStateWrite
    // We can manually call writePlayerStateToDB to verify the data is correct
    
    // Get the updated health from the host's state
    const updatedHealth = playerOnHost.health;
    expect(updatedHealth).toBeLessThan(100);
    
    // Manually write to DB to verify persistence works (simulating the periodic job)
    await hostNetwork.writePlayerStateToDB(playerId, { health: updatedHealth });
    
    // 4. Verify DB has updated health
    const { data: dbPlayer } = await hostClient
      .from('session_players')
      .select('health')
      .eq('session_id', sessionData.id)
      .eq('player_id', playerId)
      .single();
      
    expect(dbPlayer.health).toBe(updatedHealth);
  });

  test('WhenHostBroadcastsHealth_ClientsShouldReceiveUpdate', async () => {
    // 1. Simulate damage on host
    const playerId = playerNetwork.playerId;
    const hostPlayerMap = hostSnapshot.getPlayers();
    const playerOnHost = hostPlayerMap.get(playerId);
    
    // Initial health
    const initialHealth = 100;
    playerOnHost.health = initialHealth;
    
    // Apply damage
    const damage = 10;
    playerOnHost.health -= damage;
    
    // Setup listener for broadcast on client
    const updatePromise = new Promise(resolve => {
      const handler = (msg) => {
        // Handle both single object and array of updates
        const data = msg.data;
        const updates = Array.isArray(data) ? data : [data];
        
        const update = updates.find(u => u.player_id === playerId);
        if (update && update.health === (initialHealth - damage)) {
          playerNetwork.off('player_state_update', handler);
          resolve(update);
        }
      };
      playerNetwork.on('player_state_update', handler);
    });

    // 2. Broadcast update (simulating what hostGame.updateAllPlayersHealth would do)
    hostNetwork.broadcastPlayerStateUpdate({
        player_id: playerId,
        health: playerOnHost.health
    });
    
    // 3. Wait for client to receive update via broadcast
    const receivedUpdate = await updatePromise;
    expect(receivedUpdate.health).toBe(initialHealth - damage);
    
    // 4. Verify snapshot is also updated (via its own listener)
    await waitFor(() => {
        const clientPlayerMap = playerSnapshot.getPlayers();
        const playerOnClient = clientPlayerMap.get(playerId);
        return playerOnClient && playerOnClient.health === (initialHealth - damage);
    }, 5000);
    
    const clientPlayerMap = playerSnapshot.getPlayers();
    const playerOnClient = clientPlayerMap.get(playerId);
    expect(playerOnClient.health).toBe(90);
  });

  test('WhenClientBroadcastsHealth_ShouldBeIgnoredByOtherClients', async () => {
    // 1. Setup initial state
    const playerId = playerNetwork.playerId;
    const hostPlayerMap = hostSnapshot.getPlayers();
    const playerOnHost = hostPlayerMap.get(playerId);
    
    // Set health to 50 on host (authoritative)
    playerOnHost.health = 50;
    
    // 2. Client tries to cheat by broadcasting full health
    // Use player_state_update which allows health field
    playerNetwork.broadcastPlayerStateUpdate({
        player_id: playerId,
        health: 100
    });
    
    // 3. Wait a bit to ensure message would have arrived
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 4. Verify host snapshot ignored the update
    // Host snapshot should only accept health updates from host (self) or logic, 
    // but here we are checking if it accepts network updates from client.
    // Since we manually set it to 50, if it accepted the broadcast it would become 100.
    const playerOnHostAfter = hostSnapshot.getPlayers().get(playerId);
    expect(playerOnHostAfter.health).toBe(50);
  });
});
