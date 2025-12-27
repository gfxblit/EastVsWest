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

      // Should subscribe to Network's position_update and position_broadcast events
      expect(mockNetwork.on).toHaveBeenCalledWith('position_update', expect.any(Function));
      expect(mockNetwork.on).toHaveBeenCalledWith('position_broadcast', expect.any(Function));
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

  describe('Position Update Handling', () => {
    test('WhenNetworkEmitsPositionUpdate_ShouldUpdatePlayerPosition', async () => {
      const mockPlayers = [createMockPlayer({ position_x: 100, position_y: 200 })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let positionUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'position_update') {
          positionUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate Network emitting position_update
      positionUpdateHandler({
        type: 'position_update',
        from: TEST_PLAYER_ID,
        data: {
          position_x: 300,
          position_y: 400,
          rotation: 1.57,
        },
      });

      // Should update position in memory
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.position_x).toBe(300);
      expect(player.position_y).toBe(400);
      expect(player.rotation).toBe(1.57);
    });

    test('WhenNetworkEmitsPositionUpdateForNonexistentPlayer_ShouldIgnore', async () => {
      const mockPlayers = [createMockPlayer()];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      let positionUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'position_update') {
          positionUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate position_update for player not in this session
      positionUpdateHandler({
        type: 'position_update',
        from: 'unknown-player-id',
        data: {
          position_x: 300,
          position_y: 400,
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
