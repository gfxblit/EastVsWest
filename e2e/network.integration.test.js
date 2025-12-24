import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';

// Ensure your local Supabase URL and anon key are set as environment variables
// before running this test.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Network Module Integration with Supabase', () => {
  let supabaseClient;
  let network;
  let testSessionId; // To store the ID of the created session for cleanup
  let hostUser; // Store authenticated host user
  let playerUser; // Store authenticated player user

  // A check to ensure the test doesn't run without the necessary config
  if (!supabaseUrl || !supabaseAnonKey) {
    test.only('Supabase environment variables not set, skipping integration tests', () => {
      console.warn('Set SUPABASE_URL and SUPABASE_ANON_KEY to run integration tests.');
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    // Initialize a REAL Supabase client
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Sign in anonymously to get an authenticated session for the host
    const { data: authData, error: authError } = await supabaseClient.auth.signInAnonymously();
    if (authError) {
      throw new Error(`Failed to authenticate host: ${authError.message}`);
    }
    hostUser = authData.user;

    network = new Network();
    network.initialize(supabaseClient, hostUser.id);
  });

  afterAll(async () => {
    // Disconnect network and sign out after all tests
    if (network) {
      network.disconnect();
    }
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
  });

  afterEach(async () => {
    // Clean up the created test data after each test
    if (testSessionId) {
      await supabaseClient.from('game_sessions').delete().match({ id: testSessionId });
      testSessionId = null;
    }
  });

  test('hostGame() should create a new record in the game_sessions table', async () => {
    const hostName = 'HostPlayer';
    const { session: hostSession, player: hostPlayerRecord } = await network.hostGame(hostName);

    expect(hostSession.join_code).toBeDefined();
    expect(typeof hostSession.join_code).toBe('string');
    expect(hostSession.join_code.length).toBe(6);

    // Verify the record exists in the database
    const { data, error } = await supabaseClient
      .from('game_sessions')
      .select('*')
      .eq('join_code', hostSession.join_code)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.join_code).toBe(hostSession.join_code);
    expect(data.status).toBe('lobby');
    expect(data.realtime_channel_name).toBe(`game_session:${hostSession.join_code}`);

    // Verify the host player was added to session_players table
    const { data: playerDbData, error: playerDbError } = await supabaseClient
      .from('session_players')
      .select('*')
      .eq('session_id', hostSession.id)
      .eq('player_id', hostUser.id)
      .single();
    
    expect(playerDbError).toBeNull();
    expect(playerDbData).not.toBeNull();
    expect(playerDbData.player_name).toBe(hostName);
    expect(playerDbData.is_host).toBe(true);

    // Store the ID for cleanup
    testSessionId = data.id;
  });

  test('joinGame() should add a player to an existing session (host-authority flow)', async () => {
    // Host creates a session
    const hostName = 'HostPlayer';
    const { session: hostSession, player: hostPlayerRecord } = await network.hostGame(hostName);
    testSessionId = hostSession.id;
    const joinCode = hostSession.join_code;

    // Create a new Supabase client for the joining player and authenticate
    const playerClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerAuthData, error: playerAuthError } = await playerClient.auth.signInAnonymously();
    if (playerAuthError) {
      throw new Error(`Failed to authenticate player: ${playerAuthError.message}`);
    }
    playerUser = playerAuthData.user;

    // Initialize player's network instance
    const playerNetwork = new Network();
    const playerName = 'TestPlayer';
    playerNetwork.initialize(playerClient, playerUser.id);

    // Player attempts to join, which sends a player_join_request and waits for player_joined
    const joinedPayload = await playerNetwork.joinGame(joinCode, playerName);

    // Verify the data received by the joining player
    expect(joinedPayload).toBeDefined();
    expect(joinedPayload.session.join_code).toBe(joinCode);
    expect(joinedPayload.player.player_id).toBe(playerUser.id);
    expect(joinedPayload.player.player_name).toBe(playerName);
    expect(joinedPayload.allPlayers).toHaveLength(2); // Host and the new player

    // Verify network state of the joining player
    expect(playerNetwork.isHost).toBe(false);
    expect(playerNetwork.joinCode).toBe(joinCode);
    expect(playerNetwork.connected).toBe(true);

    // Verify the player was added to session_players table in the database
    // The host's _handlePlayerJoinRequest should have done this
    const { data: playerData, error: playerDbError } = await supabaseClient
      .from('session_players')
      .select('*')
      .eq('session_id', hostSession.id)
      .eq('player_id', playerUser.id)
      .single();

    expect(playerDbError).toBeNull();
    expect(playerData).not.toBeNull();
    expect(playerData.player_name).toBe(playerName);
    expect(playerData.is_host).toBe(false);
    expect(playerData.is_connected).toBe(true);

    // Clean up: disconnect and sign out the player
    playerNetwork.disconnect();
    await playerClient.auth.signOut();
  });

  test('joinGame() should fail when session does not exist', async () => {
    // Create a new authenticated player
    const playerClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerAuthData } = await playerClient.auth.signInAnonymously();

    const playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerAuthData.user.id);

    await expect(playerNetwork.joinGame('INVALID', 'TestPlayer'))
      .rejects.toThrow();

    // Clean up
    playerNetwork.disconnect();
    await playerClient.auth.signOut();
  });

  test('joinGame() should fail when session is not in lobby status', async () => {
    // Create a session using the existing authenticated host
    const { session: hostSession } = await network.hostGame('HostPlayer');

    // Update session status to 'active'
    testSessionId = hostSession.id;

    await supabaseClient
      .from('game_sessions')
      .update({ status: 'active' })
      .eq('id', hostSession.id);

    // Create a new authenticated player to try joining
    const playerClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerAuthData } = await playerClient.auth.signInAnonymously();

    const playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerAuthData.user.id);

    await expect(playerNetwork.joinGame(hostSession.join_code, 'TestPlayer'))
      .rejects.toThrow('Session is not joinable');

    // Clean up
    playerNetwork.disconnect();
    await playerClient.auth.signOut();
  });

  test('host should receive player_joined event locally when a player joins', async () => {
    // Host creates a session
    const hostName = 'HostPlayer';
    const { session: hostSession, player: hostPlayerRecord } = await network.hostGame(hostName);
    testSessionId = hostSession.id;
    const joinCode = hostSession.join_code;

    // Set up listener for player_joined on the host
    const hostPlayerJoinedEvents = [];
    network.on('player_joined', (payload) => {
      hostPlayerJoinedEvents.push(payload);
    });

    // Create a new player and join
    const playerClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerAuthData } = await playerClient.auth.signInAnonymously();
    const playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerAuthData.user.id);

    const playerName = 'TestPlayer';
    await playerNetwork.joinGame(joinCode, playerName);

    // Wait for event to propagate
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify host received the player_joined event
    expect(hostPlayerJoinedEvents.length).toBeGreaterThan(0);
    const joinEvent = hostPlayerJoinedEvents[0];
    expect(joinEvent.data.player.player_name).toBe(playerName);
    expect(joinEvent.data.allPlayers).toHaveLength(2); // Host + new player

    // Clean up
    playerNetwork.disconnect();
    await playerClient.auth.signOut();
  });

  describe('Position Updates (Client-Authoritative Movement)', () => {
    test('should send position updates from client to host and broadcast to all clients', async () => {
      // Host creates a session
      const hostName = 'HostPlayer';
      const { session: hostSession } = await network.hostGame(hostName);
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create two players
      const player1Client = createClient(supabaseUrl, supabaseAnonKey);
      const { data: player1Auth } = await player1Client.auth.signInAnonymously();
      const player1Network = new Network();
      player1Network.initialize(player1Client, player1Auth.user.id);

      const player2Client = createClient(supabaseUrl, supabaseAnonKey);
      const { data: player2Auth } = await player2Client.auth.signInAnonymously();
      const player2Network = new Network();
      player2Network.initialize(player2Client, player2Auth.user.id);

      // Players join the session
      await player1Network.joinGame(joinCode, 'Player1');
      await player2Network.joinGame(joinCode, 'Player2');

      // Set up a listener for position broadcasts on player2
      const player2Broadcasts = [];
      player2Network.on('position_broadcast', (payload) => {
        player2Broadcasts.push(payload);
      });

      // Host sends its own position update
      const hostPositionData = {
        position: { x: 50, y: 100 },
        rotation: 0.5,
        velocity: { x: 0.5, y: 0.5 },
      };
      network.sendPositionUpdate(hostPositionData);

      // Player 1 sends a position update
      const positionData = {
        position: { x: 100, y: 200 },
        rotation: 1.57,
        velocity: { x: 1.0, y: 0.5 },
      };
      player1Network.sendPositionUpdate(positionData);

      // Host collects the position updates and broadcasts
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for messages to arrive
      network.broadcastPositionUpdates();

      // Wait for broadcast to reach player2
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify player2 received the position broadcast
      expect(player2Broadcasts.length).toBeGreaterThan(0);
      const latestBroadcast = player2Broadcasts[player2Broadcasts.length - 1];
      expect(latestBroadcast.type).toBe('position_broadcast');
      expect(latestBroadcast.data.updates).toBeDefined();

      // Verify broadcast contains positions from BOTH host and player1
      expect(latestBroadcast.data.updates.length).toBe(2);

      // Find host's update in the broadcast
      const hostUpdate = latestBroadcast.data.updates.find(
        u => u.player_id === hostUser.id
      );
      expect(hostUpdate).toBeDefined();
      expect(hostUpdate.position).toEqual({ x: 50, y: 100 });
      expect(hostUpdate.rotation).toBe(0.5);

      // Find player1's update in the broadcast
      const player1Update = latestBroadcast.data.updates.find(
        u => u.player_id === player1Auth.user.id
      );
      expect(player1Update).toBeDefined();
      expect(player1Update.position).toEqual({ x: 100, y: 200 });
      expect(player1Update.rotation).toBe(1.57);

      // Clean up
      player1Network.disconnect();
      player2Network.disconnect();
      await player1Client.auth.signOut();
      await player2Client.auth.signOut();
    });

    test('should batch multiple position updates from different clients', async () => {
      // Host creates a session
      const { session: hostSession } = await network.hostGame('HostPlayer');
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create two players
      const player1Client = createClient(supabaseUrl, supabaseAnonKey);
      const { data: player1Auth } = await player1Client.auth.signInAnonymously();
      const player1Network = new Network();
      player1Network.initialize(player1Client, player1Auth.user.id);

      const player2Client = createClient(supabaseUrl, supabaseAnonKey);
      const { data: player2Auth } = await player2Client.auth.signInAnonymously();
      const player2Network = new Network();
      player2Network.initialize(player2Client, player2Auth.user.id);

      // Players join
      await player1Network.joinGame(joinCode, 'Player1');
      await player2Network.joinGame(joinCode, 'Player2');

      // Set up listener on player1 for broadcasts
      const receivedBroadcasts = [];
      player1Network.on('position_broadcast', (payload) => {
        receivedBroadcasts.push(payload);
      });

      // Both players send position updates
      player1Network.sendPositionUpdate({
        position: { x: 100, y: 200 },
        rotation: 0,
        velocity: { x: 1, y: 0 },
      });

      player2Network.sendPositionUpdate({
        position: { x: 300, y: 400 },
        rotation: 1.57,
        velocity: { x: 0, y: 1 },
      });

      // Wait for messages to arrive at host
      await new Promise(resolve => setTimeout(resolve, 100));

      // Host broadcasts batched updates
      network.broadcastPositionUpdates();

      // Wait for broadcast to reach clients
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify player1 received the batched broadcast
      expect(receivedBroadcasts.length).toBeGreaterThan(0);
      const latestBroadcast = receivedBroadcasts[receivedBroadcasts.length - 1];
      expect(latestBroadcast.type).toBe('position_broadcast');
      expect(latestBroadcast.data.updates).toHaveLength(2);

      // Verify both players' positions are in the batch
      const updates = latestBroadcast.data.updates;
      expect(updates.some(u => u.player_id === player1Auth.user.id)).toBe(true);
      expect(updates.some(u => u.player_id === player2Auth.user.id)).toBe(true);

      // Clean up
      player1Network.disconnect();
      player2Network.disconnect();
      await player1Client.auth.signOut();
      await player2Client.auth.signOut();
    });

    test('should clear position buffer after broadcasting', async () => {
      // Host creates a session
      const { session: hostSession } = await network.hostGame('HostPlayer');
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create a player
      const playerClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data: playerAuth } = await playerClient.auth.signInAnonymously();
      const playerNetwork = new Network();
      playerNetwork.initialize(playerClient, playerAuth.user.id);
      await playerNetwork.joinGame(joinCode, 'Player1');

      // Player sends position update
      playerNetwork.sendPositionUpdate({
        position: { x: 100, y: 200 },
        rotation: 0,
        velocity: { x: 1, y: 0 },
      });

      // Wait for message to arrive and broadcast
      await new Promise(resolve => setTimeout(resolve, 100));
      network.broadcastPositionUpdates();

      // Verify buffer was cleared
      expect(network.positionBuffer.size).toBe(0);

      // Clean up
      playerNetwork.disconnect();
      await playerClient.auth.signOut();
    });

    test('should periodically broadcast positions when broadcasting is started', async () => {
      // Host creates a session
      const { session: hostSession } = await network.hostGame('HostPlayer');
      testSessionId = hostSession.id;
      const joinCode = hostSession.join_code;

      // Create a player
      const playerClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data: playerAuth } = await playerClient.auth.signInAnonymously();
      const playerNetwork = new Network();
      playerNetwork.initialize(playerClient, playerAuth.user.id);
      await playerNetwork.joinGame(joinCode, 'Player1');

      // Listen for broadcasts on the client
      const receivedBroadcasts = [];
      playerNetwork.on('position_broadcast', (payload) => {
        receivedBroadcasts.push(payload);
      });

      // Host starts broadcasting
      network.startPositionBroadcasting();

      // Host sends its own position update
      network.sendPositionUpdate({
        position: { x: 10, y: 10 },
        rotation: 0,
        velocity: { x: 0, y: 0 },
      });

      // Wait for at least one broadcast interval
      await new Promise(resolve => setTimeout(resolve, 60)); // Interval is 50ms

      expect(receivedBroadcasts.length).toBe(1);
      expect(receivedBroadcasts[0].data.updates[0].player_id).toBe(hostUser.id);

      // Wait for another broadcast interval
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // another broadcast should not have been sent because buffer is empty
      expect(receivedBroadcasts.length).toBe(1);

      // Host stops broadcasting
      network.stopPositionBroadcasting();

      // Host sends another update
       network.sendPositionUpdate({
        position: { x: 20, y: 20 },
        rotation: 0,
        velocity: { x: 0, y: 0 },
      });

      // Wait and verify no new broadcast is received
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(receivedBroadcasts.length).toBe(1);

      // Clean up
      playerNetwork.disconnect();
      await playerClient.auth.signOut();
    }, 10000);
  });
});
