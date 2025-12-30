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

      // Should subscribe to Network's movement_update events
      expect(mockNetwork.on).toHaveBeenCalledWith('movement_update', expect.any(Function));
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
        expect.stringContaining('Failed to fetch initial snapshot')
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
        player_id: 'player-2'
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

  describe('Movement Update Handling', () => {
    test('WhenNetworkEmitsMovementUpdate_ShouldUpdatePlayerPositionAndVelocity', async () => {
      const mockPlayers = [createMockPlayer({ position_x: 100, position_y: 200, velocity_x: 0, velocity_y: 0 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let movementUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'movement_update') {
          movementUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting movement_update using flattened format
      movementUpdateHandler({
        type: 'movement_update',
        from: TEST_PLAYER_ID,
        data: {
          position_x: 300,
          position_y: 400,
          velocity_x: 10,
          velocity_y: 20,
          rotation: 1.57,
        },
      });

      // Should update position and velocity in memory
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.position_x).toBe(300);
      expect(player.position_y).toBe(400);
      expect(player.velocity_x).toBe(10);
      expect(player.velocity_y).toBe(20);
      expect(player.rotation).toBe(1.57);
    });

    test('WhenNetworkEmitsMovementUpdateUsingLegacyNestedFormat_ShouldStillUpdate', async () => {
      const mockPlayers = [createMockPlayer({ position_x: 100, position_y: 200 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let movementUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'movement_update') {
          movementUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting movement_update using legacy nested format
      movementUpdateHandler({
        type: 'movement_update',
        from: TEST_PLAYER_ID,
        data: {
          position: { x: 500, y: 600 },
          velocity: { x: 50, y: 60 },
        },
      });

      // Should still update position and velocity in memory
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.position_x).toBe(500);
      expect(player.position_y).toBe(600);
      expect(player.velocity_x).toBe(50);
      expect(player.velocity_y).toBe(60);
    });

    test('WhenNetworkEmitsMovementUpdateWithHealth_ShouldUpdatePlayerHealth', async () => {
      const mockPlayers = [createMockPlayer({ health: 100 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let movementUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'movement_update') {
          movementUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting movement_update with health
      movementUpdateHandler({
        type: 'movement_update',
        from: TEST_PLAYER_ID,
        data: {
          player_id: TEST_PLAYER_ID,
          health: 80.5
        },
      });

      // Should update health in memory
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.health).toBe(80.5);
    });

    test('WhenNetworkEmitsMovementUpdateForNonexistentPlayer_ShouldIgnore', async () => {
      const mockPlayers = [createMockPlayer()];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let movementUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'movement_update') {
          movementUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate movement_update for player not in this session
      movementUpdateHandler({
        type: 'movement_update',
        from: 'unknown-player-id',
        data: {
          position: { x: 300, y: 400 },
        },
      });

      // Should not crash or add new player
      expect(snapshot.getPlayers().get('unknown-player-id')).toBeUndefined();
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
});
