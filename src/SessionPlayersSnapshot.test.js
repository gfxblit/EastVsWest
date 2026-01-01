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

  describe('Generic Player State Update Handling', () => {
    test('WhenNetworkEmitsPlayerStateUpdate_ShouldUpdateAllProvidedFields', async () => {
      const HOST_ID = 'host-player-id';
      mockNetwork.hostId = HOST_ID; // Set host ID for authorization

      const mockPlayers = [createMockPlayer({
        position_x: 100,
        position_y: 200,
        health: 100,
        velocity_x: 0,
        velocity_y: 0
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
        health: 100
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

  describe('Backward Compatibility', () => {
    test('WhenNetworkEmitsMovementUpdate_ShouldStillWork', async () => {
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

      // Simulate Network emitting legacy movement_update
      movementUpdateHandler({
        type: 'movement_update',
        from: TEST_PLAYER_ID,
        data: {
          position_x: 500,
          position_y: 600,
          rotation: 3.14,
        },
      });

      // Should still update position using legacy format
      const player = snapshot.getPlayers().get(TEST_PLAYER_ID);
      expect(player.position_x).toBe(500);
      expect(player.position_y).toBe(600);
      expect(player.rotation).toBe(3.14);
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

      let movementUpdateHandler;
      mockNetwork.on.mockImplementation((event, handler) => {
        if (event === 'movement_update') {
          movementUpdateHandler = handler;
        }
      });

      snapshot = new SessionPlayersSnapshot(mockNetwork, TEST_SESSION_ID);
      await snapshot.ready();

      // Simulate update at t=1000
      mockNow.mockReturnValue(1000);
      movementUpdateHandler({
        type: 'movement_update',
        from: TEST_PLAYER_ID,
        data: {
          position_x: 110,
          position_y: 210,
          rotation: 1.0,
          velocity_x: 10,
          velocity_y: 10
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
        timestamp: 1000
      });
    });

    test('WhenMultipleUpdatesReceived_ShouldMaintainCircularBufferOfSize3', async () => {
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

      // Add 4 updates
      const timestamps = [1000, 1050, 1100, 1150];
      
      timestamps.forEach((time, index) => {
        mockNow.mockReturnValue(time);
        movementUpdateHandler({
          type: 'movement_update',
          from: TEST_PLAYER_ID,
          data: {
            position_x: 100 + index,
            position_y: 200 + index,
            rotation: 0,
            velocity_x: 0,
            velocity_y: 0
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
          velocity_y: 5
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
