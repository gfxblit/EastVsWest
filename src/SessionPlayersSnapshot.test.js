import { jest } from '@jest/globals';
import { SessionPlayersSnapshot } from './SessionPlayersSnapshot.js';

describe('SessionPlayersSnapshot (Built on Network)', () => {
  let snapshot;
  let mockNetwork;
  let mockSupabaseClient;
  const TEST_SESSION_ID = 'test-session-id';
  const TEST_PLAYER_ID = 'test-player-id';

  const createMockPlayer = (overrides = {}) => ({
    id: 'player-record-id',
    session_id: TEST_SESSION_ID,
    player_id: TEST_PLAYER_ID,
    player_name: 'TestPlayer',
    is_host: false,
    is_connected: true,
    is_alive: true,
    position_x: 0,
    position_y: 0,
    velocity_x: 0,
    velocity_y: 0,
    rotation: 0,
    equipped_weapon: null,
    equipped_armor: null,
    kills: 0,
    damage_dealt: 0,
    joined_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Supabase client
    const mockSelect = jest.fn();
    const mockSelectForInsert = jest.fn();
    const mockEq = jest.fn();
    const mockInsert = jest.fn();
    const mockSingle = jest.fn();

    mockSupabaseClient = {
      from: jest.fn(),
    };

    // Setup default mock behaviors for SELECT queries
    mockSelect.mockReturnValue({
      eq: mockEq,
    });

    mockEq.mockResolvedValue({
      data: [],
      error: null,
    });

    // Setup mock chain for INSERT queries: insert() -> select() -> single()
    mockSelectForInsert.mockReturnValue({
      single: mockSingle,
    });

    mockInsert.mockReturnValue({
      select: mockSelectForInsert,
    });

    // from() returns different methods based on usage
    mockSupabaseClient.from.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    });

    // Mock Network instance (EventEmitter-like)
    mockNetwork = {
      supabase: mockSupabaseClient,
      sessionId: TEST_SESSION_ID,
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      send: jest.fn(),
    };
  });

  describe('Initialization', () => {
    test('WhenConstructed_ShouldSubscribeToNetworkPostgresChanges', async () => {
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);

      // Wait for async initialization
      await snapshot.ready();

      // Should subscribe to Network's postgres_changes event
      expect(mockNetwork.on).toHaveBeenCalledWith('postgres_changes', expect.any(Function));
    });

    test('WhenConstructed_ShouldSubscribeToNetworkBroadcastEvents', async () => {
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);

      // Wait for async initialization
      await snapshot.ready();

      // Should subscribe to Network's player_state_update events
      expect(mockNetwork.on).toHaveBeenCalledWith('player_state_update', expect.any(Function));
    });

    test('WhenConstructed_ShouldFetchInitialSnapshotFilteredBySessionId', async () => {
      const mockPlayers = [createMockPlayer()];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);

      // Wait for async initialization
      await snapshot.ready();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
      expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('*');
      expect(mockSupabaseClient.from().select().eq).toHaveBeenCalledWith('session_id', TEST_SESSION_ID);
    });

    test('WhenInitialSnapshotFails_ShouldLogWarning', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);

      // Wait for async initialization
      await snapshot.ready();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch initial snapshot'),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Postgres Changes Handling', () => {
    test('WhenNetworkEmitsPostgresChangesForSessionPlayers_ShouldUpdateLocalMap', async () => {
      const mockPlayers = [createMockPlayer()];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let postgresChangesHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'postgres_changes') {
          postgresChangesHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting postgres_changes for INSERT
      const newPlayer = createMockPlayer({ player_id: 'player-2', player_name: 'NewPlayer' });
      postgresChangesHandler({
        eventType: 'INSERT',
        new: newPlayer,
        old: null,
        schema: 'public',
        table: 'session_players',
      });

      // Should update local players map
      const players = snapshot.getPlayers();
      expect(players.get('player-2')).toEqual(newPlayer);
    });

    test('WhenNetworkEmitsPostgresChangesForDelete_ShouldRemoveFromLocalMap', async () => {
      const playerToRemove = createMockPlayer({ player_id: 'player-to-remove', id: 'record-id-123' });
      const mockPlayers = [playerToRemove];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let postgresChangesHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'postgres_changes') {
          postgresChangesHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      expect(snapshot.getPlayers().has('player-to-remove')).toBe(true);

      // Simulate Network emitting postgres_changes for DELETE
      // Note: Supabase Realtime DELETE only sends the primary key in 'old'
      postgresChangesHandler({
        eventType: 'DELETE',
        new: null,
        old: { id: 'record-id-123', session_id: TEST_SESSION_ID },
        schema: 'public',
        table: 'session_players',
      });

      // Should remove from local players map
      expect(snapshot.getPlayers().has('player-to-remove')).toBe(false);
    });

    test('WhenNetworkEmitsPostgresChangesForDeleteWithMissingSessionId_ShouldStillRemoveIfPlayerExists', async () => {
      const playerToRemove = createMockPlayer({ player_id: 'player-to-remove', id: 'record-id-123' });
      const mockPlayers = [playerToRemove];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let postgresChangesHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'postgres_changes') {
          postgresChangesHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();
      expect(snapshot.getPlayers().has('player-to-remove')).toBe(true);

      // Simulate Network emitting postgres_changes for DELETE with MISSING session_id in old record
      // as is common with some Supabase Realtime configurations
      postgresChangesHandler({
        eventType: 'DELETE',
        new: null,
        old: { id: 'record-id-123' }, // No session_id
        schema: 'public',
        table: 'session_players',
      });

      // Should remove from local players map
      expect(snapshot.getPlayers().has('player-to-remove')).toBe(false);
    });

    test('WhenNetworkEmitsPostgresChangesForDeleteWithDifferentSession_ShouldIgnore', async () => {
      const playerToKeep = createMockPlayer({ player_id: 'player-to-keep', id: 'record-id-456' });
      const mockPlayers = [playerToKeep];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let postgresChangesHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'postgres_changes') {
          postgresChangesHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting postgres_changes for DELETE with DIFFERENT session_id
      postgresChangesHandler({
        eventType: 'DELETE',
        new: null,
        old: { id: 'record-id-456', session_id: 'different-session-id' },
        schema: 'public',
        table: 'session_players',
      });

      // Should NOT remove from local players map
      expect(snapshot.getPlayers().has('player-to-keep')).toBe(true);
    });

    test('WhenNetworkEmitsPostgresChangesForDeleteWithUnknownId_ShouldIgnore', async () => {
      const playerToKeep = createMockPlayer({ player_id: 'player-to-keep', id: 'record-id-456' });
      const mockPlayers = [playerToKeep];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let postgresChangesHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'postgres_changes') {
          postgresChangesHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting postgres_changes for DELETE with UNKNOWN id
      postgresChangesHandler({
        eventType: 'DELETE',
        new: null,
        old: { id: 'unknown-id', session_id: TEST_SESSION_ID },
        schema: 'public',
        table: 'session_players',
      });

      // Should NOT remove anything
      expect(snapshot.getPlayers().has('player-to-keep')).toBe(true);
      expect(snapshot.getPlayers().size).toBe(1);
    });

    test('WhenNetworkEmitsPostgresChangesForUpdate_ShouldUpdateLocalMapAndPreserveLocalFields', async () => {
      const player = createMockPlayer({ player_id: TEST_PLAYER_ID, id: 'record-id-123', health: 100 });
      const mockPlayers = [player];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let postgresChangesHandler;
      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'postgres_changes') postgresChangesHandler = handler;
        if (event === 'player_state_update') playerStateUpdateHandler = handler;
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // First, add some local state (position history) via broadcast
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: TEST_PLAYER_ID,
        data: { position_x: 10, position_y: 20 },
      });

      expect(snapshot.getPlayers().get(TEST_PLAYER_ID).positionHistory).toBeDefined();
      expect(snapshot.getPlayers().get(TEST_PLAYER_ID).positionHistory.length).toBe(1);

      // Simulate Network emitting postgres_changes for UPDATE (e.g., host updated health in DB)
      // IMPORTANT: Simulate a FRESH object from DB that does NOT have local-only fields
      const updatedPlayer = createMockPlayer({ 
        player_id: TEST_PLAYER_ID, 
        id: 'record-id-123', 
        health: 80, 
        position_x: 10, 
        position_y: 20, 
      });
      
      postgresChangesHandler({
        eventType: 'UPDATE',
        new: updatedPlayer,
        old: player,
        schema: 'public',
        table: 'session_players',
      });

      // Should update health but PRESERVE positionHistory
      const localPlayer = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(localPlayer.health).toBe(80);
      expect(localPlayer.positionHistory).toBeDefined();
      expect(localPlayer.positionHistory.length).toBe(1);
    });

    test('WhenNetworkEmitsPostgresChangesForStatusUpdate_ShouldUpdateLocalMap', async () => {
      const player = createMockPlayer({ player_id: TEST_PLAYER_ID, id: 'record-id-123', is_alive: true, is_connected: true });
      const mockPlayers = [player];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let postgresChangesHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'postgres_changes') postgresChangesHandler = handler;
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate player being eliminated and disconnecting in DB
      const updatedPlayer = { ...player, is_alive: false, is_connected: false };
      postgresChangesHandler({
        eventType: 'UPDATE',
        new: updatedPlayer,
        old: player,
        schema: 'public',
        table: 'session_players',
      });

      const localPlayer = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(localPlayer.is_alive).toBe(false);
      expect(localPlayer.is_connected).toBe(false);
    });

    test('WhenNetworkEmitsPostgresChangesForOtherTable_ShouldIgnore', async () => {
      const mockPlayers = [createMockPlayer()];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let postgresChangesHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'postgres_changes') {
          postgresChangesHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      const initialSize = snapshot.getPlayers().size;

      // Simulate Network emitting postgres_changes for different table
      postgresChangesHandler({
        eventType: 'INSERT',
        new: { id: 'item-1', name: 'Sword' },
        old: null,
        schema: 'public',
        table: 'session_items',
      });

      // Should NOT update players map
      expect(snapshot.getPlayers().size).toBe(initialSize);
    });

    test('WhenNetworkEmitsPostgresChangesForDifferentSession_ShouldIgnore', async () => {
      const mockPlayers = [createMockPlayer()];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let postgresChangesHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'postgres_changes') {
          postgresChangesHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      const initialSize = snapshot.getPlayers().size;

      // Simulate Network emitting postgres_changes for different session
      const playerInDifferentSession = createMockPlayer({
        session_id: 'different-session-id',
        player_id: 'player-2',
      });
      postgresChangesHandler({
        eventType: 'INSERT',
        new: playerInDifferentSession,
        old: null,
        schema: 'public',
        table: 'session_players',
      });

      // Should NOT update players map
      expect(snapshot.getPlayers().size).toBe(initialSize);
    });
  });

  describe('Generic Player State Update Handling', () => {
    test('WhenNetworkEmitsPlayerStateUpdate_ShouldUpdateAllProvidedFields', async () => {
      const HOST_ID = 'host-player-id';
      mockNetwork.hostId = HOST_ID; // Set host ID for authorization

      const mockPlayers = [createMockPlayer({
        position_x: 100,
        position_y: 200,
        health: 100,
        velocity_x: 0,
        velocity_y: 0,
      })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting player_state_update with mixed fields from host
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: HOST_ID, // From host (can update all fields)
        data: {
          player_id: TEST_PLAYER_ID,
          position_x: 300,
          position_y: 400,
          velocity_x: 10,
          velocity_y: 20,
          rotation: 1.57,
          health: 75,
        },
      });

      // Should update all provided fields in memory
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.position_x).toBe(300);
      expect(player.position_y).toBe(400);
      expect(player.velocity_x).toBe(10);
      expect(player.velocity_y).toBe(20);
      expect(player.rotation).toBe(1.57);
      expect(player.health).toBe(75);
    });

    test('WhenNetworkEmitsBatchedPlayerStateUpdate_ShouldUpdateAllPlayers', async () => {
      const HOST_ID = 'host-id';
      mockNetwork.hostId = HOST_ID; // Set host ID for authorization

      const mockPlayers = [
        createMockPlayer({ player_id: 'player-1', health: 100 }),
        createMockPlayer({ player_id: 'player-2', health: 100 }),
        createMockPlayer({ player_id: 'player-3', health: 100 }),
      ];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting batched player_state_update from host
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: HOST_ID, // From host (can update health)
        data: [
          { player_id: 'player-1', health: 80, position_x: 100 },
          { player_id: 'player-2', health: 60, position_x: 200 },
          { player_id: 'player-3', health: 90, position_x: 300 },
        ],
      });

      // Should update all players
      const player1 = snapshot.getPlayers().get('player-1');
      expect(player1.health).toBe(80);
      expect(player1.position_x).toBe(100);

      const player2 = snapshot.getPlayers().get('player-2');
      expect(player2.health).toBe(60);
      expect(player2.position_x).toBe(200);

      const player3 = snapshot.getPlayers().get('player-3');
      expect(player3.health).toBe(90);
      expect(player3.position_x).toBe(300);
    });

    test('WhenNetworkEmitsPlayerStateUpdateWithOnlyHealth_ShouldUpdateOnlyHealth', async () => {
      const HOST_ID = 'host-id';
      mockNetwork.hostId = HOST_ID; // Set host ID for authorization

      const mockPlayers = [createMockPlayer({
        position_x: 100,
        position_y: 200,
        health: 100,
      })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting player_state_update with only health from host
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: HOST_ID, // From host (can update health)
        data: {
          player_id: TEST_PLAYER_ID,
          health: 50,
        },
      });

      // Should update only health, position remains unchanged
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.health).toBe(50);
      expect(player.position_x).toBe(100); // unchanged
      expect(player.position_y).toBe(200); // unchanged
    });

    test('WhenNetworkEmitsPlayerStateUpdateForNonexistentPlayer_ShouldIgnore', async () => {
      const mockPlayers = [createMockPlayer()];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate player_state_update for player not in this session
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: 'host-id',
        data: {
          player_id: 'unknown-player-id',
          health: 50,
        },
      });

      // Should not crash or add new player
      expect(snapshot.getPlayers().get('unknown-player-id')).toBeUndefined();
    });

    test('WhenUpdatePlayersCalled_ShouldSyncLocalMapWithProvidedList', async () => {
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      const initialPlayers = [
        createMockPlayer({ player_id: 'p1', player_name: 'Player 1' }),
        createMockPlayer({ player_id: 'p2', player_name: 'Player 2' }),
      ];

      snapshot.updatePlayers(initialPlayers);

      expect(snapshot.getPlayers().size).toBe(2);
      expect(snapshot.getPlayers().get('p1').player_name).toBe('Player 1');
      expect(snapshot.getPlayers().get('p2').player_name).toBe('Player 2');

      const updatedPlayers = [
        createMockPlayer({ player_id: 'p1', player_name: 'Player 1 Updated' }),
        createMockPlayer({ player_id: 'p3', player_name: 'Player 3' }),
      ];

      snapshot.updatePlayers(updatedPlayers);

      expect(snapshot.getPlayers().size).toBe(2);
      expect(snapshot.getPlayers().get('p1').player_name).toBe('Player 1 Updated');
      expect(snapshot.getPlayers().get('p3').player_name).toBe('Player 3');
      expect(snapshot.getPlayers().has('p2')).toBe(false);
    });
  });

  describe('Authorization Checks', () => {
    const HOST_ID = 'host-player-id';
    const OTHER_PLAYER_ID = 'other-player-id';

    beforeEach(() => {
      mockNetwork.hostId = HOST_ID;
    });

    test('WhenClientTriesToSpoofOtherPlayerPosition_ShouldReject', async () => {
      const mockPlayers = [
        createMockPlayer({ player_id: TEST_PLAYER_ID, position_x: 100, position_y: 200 }),
        createMockPlayer({ player_id: OTHER_PLAYER_ID, position_x: 300, position_y: 400 }),
      ];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Malicious client tries to update another player's position
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: TEST_PLAYER_ID, // Sender is TEST_PLAYER_ID
        data: {
          player_id: OTHER_PLAYER_ID, // But trying to update OTHER_PLAYER_ID
          position_x: 999,
          position_y: 999,
        },
      });

      // Should NOT update other player's position
      const otherPlayer = snapshot.getPlayers().get(OTHER_PLAYER_ID);
      expect(otherPlayer.position_x).toBe(300); // Unchanged
      expect(otherPlayer.position_y).toBe(400); // Unchanged
    });

    test('WhenClientTriesToUpdateHealth_ShouldReject', async () => {
      const mockPlayers = [createMockPlayer({ player_id: TEST_PLAYER_ID, health: 100 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Malicious client tries to update their own health (host-auth field)
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: TEST_PLAYER_ID,
        data: {
          player_id: TEST_PLAYER_ID,
          health: 999, // Trying to set health to 999
        },
      });

      // Should NOT update health (host-auth field)
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.health).toBe(100); // Unchanged
    });

    test('WhenHostUpdatesOtherPlayerPosition_ShouldAccept', async () => {
      const mockPlayers = [
        createMockPlayer({ player_id: OTHER_PLAYER_ID, position_x: 300, position_y: 400 }),
      ];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Host updates another player's position (allowed)
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: HOST_ID, // From host
        data: {
          player_id: OTHER_PLAYER_ID,
          position_x: 999,
          position_y: 888,
        },
      });

      // Should update position (host can update client-auth fields)
      const player = snapshot.getPlayers().get(OTHER_PLAYER_ID);
      expect(player.position_x).toBe(999);
      expect(player.position_y).toBe(888);
    });

    test('WhenHostUpdatesPlayerHealth_ShouldAccept', async () => {
      const mockPlayers = [createMockPlayer({ player_id: TEST_PLAYER_ID, health: 100 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Host updates player health (allowed)
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: HOST_ID, // From host
        data: {
          player_id: TEST_PLAYER_ID,
          health: 75,
        },
      });

      // Should update health (host can update host-auth fields)
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.health).toBe(75);
    });

    test('WhenHostUpdatesEquippedItems_ShouldAccept', async () => {
      const HOST_ID = 'host-id';
      mockNetwork.hostId = HOST_ID;

      const mockPlayers = [createMockPlayer({ player_id: TEST_PLAYER_ID })];
      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Host updates player equipment
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: HOST_ID,
        data: {
          player_id: TEST_PLAYER_ID,
          equipped_weapon: 'shotgun',
          equipped_armor: 'kevlar',
        },
      });

      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.equipped_weapon).toBe('shotgun');
      expect(player.equipped_armor).toBe('kevlar');
    });

    test('WhenClientTriesToUpdateEquippedItems_ShouldReject', async () => {
      const mockPlayers = [createMockPlayer({ player_id: TEST_PLAYER_ID, equipped_weapon: 'pistol' })];
      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Client tries to update their own equipment
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: TEST_PLAYER_ID,
        data: {
          player_id: TEST_PLAYER_ID,
          equipped_weapon: 'rocket-launcher',
        },
      });

      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.equipped_weapon).toBe('pistol'); // Unchanged
    });

    test('WhenHostUpdatesExpandedWhitelistFields_ShouldAccept', async () => {
      const HOST_ID = 'host-id';
      mockNetwork.hostId = HOST_ID;

      const mockPlayers = [createMockPlayer({ 
        player_id: TEST_PLAYER_ID,
        is_alive: true,
        kills: 0,
        damage_dealt: 0,
        is_connected: true,
      })];
      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Host updates expanded whitelist fields
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: HOST_ID,
        data: {
          player_id: TEST_PLAYER_ID,
          is_alive: false,
          kills: 5,
          damage_dealt: 1250.5,
          is_connected: false,
        },
      });

      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.is_alive).toBe(false);
      expect(player.kills).toBe(5);
      expect(player.damage_dealt).toBe(1250.5);
      expect(player.is_connected).toBe(false);
    });

    test('WhenClientTriesToUpdateExpandedWhitelistFields_ShouldReject', async () => {
      const mockPlayers = [createMockPlayer({ 
        player_id: TEST_PLAYER_ID,
        is_alive: true,
        kills: 0,
        damage_dealt: 0,
        is_connected: true,
      })];
      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Client tries to update expanded whitelist fields (host-auth)
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: TEST_PLAYER_ID,
        data: {
          player_id: TEST_PLAYER_ID,
          is_alive: false,
          kills: 99,
          damage_dealt: 9999,
        },
      });

      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.is_alive).toBe(true); // Unchanged
      expect(player.kills).toBe(0); // Unchanged
      expect(player.damage_dealt).toBe(0); // Unchanged
    });

    test('WhenPlayerUpdatesOwnPosition_ShouldAccept', async () => {
      const mockPlayers = [createMockPlayer({ player_id: TEST_PLAYER_ID, position_x: 100, position_y: 200 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Player updates their own position (allowed)
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: TEST_PLAYER_ID, // From self
        data: {
          player_id: TEST_PLAYER_ID,
          position_x: 500,
          position_y: 600,
        },
      });

      // Should update position (player can update own client-auth fields)
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.position_x).toBe(500);
      expect(player.position_y).toBe(600);
    });
  });

  describe('Position Interpolation History', () => {
    let mockNow;

    beforeEach(() => {
      mockNow = jest.spyOn(performance, 'now').mockReturnValue(1000);
    });

    afterEach(() => {
      mockNow.mockRestore();
    });

    test('WhenMovementUpdateReceived_ShouldAddSnapshotToHistory', async () => {
      const mockPlayers = [createMockPlayer({ position_x: 100, position_y: 200 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate update at t=1000
      mockNow.mockReturnValue(1000);
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: TEST_PLAYER_ID,
        data: {
          position_x: 110,
          position_y: 210,
          rotation: 1.0,
          velocity_x: 10,
          velocity_y: 10,
        },
      });

      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.positionHistory).toBeDefined();
      expect(player.positionHistory).toHaveLength(1);
      expect(player.positionHistory[0]).toEqual({
        x: 110,
        y: 210,
        rotation: 1.0,
        velocity_x: 10,
        velocity_y: 10,
        timestamp: 1000,
      });
    });

    test('WhenMultipleUpdatesReceived_ShouldMaintainCircularBufferOfSize3', async () => {
      const mockPlayers = [createMockPlayer({ position_x: 100, position_y: 200 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Add 4 updates
      const timestamps = [1000, 1050, 1100, 1150];
      
      timestamps.forEach((time, index) => {
        mockNow.mockReturnValue(time);
        playerStateUpdateHandler({
          type: 'player_state_update',
          from: TEST_PLAYER_ID,
          data: {
            position_x: 100 + index,
            position_y: 200 + index,
            rotation: 0,
            velocity_x: 0,
            velocity_y: 0,
          },
        });
      });

      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.positionHistory).toHaveLength(3);
      
      // Should have last 3 updates (1050, 1100, 1150)
      expect(player.positionHistory[0].timestamp).toBe(1050);
      expect(player.positionHistory[1].timestamp).toBe(1100);
      expect(player.positionHistory[2].timestamp).toBe(1150);
    });

    test('WhenPlayerStateUpdateReceived_ShouldAlsoUpdateHistory', async () => {
      // Setup host auth
      mockNetwork.hostId = 'host-id';
      
      const mockPlayers = [createMockPlayer({ position_x: 100, position_y: 200 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let playerStateUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'player_state_update') {
          playerStateUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate update at t=2000
      mockNow.mockReturnValue(2000);
      playerStateUpdateHandler({
        type: 'player_state_update',
        from: TEST_PLAYER_ID,
        data: {
          player_id: TEST_PLAYER_ID,
          position_x: 150,
          position_y: 250,
          rotation: 2.0,
          velocity_x: 5,
          velocity_y: 5,
        },
      });

      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.positionHistory).toBeDefined();
      expect(player.positionHistory.length).toBeGreaterThan(0);
      const lastUpdate = player.positionHistory[player.positionHistory.length - 1];
      
      expect(lastUpdate.x).toBe(150);
      expect(lastUpdate.y).toBe(250);
      expect(lastUpdate.timestamp).toBe(2000);
    });
  });

  describe('Interpolation', () => {
    let mockNow;

    beforeEach(() => {
      mockNow = jest.spyOn(performance, 'now');
    });

    afterEach(() => {
      mockNow.mockRestore();
    });

    test('WhenPlayerOrHistoryMissing_ShouldReturnDefaultOrCurrent', async () => {
      const mockPlayers = [createMockPlayer({ position_x: 100, position_y: 200 })];
      mockSupabaseClient.from().select().eq.mockResolvedValue({ data: mockPlayers, error: null });
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Non-existent player
      expect(snapshot.getInterpolatedPlayerState('unknown', 1000)).toBeNull();

      // Player with no history
      const result = snapshot.getInterpolatedPlayerState(TEST_PLAYER_ID, 1000);
      expect(result).toEqual(expect.objectContaining({ x: 100, y: 200 }));
    });

    test('WhenTargetTimeAfterNewest_ShouldUseNewest', async () => {
      const mockPlayers = [createMockPlayer()];
      mockSupabaseClient.from().select().eq.mockResolvedValue({ data: mockPlayers, error: null });
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();
      
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      player.positionHistory = [{ x: 10, y: 10, timestamp: 1000 }];

      // Target time 1200 (minus 100 delay = 1100) > 1000
      const result = snapshot.getInterpolatedPlayerState(TEST_PLAYER_ID, 1200);
      expect(result.x).toBe(10);
      expect(result.y).toBe(10);
    });

    test('WhenTargetTimeBeforeOldest_ShouldUseOldest', async () => {
      const mockPlayers = [createMockPlayer()];
      mockSupabaseClient.from().select().eq.mockResolvedValue({ data: mockPlayers, error: null });
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();
      
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      player.positionHistory = [{ x: 10, y: 10, timestamp: 1000 }];

      // Target time 1000 (minus 100 delay = 900) < 1000
      const result = snapshot.getInterpolatedPlayerState(TEST_PLAYER_ID, 1000);
      expect(result.x).toBe(10);
      expect(result.y).toBe(10);
    });

    test('WhenTargetTimeBetweenSnapshots_ShouldInterpolate', async () => {
      const mockPlayers = [createMockPlayer()];
      mockSupabaseClient.from().select().eq.mockResolvedValue({ data: mockPlayers, error: null });
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();
      
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      player.positionHistory = [
        { x: 0, y: 0, velocity_x: 0, velocity_y: 0, rotation: 0, timestamp: 1000 },
        { x: 100, y: 100, velocity_x: 10, velocity_y: 10, rotation: 1, timestamp: 2000 },
      ];

      // Delay is 100ms. We want target time to be 1500. So renderTime = 1600.
      // t = (1500 - 1000) / (2000 - 1000) = 0.5
      const result = snapshot.getInterpolatedPlayerState(TEST_PLAYER_ID, 1600);
      
      expect(result.x).toBeCloseTo(50);
      expect(result.y).toBeCloseTo(50);
      expect(result.vx).toBeCloseTo(5);
      expect(result.vy).toBeCloseTo(5);
      expect(result.rotation).toBeCloseTo(0.5);
    });
    
    test('ShouldInterpolateRotationShortestPath', async () => {
      const mockPlayers = [createMockPlayer()];
      mockSupabaseClient.from().select().eq.mockResolvedValue({ data: mockPlayers, error: null });
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();
        
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      // 350 degrees (approx 6.10 rad) to 10 degrees (approx 0.17 rad)
      // Shortest path crosses 0.
      const startRot = 350 * Math.PI / 180; 
      const endRot = 10 * Math.PI / 180;
        
      player.positionHistory = [
        { x: 0, y: 0, vx: 0, vy: 0, rotation: startRot, timestamp: 1000 },
        { x: 0, y: 0, vx: 0, vy: 0, rotation: endRot, timestamp: 2000 },
      ];
  
      // t = 0.5 (renderTime 1600)
      const result = snapshot.getInterpolatedPlayerState(TEST_PLAYER_ID, 1600);
        
      // Expected: 0 degrees (0 rad)
      // But since we normalize to 0-2PI, 0 is 0.
      // Wait, 350 (-10) to 10 is 20 deg diff. Halfway is 0.
      // Let's check boundaries.
      // 350 is 6.10865
      // 10 is 0.174533
      // Diff is 0.17 - 6.10 = -5.93. 
      // -5.93 < -PI, so add 2PI => -5.93 + 6.28 = 0.35 radians (approx 20 degrees positive diff)
      // t=0.5 -> start + 0.35 * 0.5 = 6.108 + 0.175 = 6.283 (approx 2PI/0)
        
      const expectedRot = 0; // or 2PI
      // Allow for floating point wrapping, so check if close to 0 OR close to 2PI
      const isCloseToZero = Math.abs(result.rotation) < 0.01;
      const isCloseToTwoPi = Math.abs(result.rotation - 2 * Math.PI) < 0.01;
        
      expect(isCloseToZero || isCloseToTwoPi).toBe(true);
    });
  });

  describe('Destroy', () => {
    test('WhenDestroyCalled_ShouldUnsubscribeFromNetworkEvents', async () => {
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      snapshot.destroy();

      // Should unsubscribe from Network events
      expect(mockNetwork.off).toHaveBeenCalled();
    });

    test('WhenDestroyCalled_ShouldClearPeriodicRefresh', async () => {
      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID, { refreshIntervalMs: 100 });
      await snapshot.ready();

      // Verify interval was created
      expect(snapshot.refreshInterval).not.toBeNull();

      snapshot.destroy();

      // Should clear interval
      expect(snapshot.refreshInterval).toBeNull();
    });
  });

  describe('Bug Fixes', () => {
    test('Host should NOT overwrite local authoritative bot health with stale DB data during refresh', async () => {
      jest.useFakeTimers();

      // Setup host auth
      mockNetwork.isHost = true;
      mockNetwork.hostId = TEST_PLAYER_ID; // The mocked network uses TEST_PLAYER_ID as its ID implicitly in tests usually, but let's be safe
      
      const BOT_ID = 'bot-id';

      // 1. Initial State: Bot exists in DB with health 100
      const initialBotState = {
        player_id: BOT_ID,
        session_id: TEST_SESSION_ID,
        is_bot: true,
        health: 100,
        position_x: 0,
        position_y: 0,
      };

      // Setup mock to return initial state first
      mockSupabaseClient.from().select().eq.mockResolvedValueOnce({
        data: [initialBotState],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Verify initial load
      let bot = snapshot.getPlayers().get(BOT_ID);
      expect(bot.health).toBe(100);

      // 2. Simulate Host Logic: Bot takes damage and dies locally
      bot.health = 0;
      expect(snapshot.getPlayers().get(BOT_ID).health).toBe(0);

      // 3. Trigger Refresh: DB still has health 100 (stale)
      // IMPORTANT: Return a NEW object to ensure we test data overwriting, 
      // not object reference mutation.
      mockSupabaseClient.from().select().eq.mockResolvedValueOnce({
        data: [{ 
          ...initialBotState, 
          health: 100, // Explicitly 100
        }],
        error: null,
      });

      // Fast-forward time to trigger refresh interval
      jest.advanceTimersByTime(60000);
      
      // Wait for promises to resolve (refresh is async)
      await new Promise(jest.requireActual('timers').setImmediate);

      // 4. Assertion: Bot health should STILL be 0 because we are Host
      bot = snapshot.getPlayers().get(BOT_ID);
      expect(bot.health).toBe(0); 

      jest.useRealTimers();
    });
  });
});
