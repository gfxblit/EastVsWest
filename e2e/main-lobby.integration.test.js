import { createMockSupabase, resetMockBackend } from './helpers/mock-supabase.js';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot.js';
import { Network } from '../src/network.js';
import { waitFor, waitForSilence } from './helpers/wait-utils.js';

describe('Main.js Lobby Integration (Mocked)', () => {
  let hostClient;
  let playerClient;
  let hostNetwork;
  let playerNetwork;
  let hostSnapshot;
  let playerSnapshot;
  let testSessionId;
  let testJoinCode;
  let hostUser;
  let playerUser;
  let hostLobbyInterval;
  let playerLobbyInterval;

  beforeAll(async () => {
    resetMockBackend();
    // Create two separate clients (host and player)
    hostClient = createMockSupabase();
    playerClient = createMockSupabase();

    // Authenticate both clients
    const { data: hostAuth, error: hostAuthError } = await hostClient.auth.signInAnonymously();
    if (hostAuthError) {
      throw new Error(`Failed to authenticate host: ${hostAuthError.message}`);
    }
    hostUser = hostAuth.user;

    const { data: playerAuth, error: playerAuthError } = await playerClient.auth.signInAnonymously();
    if (playerAuthError) {
      throw new Error(`Failed to authenticate player: ${playerAuthError.message}`);
    }
    playerUser = playerAuth.user;

    // Create Network instances
    hostNetwork = new Network();
    hostNetwork.initialize(hostClient, hostUser.id);

    playerNetwork = new Network();
    playerNetwork.initialize(playerClient, playerUser.id);
  });

  afterAll(async () => {
    // Disconnect networks
    if (hostNetwork) {
      hostNetwork.disconnect();
    }
    if (playerNetwork) {
      playerNetwork.disconnect();
    }

    // Sign out both clients
    if (hostClient) {
      await hostClient.auth.signOut();
    }
    if (playerClient) {
      await playerClient.auth.signOut();
    }
  });

  afterEach(async () => {
    // Clear lobby polling intervals
    if (hostLobbyInterval) {
      clearInterval(hostLobbyInterval);
      hostLobbyInterval = null;
    }
    if (playerLobbyInterval) {
      clearInterval(playerLobbyInterval);
      playerLobbyInterval = null;
    }

    // Destroy snapshots first (clears intervals and unsubscribes from Network events)
    if (hostSnapshot) {
      hostSnapshot.destroy();
      hostSnapshot = null;
    }
    if (playerSnapshot) {
      playerSnapshot.destroy();
      playerSnapshot = null;
    }

    // Disconnect networks (removes channels)
    if (hostNetwork) {
      hostNetwork.disconnect();
    }
    if (playerNetwork) {
      playerNetwork.disconnect();
    }

    // Clean up test data in database
    if (testSessionId) {
      // Delete session_players first (foreign key constraint)
      await hostClient
        .from('session_players')
        .delete()
        .eq('session_id', testSessionId);

      // Delete game_sessions
      await hostClient
        .from('game_sessions')
        .delete()
        .eq('id', testSessionId);

      testSessionId = null;
      testJoinCode = null;
    }
  });

  describe('WhenHostCreatesGame_ShouldCreateSnapshotAndStartPolling', () => {
    test('should create SessionPlayersSnapshot and receive updates via polling', async () => {
      // Arrange - simulate main.js hostGame()
      const playerName = 'HostPlayer';

      // Act - Host creates game (like main.js line 231-249)
      const { session, player } = await hostNetwork.hostGame(playerName);
      testSessionId = session.id;
      testJoinCode = session.join_code;

      // Create SessionPlayersSnapshot (like main.js line 241)
      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);
      await hostSnapshot.ready();

      // Simulate lobby polling (like main.js line 319-321)
      const hostPlayersList = [];
      hostLobbyInterval = setInterval(() => {
        const players = Array.from(hostSnapshot.getPlayers().values());
        hostPlayersList.push(players);
      }, 100);

      // Wait for first poll
      await waitFor(() => hostPlayersList.length > 0);

      // Assert
      expect(hostPlayersList.length).toBeGreaterThan(0);
      const firstPoll = hostPlayersList[0];
      expect(firstPoll).toHaveLength(1);
      expect(firstPoll[0]).toMatchObject({
        player_id: hostUser.id,
        player_name: playerName,
        session_id: testSessionId,
      });
    });
  });

  describe('WhenPlayerJoins_ShouldUpdateHostSnapshot', () => {
    test('should reflect new player in host snapshot via real postgres_changes', async () => {
      // Arrange - Host creates game
      const { session } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = session.id;
      testJoinCode = session.join_code;

      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);
      await hostSnapshot.ready();

      const hostPlayersList = [];
      hostLobbyInterval = setInterval(() => {
        const players = Array.from(hostSnapshot.getPlayers().values());
        hostPlayersList.push([...players]); // Clone array
      }, 100);

      // Wait for initial poll
      await waitFor(() => hostPlayersList.length > 0);

      // Act - Player joins game (like main.js line 270-288)
      await playerNetwork.joinGame(testJoinCode, 'Player1');

      // Wait for postgres_changes event to propagate and polling to capture it
      await waitFor(() => {
        const latestPoll = hostPlayersList[hostPlayersList.length - 1];
        return latestPoll && latestPoll.length === 2;
      });

      // Assert
      const latestPoll = hostPlayersList[hostPlayersList.length - 1];
      expect(latestPoll.length).toBe(2);
      expect(latestPoll).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ player_name: 'HostPlayer' }),
          expect.objectContaining({ player_name: 'Player1' }),
        ])
      );
    });
  });

  describe('WhenPlayerJoins_ShouldCreateOwnSnapshot', () => {
    test('should create SessionPlayersSnapshot for joining player and start polling', async () => {
      // Arrange - Host creates game
      const { session } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = session.id;
      testJoinCode = session.join_code;

      // Act - Player joins and creates snapshot (like main.js line 270-288)
      const { session: joinedSession } = await playerNetwork.joinGame(testJoinCode, 'Player1');
      expect(joinedSession.id).toBe(testSessionId);

      playerSnapshot = new SessionPlayersSnapshot(playerNetwork, testSessionId);
      await playerSnapshot.ready();

      // Simulate lobby polling for player
      const playerPlayersList = [];
      playerLobbyInterval = setInterval(() => {
        const players = Array.from(playerSnapshot.getPlayers().values());
        playerPlayersList.push([...players]);
      }, 100);

      // Wait for polling to capture data
      await waitFor(() => playerPlayersList.length > 0);

      // Assert - Player should see both host and themselves
      const latestPoll = playerPlayersList[playerPlayersList.length - 1];
      expect(latestPoll.length).toBe(2);
      expect(latestPoll).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ player_name: 'HostPlayer' }),
          expect.objectContaining({ player_name: 'Player1' }),
        ])
      );
    });
  });

  describe('WhenLeavingLobby_ShouldCleanupSnapshot', () => {
    test('should destroy snapshot and stop polling when leaving', async () => {
      // Arrange - Host creates game
      const { session } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = session.id;
      testJoinCode = session.join_code;

      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);
      await hostSnapshot.ready();

      let pollCount = 0;
      hostLobbyInterval = setInterval(() => {
        pollCount++;
        hostSnapshot.getPlayers();
      }, 100);

      // Wait for a few polls
      await waitFor(() => pollCount > 0);
      const pollsBeforeCleanup = pollCount;
      expect(pollsBeforeCleanup).toBeGreaterThan(0);

      // Act - Simulate leaving lobby (like main.js leaveGame)
      clearInterval(hostLobbyInterval);
      hostLobbyInterval = null;
      hostSnapshot.destroy();
      hostSnapshot = null;

      // Assert - Poll count should not increase after cleanup
      // Use waitForSilence to verify that pollCount stays equal to pollsBeforeCleanup
      await waitForSilence(() => pollCount === pollsBeforeCleanup, 300);
      
      expect(pollCount).toBe(pollsBeforeCleanup);
    });
  });

  describe('WhenPlayerLeavesSession_ShouldUpdateRemaining', () => {
    test('should update host snapshot when player disconnects', async () => {
      // Arrange - Host and player in session
      const { session } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = session.id;
      testJoinCode = session.join_code;

      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);
      await hostSnapshot.ready();

      await playerNetwork.joinGame(testJoinCode, 'Player1');
      playerSnapshot = new SessionPlayersSnapshot(playerNetwork, testSessionId);
      await playerSnapshot.ready();

      // Wait for both players to be visible
      await waitFor(() => hostSnapshot.getPlayers().size === 2);

      const hostPlayersList = [];
      hostLobbyInterval = setInterval(() => {
        const players = Array.from(hostSnapshot.getPlayers().values());
        hostPlayersList.push([...players]);
      }, 100);

      // Wait for initial polls to capture both players
      await waitFor(() => hostPlayersList.length > 0 && hostPlayersList[hostPlayersList.length - 1].length === 2);
      expect(hostPlayersList[hostPlayersList.length - 1].length).toBe(2);

      // Act - Player leaves (manually delete from database to simulate leaving)
      playerSnapshot.destroy();
      playerSnapshot = null;

      // Delete player from database (this triggers postgres_changes DELETE event)
      await playerClient
        .from('session_players')
        .delete()
        .eq('player_id', playerUser.id)
        .eq('session_id', testSessionId);

      playerNetwork.disconnect();

      // Wait for DELETE event to propagate
      await waitFor(() => {
         const latestPoll = hostPlayersList[hostPlayersList.length - 1];
         return latestPoll && latestPoll.length === 1;
      });

      // Assert - Host should only see themselves
      const latestPoll = hostPlayersList[hostPlayersList.length - 1];
      expect(latestPoll.length).toBe(1);
      expect(latestPoll[0]).toMatchObject({
        player_name: 'HostPlayer',
      });
    });
  });

  describe('WhenMultiplePlayersJoin_ShouldUpdateAllSnapshots', () => {
    test('should synchronize player list across all clients via polling', async () => {
      // Arrange - Host creates game
      const { session } = await hostNetwork.hostGame('HostPlayer');
      testSessionId = session.id;
      testJoinCode = session.join_code;

      hostSnapshot = new SessionPlayersSnapshot(hostNetwork, testSessionId);
      await hostSnapshot.ready();

      // Create a third client for Player2
      const player2Client = createMockSupabase();
      const { data: player2Auth } = await player2Client.auth.signInAnonymously();
      const player2Network = new Network();
      player2Network.initialize(player2Client, player2Auth.user.id);

      // Act - Two players join
      await playerNetwork.joinGame(testJoinCode, 'Player1');
      await player2Network.joinGame(testJoinCode, 'Player2');

      playerSnapshot = new SessionPlayersSnapshot(playerNetwork, testSessionId);
      await playerSnapshot.ready();

      const player2Snapshot = new SessionPlayersSnapshot(player2Network, testSessionId);
      await player2Snapshot.ready();

      // Wait for postgres_changes to propagate
      await waitFor(() => {
        const hostPlayers = Array.from(hostSnapshot.getPlayers().values());
        const player1Players = Array.from(playerSnapshot.getPlayers().values());
        const player2Players = Array.from(player2Snapshot.getPlayers().values());
        return hostPlayers.length === 3 && player1Players.length === 3 && player2Players.length === 3;
      });

      // Simulate polling for all clients
      const hostPlayers = Array.from(hostSnapshot.getPlayers().values());
      const player1Players = Array.from(playerSnapshot.getPlayers().values());
      const player2Players = Array.from(player2Snapshot.getPlayers().values());

      // Assert - All clients should see all 3 players
      expect(hostPlayers.length).toBe(3);
      expect(player1Players.length).toBe(3);
      expect(player2Players.length).toBe(3);

      // All should have the same players
      const expectedPlayers = expect.arrayContaining([
        expect.objectContaining({ player_name: 'HostPlayer' }),
        expect.objectContaining({ player_name: 'Player1' }),
        expect.objectContaining({ player_name: 'Player2' }),
      ]);

      expect(hostPlayers).toEqual(expectedPlayers);
      expect(player1Players).toEqual(expectedPlayers);
      expect(player2Players).toEqual(expectedPlayers);

      // Cleanup
      player2Snapshot.destroy();
      player2Network.disconnect();
      await player2Client.auth.signOut();
    });
  });
});
