import { jest } from '@jest/globals';
import { SessionPlayersSnapshot } from './SessionPlayersSnapshot.js';

describe('SessionPlayersSnapshot', () => {
  let snapshot;
  let mockSupabaseClient;
  let mockChannel;
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
      channel: jest.fn(),
    };

    // Mock channel
    mockChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
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
  });


  describe('Initialization', () => {
    test('WhenConstructed_ShouldFetchInitialSnapshotFilteredBySessionId', async () => {
      const mockPlayers = [createMockPlayer()];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
      expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('*');
      expect(mockSupabaseClient.from().select().eq).toHaveBeenCalledWith('session_id', TEST_SESSION_ID);
    });

    test('WhenInitialSnapshotFails_ShouldLogWarning', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch initial snapshot')
      );

      consoleWarnSpy.mockRestore();
    });

    test('WhenInitialized_ShouldSubscribeToDbEvents', async () => {
      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'session_players',
          // Note: No filter parameter - implementation manually filters in handler
          // to ensure DELETE events work correctly (Supabase limitation)
        }),
        expect.any(Function)
      );
    });

    test('WhenInitialized_ShouldSubscribeToPositionUpdates', async () => {
      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockChannel.on).toHaveBeenCalledWith(
        'broadcast',
        expect.objectContaining({
          event: 'position_update',
        }),
        expect.any(Function)
      );
    });

    test('WhenInitialized_ShouldStartPeriodicRefresh', async () => {
      jest.useFakeTimers();

      const mockPlayers = [createMockPlayer()];
      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await Promise.resolve(); // Flush promises

      // Clear initial fetch calls
      mockSupabaseClient.from.mockClear();

      // Fast-forward 60 seconds
      jest.advanceTimersByTime(60000);
      await Promise.resolve(); // Flush promises

      // Should have fetched snapshot again
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');

      jest.useRealTimers();
    });
  });

  describe('getPlayers', () => {
    test('WhenCalled_ShouldReturnMapOfPlayersKeyedByPlayerId', async () => {
      const mockPlayers = [
        createMockPlayer({ player_id: 'player-1', player_name: 'Player1' }),
        createMockPlayer({ player_id: 'player-2', player_name: 'Player2' }),
      ];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: mockPlayers,
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      const players = snapshot.getPlayers();

      expect(players).toBeInstanceOf(Map);
      expect(players.size).toBe(2);
      expect(players.get('player-1').player_name).toBe('Player1');
      expect(players.get('player-2').player_name).toBe('Player2');
    });

    test('WhenNoPlayers_ShouldReturnEmptyMap', async () => {
      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      const players = snapshot.getPlayers();

      expect(players).toBeInstanceOf(Map);
      expect(players.size).toBe(0);
    });
  });

  describe('addPlayer', () => {
    test('WhenCalled_ShouldInsertPlayerIntoDbWithSessionId', async () => {
      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      const playerData = {
        player_id: 'new-player-id',
        player_name: 'NewPlayer',
        is_host: false,
      };

      const mockInsertedPlayer = createMockPlayer(playerData);
      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: mockInsertedPlayer,
        error: null,
      });

      await snapshot.addPlayer(playerData);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
      expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: TEST_SESSION_ID,
          player_id: 'new-player-id',
          player_name: 'NewPlayer',
          is_host: false,
        })
      );
    });

    test('WhenPlayerInserted_ShouldAddToLocalMap', async () => {
      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      const playerData = {
        player_id: 'new-player-id',
        player_name: 'NewPlayer',
        is_host: false,
      };

      const mockInsertedPlayer = createMockPlayer(playerData);
      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: mockInsertedPlayer,
        error: null,
      });

      await snapshot.addPlayer(playerData);

      const players = snapshot.getPlayers();
      expect(players.has('new-player-id')).toBe(true);
      expect(players.get('new-player-id').player_name).toBe('NewPlayer');
    });

    test('WhenInsertFails_ShouldLogError', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      });

      await snapshot.addPlayer({ player_id: 'test', player_name: 'Test' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add player')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('DB Event Synchronization - INSERT', () => {
    test('WhenInsertEventReceived_ShouldAddPlayerToMap', async () => {
      let dbEventHandler;

      mockChannel.on.mockImplementation((type, config, handler) => {
        if (type === 'postgres_changes' && config.event === '*') {
          dbEventHandler = handler;
        }
        return mockChannel;
      });

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      const newPlayer = createMockPlayer({ player_id: 'inserted-player' });

      dbEventHandler({
        eventType: 'INSERT',
        new: newPlayer,
      });

      const players = snapshot.getPlayers();
      expect(players.has('inserted-player')).toBe(true);
      expect(players.get('inserted-player')).toEqual(newPlayer);
    });
  });

  describe('DB Event Synchronization - DELETE', () => {
    test('WhenDeleteEventReceived_ShouldRemovePlayerFromMap', async () => {
      let dbEventHandler;

      mockChannel.on.mockImplementation((type, config, handler) => {
        if (type === 'postgres_changes' && config.event === '*') {
          dbEventHandler = handler;
        }
        return mockChannel;
      });

      const existingPlayer = createMockPlayer({ player_id: 'existing-player' });

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [existingPlayer],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(snapshot.getPlayers().has('existing-player')).toBe(true);

      dbEventHandler({
        eventType: 'DELETE',
        old: existingPlayer,
      });

      expect(snapshot.getPlayers().has('existing-player')).toBe(false);
    });
  });

  describe('DB Event Synchronization - UPDATE', () => {
    test('WhenUpdateEventReceived_ShouldUpdatePlayerInMap', async () => {
      let dbEventHandler;

      mockChannel.on.mockImplementation((type, config, handler) => {
        if (type === 'postgres_changes' && config.event === '*') {
          dbEventHandler = handler;
        }
        return mockChannel;
      });

      const existingPlayer = createMockPlayer({
        player_id: 'existing-player',
        kills: 0,
      });

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [existingPlayer],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      const updatedPlayer = { ...existingPlayer, kills: 5 };

      dbEventHandler({
        eventType: 'UPDATE',
        new: updatedPlayer,
      });

      const players = snapshot.getPlayers();
      expect(players.get('existing-player').kills).toBe(5);
    });
  });

  describe('Position Update Synchronization', () => {
    test('WhenPositionUpdateReceived_ShouldUpdatePlayerPositionInMap', async () => {
      let positionUpdateHandler;

      mockChannel.on.mockImplementation((type, config, handler) => {
        if (type === 'broadcast' && config.event === 'position_update') {
          positionUpdateHandler = handler;
        }
        return mockChannel;
      });

      const existingPlayer = createMockPlayer({
        player_id: 'moving-player',
        position_x: 0,
        position_y: 0,
      });

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [existingPlayer],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      positionUpdateHandler({
        payload: {
          player_id: 'moving-player',
          position_x: 100,
          position_y: 200,
          rotation: 1.5,
        },
      });

      const players = snapshot.getPlayers();
      expect(players.get('moving-player').position_x).toBe(100);
      expect(players.get('moving-player').position_y).toBe(200);
      expect(players.get('moving-player').rotation).toBe(1.5);
    });

    test('WhenPositionUpdateForNonExistentPlayer_ShouldIgnore', async () => {
      let positionUpdateHandler;

      mockChannel.on.mockImplementation((type, config, handler) => {
        if (type === 'broadcast' && config.event === 'position_update') {
          positionUpdateHandler = handler;
        }
        return mockChannel;
      });

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      positionUpdateHandler({
        payload: {
          player_id: 'non-existent-player',
          position_x: 100,
          position_y: 200,
        },
      });

      const players = snapshot.getPlayers();
      expect(players.has('non-existent-player')).toBe(false);
    });

    test('WhenPositionUpdateReceived_ShouldNotWriteToDb', async () => {
      let positionUpdateHandler;

      mockChannel.on.mockImplementation((type, config, handler) => {
        if (type === 'broadcast' && config.event === 'position_update') {
          positionUpdateHandler = handler;
        }
        return mockChannel;
      });

      const existingPlayer = createMockPlayer({ player_id: 'moving-player' });

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: [existingPlayer],
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Clear mock calls from initialization
      mockSupabaseClient.from.mockClear();

      positionUpdateHandler({
        payload: {
          player_id: 'moving-player',
          position_x: 100,
          position_y: 200,
        },
      });

      // Should not have called any DB methods
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });
  });

  describe('Periodic Refresh', () => {
    test('WhenRefreshIntervalPasses_ShouldQueryOnlySessionPlayers', async () => {
      jest.useFakeTimers();

      const initialPlayers = [createMockPlayer({ player_id: 'player-1' })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: initialPlayers,
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await Promise.resolve(); // Flush promises

      // Clear mock calls
      mockSupabaseClient.from.mockClear();

      const refreshedPlayers = [
        createMockPlayer({ player_id: 'player-1' }),
        createMockPlayer({ player_id: 'player-2' }),
      ];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: refreshedPlayers,
        error: null,
      });

      // Fast-forward 60 seconds
      jest.advanceTimersByTime(60000);
      await Promise.resolve(); // Flush promises

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
      expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('*');
      expect(mockSupabaseClient.from().select().eq).toHaveBeenCalledWith('session_id', TEST_SESSION_ID);

      jest.useRealTimers();
    });

    test('WhenRefreshCompletes_ShouldReplaceLocalMap', async () => {
      jest.useFakeTimers();

      const initialPlayers = [createMockPlayer({ player_id: 'player-1' })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: initialPlayers,
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await Promise.resolve(); // Flush promises

      expect(snapshot.getPlayers().size).toBe(1);

      const refreshedPlayers = [
        createMockPlayer({ player_id: 'player-2' }),
        createMockPlayer({ player_id: 'player-3' }),
      ];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: refreshedPlayers,
        error: null,
      });

      // Fast-forward 60 seconds
      jest.advanceTimersByTime(60000);
      await Promise.resolve(); // Flush promises

      const players = snapshot.getPlayers();
      expect(players.size).toBe(2);
      expect(players.has('player-1')).toBe(false);
      expect(players.has('player-2')).toBe(true);
      expect(players.has('player-3')).toBe(true);

      jest.useRealTimers();
    });

    test('WhenRefreshFails_ShouldLogErrorAndContinue', async () => {
      jest.useFakeTimers();

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const initialPlayers = [createMockPlayer({ player_id: 'player-1' })];

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: initialPlayers,
        error: null,
      });

      snapshot = new SessionPlayersSnapshot(mockSupabaseClient, TEST_SESSION_ID, mockChannel);

      await Promise.resolve(); // Flush promises

      mockSupabaseClient.from().select().eq.mockResolvedValue({
        data: null,
        error: { message: 'Refresh failed' },
      });

      // Fast-forward 60 seconds
      jest.advanceTimersByTime(60000);
      await Promise.resolve(); // Flush promises

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to refresh snapshot')
      );

      // Should still have old data
      expect(snapshot.getPlayers().size).toBe(1);

      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    });
  });
});
