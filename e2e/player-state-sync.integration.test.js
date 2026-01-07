import { createMockSupabase, resetMockBackend } from './helpers/mock-supabase.js';
import { Network } from '../src/network';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot';
import { waitFor } from './helpers/wait-utils.js';

describe('Player State Sync Integration with Supabase (Mocked)', () => {
  let hostClient;
  let hostNetwork;
  let hostUser;
  let testSessionId;

  beforeAll(async () => {
    resetMockBackend();
    // Initialize host client
    hostClient = createMockSupabase();

    // Sign in anonymously to get an authenticated session for the host
    const { data: authData, error: authError } = await hostClient.auth.signInAnonymously();
    if (authError) {
      throw new Error(`Failed to authenticate host: ${authError.message}`);
    }
    hostUser = authData.user;

    hostNetwork = new Network();
    hostNetwork.initialize(hostClient, hostUser.id);
  });

  afterAll(async () => {
    // Disconnect network and sign out
    if (hostNetwork) {
      hostNetwork.disconnect();
    }
    if (hostClient) {
      await hostClient.auth.signOut();
    }
  });

  afterEach(async () => {
    // Clean up the created test data after each test
    if (testSessionId) {
      // First disconnect host network to clean up channels
      if (hostNetwork && hostNetwork.channel) {
        hostNetwork.disconnect();
      }

      await hostClient.from('game_sessions').delete().match({ id: testSessionId });
      testSessionId = null;

      // Recreate host network for next test
      hostNetwork = new Network();
      hostNetwork.initialize(hostClient, hostUser.id);
    }
  });

  describe('Generic Broadcast and Persistence', () => {
    test('WhenClientBroadcastsPosition_AllClientsShouldReceive', async () => {
      // Host creates a session
      const { session: hostSession } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create player 1
      const player1Client = createMockSupabase();
      const { data: player1Auth } = await player1Client.auth.signInAnonymously();
      const player1Network = new Network();
      player1Network.initialize(player1Client, player1Auth.user.id);
      await player1Network.joinGame(joinCode, 'Player1');

      // Create player 2
      const player2Client = createMockSupabase();
      const { data: player2Auth } = await player2Client.auth.signInAnonymously();
      const player2Network = new Network();
      player2Network.initialize(player2Client, player2Auth.user.id);
      await player2Network.joinGame(joinCode, 'Player2');

      // Set up listener on player 2 for player_state_update
      const player2Updates = [];
      const p2Handler = (payload) => {
        player2Updates.push(payload);
      };
      player2Network.on('player_state_update', p2Handler);

      // Player 1 broadcasts position using generic method
      const stateUpdate = {
        player_id: player1Auth.user.id,
        position_x: 100,
        position_y: 200,
        rotation: 1.57,
        velocity_x: 1.0,
        velocity_y: 0.5,
      };
      player1Network.broadcastPlayerStateUpdate(stateUpdate);

      // Wait for update to reach player 2
      await waitFor(() => player2Updates.length > 0, 5000);

      // Verify player 2 received the update
      const receivedUpdate = player2Updates.find(u => u.from === player1Auth.user.id);
      expect(receivedUpdate).toBeDefined();
      expect(receivedUpdate.type).toBe('player_state_update');
      expect(receivedUpdate.data.position_x).toBe(100);
      expect(receivedUpdate.data.position_y).toBe(200);
      expect(receivedUpdate.data.rotation).toBe(1.57);

      // Clean up
      player2Network.off('player_state_update', p2Handler);
      player1Network.disconnect();
      player2Network.disconnect();
      await player1Client.auth.signOut();
      await player2Client.auth.signOut();
    });

    test('WhenHostBroadcastsHealth_AllClientsShouldReceive', async () => {
      // Host creates a session
      const { session: hostSession } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create player client
      const playerClient = createMockSupabase();
      const { data: playerAuth } = await playerClient.auth.signInAnonymously();
      const playerNetwork = new Network();
      playerNetwork.initialize(playerClient, playerAuth.user.id);
      await playerNetwork.joinGame(joinCode, 'Player1');

      // Set up listener on player for player_state_update
      const playerUpdates = [];
      const playerHandler = (payload) => {
        playerUpdates.push(payload);
      };
      playerNetwork.on('player_state_update', playerHandler);

      // Host broadcasts health update using generic method
      const stateUpdate = {
        player_id: playerAuth.user.id,
        health: 75,
      };
      hostNetwork.broadcastPlayerStateUpdate(stateUpdate);

      // Wait for update to reach player
      await waitFor(() => playerUpdates.length > 0, 5000);

      // Verify player received the update
      const receivedUpdate = playerUpdates.find(u => u.from === hostUser.id);
      expect(receivedUpdate).toBeDefined();
      expect(receivedUpdate.type).toBe('player_state_update');
      expect(receivedUpdate.data.health).toBe(75);

      // Clean up
      playerNetwork.off('player_state_update', playerHandler);
      playerNetwork.disconnect();
      await playerClient.auth.signOut();
    });

    test('WhenClientPersistsPosition_ShouldWriteToDB', async () => {
      // Host creates a session
      const { session: hostSession } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create player client
      const playerClient = createMockSupabase();
      const { data: playerAuth } = await playerClient.auth.signInAnonymously();
      const playerNetwork = new Network();
      playerNetwork.initialize(playerClient, playerAuth.user.id);
      await playerNetwork.joinGame(joinCode, 'Player1');

      // Player writes position to DB using generic method
      const stateData = {
        position_x: 150,
        position_y: 250,
        rotation: 3.14,
        velocity_x: 2.0,
        velocity_y: 1.5,
      };

      await playerNetwork.writePlayerStateToDB(playerAuth.user.id, stateData);

      // Verify data was written to DB
      const { data: playerData, error } = await playerClient
        .from('session_players')
        .select('*')
        .eq('session_id', testSessionId)
        .eq('player_id', playerAuth.user.id)
        .single();

      expect(error).toBeNull();
      expect(playerData.position_x).toBe(150);
      expect(playerData.position_y).toBe(250);
      expect(playerData.rotation).toBe(3.14);
      expect(playerData.velocity_x).toBe(2.0);
      expect(playerData.velocity_y).toBe(1.5);

      // Clean up
      playerNetwork.disconnect();
      await playerClient.auth.signOut();
    });

    test('WhenHostPersistsHealth_ShouldWriteToDB', async () => {
      // Host creates a session
      const { session: hostSession } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create player client
      const playerClient = createMockSupabase();
      const { data: playerAuth } = await playerClient.auth.signInAnonymously();
      const playerNetwork = new Network();
      playerNetwork.initialize(playerClient, playerAuth.user.id);
      await playerNetwork.joinGame(joinCode, 'Player1');

      // Host writes health to DB using generic method
      const stateData = {
        health: 85,
      };

      await hostNetwork.writePlayerStateToDB(playerAuth.user.id, stateData);

      // Verify data was written to DB
      const { data: playerData, error } = await hostClient
        .from('session_players')
        .select('*')
        .eq('session_id', testSessionId)
        .eq('player_id', playerAuth.user.id)
        .single();

      expect(error).toBeNull();
      expect(playerData.health).toBe(85);

      // Clean up
      playerNetwork.disconnect();
      await playerClient.auth.signOut();
    });

    test('WhenClientReconnects_ShouldLoadPositionAndHealthFromDB', async () => {
      // Host creates a session
      const { session: hostSession } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create player client and join
      const playerClient = createMockSupabase();
      const { data: playerAuth } = await playerClient.auth.signInAnonymously();
      const playerNetwork = new Network();
      playerNetwork.initialize(playerClient, playerAuth.user.id);
      await playerNetwork.joinGame(joinCode, 'Player1');

      // Write both position and health to DB
      await playerNetwork.writePlayerStateToDB(playerAuth.user.id, {
        position_x: 300,
        position_y: 400,
        rotation: 1.0,
        velocity_x: 0,
        velocity_y: 0,
      });

      await hostNetwork.writePlayerStateToDB(playerAuth.user.id, {
        health: 65,
      });

      // Disconnect player
      playerNetwork.disconnect();

      // Create SessionPlayersSnapshot to simulate reconnection
      const snapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);
      await snapshot.ready();

      // Verify snapshot loaded both position and health from DB
      const player = snapshot.getPlayers().get(playerAuth.user.id);
      expect(player.position_x).toBe(300);
      expect(player.position_y).toBe(400);
      expect(player.health).toBe(65);

      // Clean up
      snapshot.destroy();
      await playerClient.auth.signOut();
    });

    test('WhenHostBroadcastsMultiplePlayerHealth_AllShouldSync', async () => {
      // Host creates a session
      const { session: hostSession } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create three players
      const player1Client = createMockSupabase();
      const { data: player1Auth } = await player1Client.auth.signInAnonymously();
      const player1Network = new Network();
      player1Network.initialize(player1Client, player1Auth.user.id);
      await player1Network.joinGame(joinCode, 'Player1');

      const player2Client = createMockSupabase();
      const { data: player2Auth } = await player2Client.auth.signInAnonymously();
      const player2Network = new Network();
      player2Network.initialize(player2Client, player2Auth.user.id);
      await player2Network.joinGame(joinCode, 'Player2');

      const player3Client = createMockSupabase();
      const { data: player3Auth } = await player3Client.auth.signInAnonymously();
      const player3Network = new Network();
      player3Network.initialize(player3Client, player3Auth.user.id);
      await player3Network.joinGame(joinCode, 'Player3');

      // Create SessionPlayersSnapshot for player 1
      const player1Snapshot = new SessionPlayersSnapshot(player1Network, testSessionId);
      await player1Snapshot.ready();

      // Wait for snapshot to fully subscribe to realtime events
      await new Promise(resolve => setTimeout(resolve, 500));

      // Host broadcasts batched health updates
      const batchUpdates = [
        { player_id: player1Auth.user.id, health: 70 },
        { player_id: player2Auth.user.id, health: 85 },
        { player_id: player3Auth.user.id, health: 95 },
      ];

      hostNetwork.broadcastPlayerStateUpdate(batchUpdates);

      // Wait for updates to reach player 1's snapshot
      await waitFor(() => {
        const p1 = player1Snapshot.getPlayers().get(player1Auth.user.id);
        const p2 = player1Snapshot.getPlayers().get(player2Auth.user.id);
        const p3 = player1Snapshot.getPlayers().get(player3Auth.user.id);
        return p1?.health === 70 && p2?.health === 85 && p3?.health === 95;
      }, 5000);

      // Verify all players' health was updated
      const p1 = player1Snapshot.getPlayers().get(player1Auth.user.id);
      expect(p1.health).toBe(70);

      const p2 = player1Snapshot.getPlayers().get(player2Auth.user.id);
      expect(p2.health).toBe(85);

      const p3 = player1Snapshot.getPlayers().get(player3Auth.user.id);
      expect(p3.health).toBe(95);

      // Clean up
      player1Snapshot.destroy();
      player1Network.disconnect();
      player2Network.disconnect();
      player3Network.disconnect();
      await player1Client.auth.signOut();
      await player2Client.auth.signOut();
      await player3Client.auth.signOut();
    });
  });
});
