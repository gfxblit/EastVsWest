import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { waitFor, waitForSilence } from './helpers/wait-utils.js';

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
    // Note: allPlayers field removed in refactoring - use SessionPlayersSnapshot instead

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

  test('host should receive postgres_changes event when a player joins', async () => {
    // Host creates a session
    const hostName = 'HostPlayer';
    const { session: hostSession, player: hostPlayerRecord } = await network.hostGame(hostName);
    testSessionId = hostSession.id;
    const joinCode = hostSession.join_code;

    // Set up listener for postgres_changes on the host (new approach post-refactoring)
    const hostPostgresChangeEvents = [];
    const handler = (payload) => {
      hostPostgresChangeEvents.push(payload);
    };
    network.on('postgres_changes', handler);

    // Create a new player and join
    const playerClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: playerAuthData } = await playerClient.auth.signInAnonymously();
    const playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerAuthData.user.id);

    const playerName = 'TestPlayer';
    await playerNetwork.joinGame(joinCode, playerName);

    // Wait specifically for the new player's join event to propagate
    await waitFor(() => hostPostgresChangeEvents.some(e => 
      e.eventType === 'INSERT' && e.new?.player_name === playerName
    ), 10000);

    // Verify host received the postgres_changes INSERT event for the new player
    const joinEvent = hostPostgresChangeEvents.find(e =>
      e.eventType === 'INSERT' &&
      e.new?.player_name === playerName
    );

    // Clean up listener
    network.off('postgres_changes', handler);

    expect(joinEvent).toBeDefined();
    expect(joinEvent.eventType).toBe('INSERT');
    expect(joinEvent.table).toBe('session_players');
    expect(joinEvent.new.player_name).toBe(playerName);
    expect(joinEvent.new.session_id).toBe(testSessionId);

    // Clean up
    playerNetwork.disconnect();
    await playerClient.auth.signOut();
  });

  describe('Player State Updates (Direct Client Broadcasting)', () => {
    test('should send player state updates directly from client to all peers', async () => {
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

      // Set up listeners for player state updates
      const player2Updates = [];
      const p2Handler = (payload) => {
        player2Updates.push(payload);
      };
      player2Network.on('player_state_update', p2Handler);

      const hostUpdates = [];
      const hostHandler = (payload) => {
        hostUpdates.push(payload);
      };
      network.on('player_state_update', hostHandler);

      // Player 1 sends a state update (broadcasts to all peers)
      const stateData = {
        position_x: 100,
        position_y: 200,
        rotation: 1.57,
        velocity_x: 1.0,
        velocity_y: 0.5,
      };
      player1Network.broadcastPlayerStateUpdate(stateData);

      // Wait for updates to reach other clients
      await waitFor(() => player2Updates.length > 0 && hostUpdates.length > 0);

      // Verify player2 received player1's state update
      const player2ReceivedUpdate = player2Updates.find(u => u.from === player1Auth.user.id);
      expect(player2ReceivedUpdate).toBeDefined();
      expect(player2ReceivedUpdate.type).toBe('player_state_update');
      expect(player2ReceivedUpdate.data.position_x).toBe(100);
      expect(player2ReceivedUpdate.data.position_y).toBe(200);
      expect(player2ReceivedUpdate.data.rotation).toBe(1.57);

      // Verify host received player1's state update
      const hostReceivedUpdate = hostUpdates.find(u => u.from === player1Auth.user.id);
      expect(hostReceivedUpdate).toBeDefined();
      expect(hostReceivedUpdate.type).toBe('player_state_update');
      expect(hostReceivedUpdate.data.position_x).toBe(100);

      // Clean up
      player2Network.off('player_state_update', p2Handler);
      network.off('player_state_update', hostHandler);
      player1Network.disconnect();
      player2Network.disconnect();
      await player1Client.auth.signOut();
      await player2Client.auth.signOut();
    });

    test('should allow multiple clients to send state updates simultaneously', async () => {
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

      // Set up listener on host to receive updates from both players
      const receivedUpdates = [];
      const hostHandler = (payload) => {
        receivedUpdates.push(payload);
      };
      network.on('player_state_update', hostHandler);

      // Act: both players send updates simultaneously
      player1Network.broadcastPlayerStateUpdate({ position_x: 100, position_y: 200 });
      player2Network.broadcastPlayerStateUpdate({ position_x: 300, position_y: 400 });

      // Wait for both updates to reach host
      await waitFor(() => receivedUpdates.length >= 2);

      // Verify host received both state updates
      expect(receivedUpdates.length).toBeGreaterThanOrEqual(2);

      const player1Update = receivedUpdates.find(u => u.from === player1Auth.user.id);
      expect(player1Update).toBeDefined();
      expect(player1Update.data.position_x).toBe(100);
      expect(player1Update.data.position_y).toBe(200);

      const player2Update = receivedUpdates.find(u => u.from === player2Auth.user.id);
      expect(player2Update).toBeDefined();
      expect(player2Update.data.position_x).toBe(300);
      expect(player2Update.data.position_y).toBe(400);

      // Clean up
      network.off('player_state_update', hostHandler);
      player1Network.disconnect();
      player2Network.disconnect();
      await player1Client.auth.signOut();
      await player2Client.auth.signOut();
    });

    test('should emit state updates locally for sender', async () => {
      // Host creates a session
      const { session: hostSession } = await network.hostGame('HostPlayer');
      testSessionId = hostSession.id;

      // Set up listener on host for its own state updates
      const hostLocalUpdates = [];
      const hostHandler = (payload) => {
        hostLocalUpdates.push(payload);
      };
      network.on('player_state_update', hostHandler);

      // Host sends state update
      const stateData = {
        position_x: 10,
        position_y: 10,
        rotation: 0,
        velocity_x: 0,
        velocity_y: 0,
      };
      network.broadcastPlayerStateUpdate(stateData);

      // Wait for local emission
      await waitFor(() => hostLocalUpdates.length > 0);

      // Verify host received its own update locally
      expect(hostLocalUpdates.length).toBe(1);
      expect(hostLocalUpdates[0].from).toBe(hostUser.id);
      expect(hostLocalUpdates[0].type).toBe('player_state_update');
      expect(hostLocalUpdates[0].data.position_x).toBe(10);
      expect(hostLocalUpdates[0].data.position_y).toBe(10);

      // Clean up
      network.off('player_state_update', hostHandler);
    });
  });
});
