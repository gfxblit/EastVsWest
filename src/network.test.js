import { jest } from '@jest/globals';
import { Network } from './network';

describe('Network', () => {
  let network;
  const MOCK_HOST_ID = 'test-host-id';
  const single = jest.fn();

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single,
    rpc: jest.fn(),
    removeChannel: jest.fn(),
    channel: jest.fn(),
  };

  beforeEach(() => {
    single.mockClear();
    mockSupabaseClient.rpc.mockClear();
    mockSupabaseClient.removeChannel.mockClear();
    mockSupabaseClient.channel.mockClear();
    network = new Network();
    network.initialize(mockSupabaseClient, MOCK_HOST_ID);
  });

  describe('hostGame', () => {
    it('should create a new game session in Supabase and return the join code', async () => {
      const mockJoinCode = 'ABCDEF';

      // Mock generateJoinCode to return a fixed value
      jest.spyOn(network, 'generateJoinCode').mockReturnValue(mockJoinCode);

      const mockSession = {
        id: 'mock-session-id',
        join_code: mockJoinCode,
        host_id: MOCK_HOST_ID,
        realtime_channel_name: 'game_session:ABCDEF',
      };

      const mockPlayerRecord = {
        id: 'player-record-id',
        session_id: mockSession.id,
        player_id: MOCK_HOST_ID,
        player_name: 'TestHost',
        is_host: true,
      };

      // Mock the channel subscription
      const mockChannel = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn((callback) => {
          callback('SUBSCRIBED');
          return mockChannel;
        }),
      };
      mockSupabaseClient.channel.mockReturnValue(mockChannel);

      // Mock two separate insert operations
      const mockSessionPlayersInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockPlayerRecord, error: null })
        })
      });

      mockSupabaseClient.from = jest.fn((table) => {
        if (table === 'game_sessions') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockSession, error: null })
              })
            })
          };
        } else if (table === 'session_players') {
          return {
            insert: mockSessionPlayersInsert
          };
        }
      });

      const result = await network.hostGame('TestHost');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('game_sessions');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
      expect(mockSessionPlayersInsert).toHaveBeenCalledWith(expect.objectContaining({
        position_x: 1200,
        position_y: 800
      }));
      expect(result.session.join_code).toBe(mockJoinCode);
      expect(result.player.id).toBe(mockPlayerRecord.id);
      expect(network.isHost).toBe(true);
      expect(network.joinCode).toBe(mockJoinCode);
      expect(network.sessionId).toBe(mockSession.id);
    });

    it('should throw an error if the game session could not be created', async () => {
      const mockError = new Error('Failed to create session');

      mockSupabaseClient.from = jest.fn(() => ({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: mockError })
          })
        })
      }));

      await expect(network.hostGame('TestHost')).rejects.toThrow(mockError);

      expect(network.isHost).toBe(false);
      expect(network.joinCode).toBe(null);
    });
  });

  describe('joinGame', () => {
    const MOCK_PLAYER_ID = 'test-player-id';
    const MOCK_PLAYER_NAME = 'TestPlayer';
    const MOCK_JOIN_CODE = 'ABC123';
    const MOCK_SESSION_ID = 'session-uuid-123';

    beforeEach(() => {
      // Reset mocks before each test
      jest.clearAllMocks();
      // Reset the network instance to have a player ID
      network = new Network();
      network.initialize(mockSupabaseClient, MOCK_PLAYER_ID);
    });

    it('should query the session, subscribe, fetch snapshot, and self-insert', async () => {
      const mockSession = {
        id: MOCK_SESSION_ID,
        join_code: MOCK_JOIN_CODE,
        host_id: 'host-uuid',
        status: 'lobby',
        max_players: 12,
        realtime_channel_name: 'game_session:ABC123',
      };

      const mockExistingPlayer = {
        player_id: 'host-uuid',
        player_name: 'Host',
        is_host: true
      };

      const mockNewPlayer = {
        session_id: MOCK_SESSION_ID,
        player_id: MOCK_PLAYER_ID,
        player_name: MOCK_PLAYER_NAME,
        is_host: false,
      };

      // 1. Mock RPC
      mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

      // 2. Mock Channel
      const mockChannel = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn((callback) => {
          callback('SUBSCRIBED');
          return mockChannel;
        }),
      };
      mockSupabaseClient.channel.mockReturnValue(mockChannel);

      // 3. Mock table interactions
      const mockSessionPlayersInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockNewPlayer, error: null })
        })
      });

      mockSupabaseClient.from = jest.fn((table) => {
        if (table === 'session_players') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [mockExistingPlayer], error: null })
            }),
            insert: mockSessionPlayersInsert
          };
        }
      });

      const result = await network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME);

      // Verify sequence of calls
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_session_by_join_code', { p_join_code: MOCK_JOIN_CODE });
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(mockSession.realtime_channel_name, expect.any(Object));
      expect(mockChannel.on).toHaveBeenCalledWith('postgres_changes', expect.any(Object), expect.any(Function));
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
      expect(mockSessionPlayersInsert).toHaveBeenCalledWith(expect.objectContaining({
        position_x: 1200,
        position_y: 800
      }));
      
      expect(network.sessionId).toBe(MOCK_SESSION_ID);
      expect(network.isHost).toBe(false);
      expect(network.joinCode).toBe(MOCK_JOIN_CODE);
      expect(network.connected).toBe(true);

      expect(result.player).toEqual(mockNewPlayer);
      // Network no longer maintains players Map - that's SessionPlayersSnapshot's job
      expect(network.players).toBeUndefined();
    });

    it('should handle reconnection when player is already in session (Unique Constraint 23505)', async () => {
      const mockSession = {
        id: MOCK_SESSION_ID,
        join_code: MOCK_JOIN_CODE,
        host_id: 'host-uuid',
        status: 'lobby',
        max_players: 12,
        realtime_channel_name: 'game_session:ABC123',
      };

      const mockExistingPlayer = {
        session_id: MOCK_SESSION_ID,
        player_id: MOCK_PLAYER_ID, // Connecting as this player
        player_name: MOCK_PLAYER_NAME,
        is_host: false,
      };

      const mockHostPlayer = {
        player_id: 'host-uuid',
        player_name: 'Host',
        is_host: true
      };

      // 1. Mock RPC
      mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

      // 2. Mock Channel
      const mockChannel = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn((callback) => {
          callback('SUBSCRIBED');
          return mockChannel;
        }),
      };
      mockSupabaseClient.channel.mockReturnValue(mockChannel);

      // 3. Mock table interactions
      mockSupabaseClient.from = jest.fn((table) => {
        if (table === 'session_players') {
          return {
            // Mock snapshot fetch
            select: jest.fn().mockImplementation((query) => {
              // If it's the snapshot fetch (no arguments usually in this mock setup unless chain is inspected)
              // But here we rely on the chain.
              // Let's inspect the chain structure carefully.
              // The logic is: insert -> if err -> select(single) -> then snapshot select(all)
              
              const mockChain = {
                 eq: jest.fn().mockImplementation((field, value) => {
                    // Check if this is the "fetch existing player" call (session_id AND player_id)
                    // The test setup is a bit rigid, so we need a flexible mock or just return a chain that can handle both.
                    
                    if (field === 'session_id') {
                       return {
                         eq: jest.fn().mockImplementation((field2, value2) => {
                            if (field2 === 'player_id' && value2 === MOCK_PLAYER_ID) {
                               // This is the "fetch existing player" call
                               return {
                                 single: jest.fn().mockResolvedValue({ data: mockExistingPlayer, error: null })
                               }
                            }
                         })
                       }
                    }
                    
                    // If it's just session_id, it's the snapshot fetch
                     return {
                        // The snapshot fetch usually ends with .select('*').eq(...) which returns a promise-like
                        // But here the chain is .from().select().eq()
                        // Wait, the code is:
                        // .from('session_players').select('*').eq('session_id', this.sessionId)
                        // AND
                        // .from('session_players').select('*').eq('session_id', ...).eq('player_id', ...).single()
                        
                        // We need to support both.
                     }
                 })
              };
              
              // Simplification: Return a chain that mocks both paths
              return {
                 eq: jest.fn().mockImplementation((col, val) => {
                    if (col === 'session_id') {
                        // Return object that handles next .eq or .then (snapshot)
                        const nextChain = {
                             eq: jest.fn().mockImplementation((col2, val2) => {
                                 // Path: fetch existing player
                                 return {
                                     single: jest.fn().mockResolvedValue({ data: mockExistingPlayer, error: null })
                                 }
                             })
                        };
                        // Make nextChain also behave like a promise for the snapshot fetch
                        nextChain.then = (cb) => Promise.resolve({ data: [mockHostPlayer, mockExistingPlayer], error: null }).then(cb);
                        return nextChain;
                    }
                 })
              };
            }),
            
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ 
                  data: null, 
                  error: { code: '23505', message: 'Unique violation' } 
                })
              })
            })
          };
        }
      });

      const result = await network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME);

      expect(network.connected).toBe(true);
      expect(result.player).toEqual(mockExistingPlayer);
      // Ensure we tried to insert first
      // Ensure we fetched the existing player
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
    });

    it('should throw an error when the session is not found', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });

      await expect(network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME))
        .rejects.toThrow('Session not found');
    });

    it('should throw an error when session status is not lobby', async () => {
      const mockSession = {
        id: MOCK_SESSION_ID,
        join_code: MOCK_JOIN_CODE,
        host_id: 'host-uuid',
        status: 'active',
        max_players: 12,
      };

      mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

      await expect(network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME))
        .rejects.toThrow('Session is not joinable');
    });
  });

  describe('Postgres Changes Handler', () => {
    const MOCK_PLAYER_ID = 'test-player-id';

    beforeEach(() => {
      network = new Network();
      network.initialize(mockSupabaseClient, MOCK_PLAYER_ID);
      network.sessionId = 'test-session-id';
    });

    it('should emit generic postgres_changes event on INSERT', () => {
      const newPlayer = { player_id: 'player-2', player_name: 'NewPlayer', joined_at: new Date().toISOString() };
      const emitSpy = jest.spyOn(network, 'emit');

      const payload = {
        eventType: 'INSERT',
        new: newPlayer,
        old: null,
        schema: 'public',
        table: 'session_players'
      };

      network._handlePostgresChange(payload);

      // Should emit generic postgres_changes event
      expect(emitSpy).toHaveBeenCalledWith('postgres_changes', payload);

      // Should NOT maintain players Map (no longer Network's responsibility)
      expect(network.players).toBeUndefined();
    });

    it('should emit generic postgres_changes event on DELETE', () => {
      const emitSpy = jest.spyOn(network, 'emit');

      const payload = {
        eventType: 'DELETE',
        old: { player_id: 'player-2' },
        new: null,
        schema: 'public',
        table: 'session_players'
      };

      network._handlePostgresChange(payload);

      // Should emit generic postgres_changes event
      expect(emitSpy).toHaveBeenCalledWith('postgres_changes', payload);

      // Should NOT emit domain-specific events
      expect(emitSpy).not.toHaveBeenCalledWith('player_left', expect.anything());
    });

    it('should emit generic postgres_changes event on UPDATE', () => {
      const emitSpy = jest.spyOn(network, 'emit');

      const payload = {
        eventType: 'UPDATE',
        new: { player_id: 'player-2', player_name: 'UpdatedPlayer' },
        old: { player_id: 'player-2', player_name: 'OldPlayer' },
        schema: 'public',
        table: 'session_players'
      };

      network._handlePostgresChange(payload);

      // Should emit generic postgres_changes event
      expect(emitSpy).toHaveBeenCalledWith('postgres_changes', payload);

      // Should NOT emit domain-specific events
      expect(emitSpy).not.toHaveBeenCalledWith('player_updated', expect.anything());
    });

    it('should emit generic postgres_changes for non-session_players tables', () => {
      const emitSpy = jest.spyOn(network, 'emit');

      const payload = {
        eventType: 'INSERT',
        new: { id: 'item-1', name: 'Sword' },
        old: null,
        schema: 'public',
        table: 'session_items'
      };

      network._handlePostgresChange(payload);

      // Should emit generic postgres_changes event for any table
      expect(emitSpy).toHaveBeenCalledWith('postgres_changes', payload);
    });
  });

  describe('Generic Player State Update System', () => {
    const MOCK_PLAYER_ID = 'test-player-id';

    beforeEach(() => {
      jest.clearAllMocks();
      network = new Network();
      network.initialize(mockSupabaseClient, MOCK_PLAYER_ID);
      network.connected = true;
      network.sessionId = 'test-session-id';
      network.playerId = MOCK_PLAYER_ID;
    });

    describe('broadcastPlayerStateUpdate', () => {
      describe('WhenClientBroadcastsPosition_ShouldUseGenericMethod', () => {
        it('should broadcast single player state update with position fields', () => {
          const mockChannel = {
            send: jest.fn().mockResolvedValue({ status: 'ok' }),
          };
          network.channel = mockChannel;

          const stateUpdate = {
            player_id: MOCK_PLAYER_ID,
            position_x: 100,
            position_y: 200,
            rotation: 1.57,
            velocity_x: 1.0,
            velocity_y: 0.5,
          };

          network.broadcastPlayerStateUpdate(stateUpdate);

          expect(mockChannel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'message',
            payload: {
              type: 'player_state_update',
              from: MOCK_PLAYER_ID,
              timestamp: expect.any(Number),
              data: stateUpdate,
            },
          });
        });

        it('should not send if channel is not connected', () => {
          network.connected = false;
          const mockChannel = { send: jest.fn() };
          network.channel = mockChannel;

          network.broadcastPlayerStateUpdate({ player_id: MOCK_PLAYER_ID, position_x: 100 });

          expect(mockChannel.send).not.toHaveBeenCalled();
        });
      });

      describe('WhenHostBroadcastsHealth_ShouldUseGenericMethod', () => {
        it('should broadcast single player state update with health field', () => {
          const mockChannel = {
            send: jest.fn().mockResolvedValue({ status: 'ok' }),
          };
          network.channel = mockChannel;
          network.isHost = true;

          const stateUpdate = {
            player_id: 'player-123',
            health: 75,
          };

          network.broadcastPlayerStateUpdate(stateUpdate);

          expect(mockChannel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'message',
            payload: {
              type: 'player_state_update',
              from: MOCK_PLAYER_ID,
              timestamp: expect.any(Number),
              data: stateUpdate,
            },
          });
        });
      });

      describe('WhenHostBroadcastsMultiplePlayers_ShouldBatchUpdates', () => {
        it('should broadcast batched player state updates', () => {
          const mockChannel = {
            send: jest.fn().mockResolvedValue({ status: 'ok' }),
          };
          network.channel = mockChannel;
          network.isHost = true;

          const batchUpdates = [
            { player_id: 'player-1', health: 80, position_x: 100, position_y: 200 },
            { player_id: 'player-2', health: 60, position_x: 300, position_y: 400 },
            { player_id: 'player-3', health: 90, position_x: 500, position_y: 600 },
          ];

          network.broadcastPlayerStateUpdate(batchUpdates);

          expect(mockChannel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'message',
            payload: {
              type: 'player_state_update',
              from: MOCK_PLAYER_ID,
              timestamp: expect.any(Number),
              data: batchUpdates,
            },
          });
        });
      });
    });

    describe('writePlayerStateToDB', () => {
      describe('WhenClientPersistsPosition_ShouldUseGenericMethod', () => {
        it('should write client-authoritative fields to database', async () => {
          const mockUpdate = jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null })
            })
          });

          mockSupabaseClient.from = jest.fn(() => ({
            update: mockUpdate
          }));

          const stateData = {
            position_x: 150,
            position_y: 250,
            rotation: 3.14,
            velocity_x: 2.0,
            velocity_y: 1.5,
          };

          await network.writePlayerStateToDB(MOCK_PLAYER_ID, stateData);

          expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
          expect(mockUpdate).toHaveBeenCalledWith(stateData);
        });
      });

      describe('WhenHostPersistsHealth_ShouldUseGenericMethod', () => {
        it('should write host-authoritative fields to database', async () => {
          network.isHost = true;

          const mockUpdate = jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null })
            })
          });

          mockSupabaseClient.from = jest.fn(() => ({
            update: mockUpdate
          }));

          const stateData = {
            health: 85,
          };

          await network.writePlayerStateToDB('player-456', stateData);

          expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
          expect(mockUpdate).toHaveBeenCalledWith(stateData);
        });
      });

      describe('WhenHostPersistsMultiplePlayers_ShouldBatchWrite', () => {
        it('should write multiple player states in a batch', async () => {
          network.isHost = true;

          const batchUpdates = [
            { player_id: 'player-1', health: 70 },
            { player_id: 'player-2', health: 85 },
            { player_id: 'player-3', health: 95 },
          ];

          // Mock multiple update operations
          const mockUpdatePromises = batchUpdates.map(() => ({ error: null }));
          let callCount = 0;

          mockSupabaseClient.from = jest.fn(() => ({
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn(() => Promise.resolve(mockUpdatePromises[callCount++]))
              })
            })
          }));

          await network.writePlayerStateToDB(batchUpdates);

          expect(mockSupabaseClient.from).toHaveBeenCalledTimes(3);
        });
      });

      it('should log error if database write fails', async () => {
        const mockError = new Error('DB write failed');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        mockSupabaseClient.from = jest.fn(() => ({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: mockError })
            })
          })
        }));

        await network.writePlayerStateToDB(MOCK_PLAYER_ID, { health: 100 });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to write player state to DB:',
          mockError.message
        );

        consoleErrorSpy.mockRestore();
      });
    });

    describe('startPeriodicPlayerStateWrite', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
        if (network.playerStateWriteInterval) {
          clearInterval(network.playerStateWriteInterval);
          network.playerStateWriteInterval = null;
        }
      });

      it('should start interval for periodic player state writes', () => {
        const stateGetter = () => ({ player_id: MOCK_PLAYER_ID, position_x: 100, position_y: 200 });

        network.startPeriodicPlayerStateWrite(stateGetter);

        expect(network.playerStateWriteInterval).toBeDefined();
      });

      it('should call writePlayerStateToDB periodically with position data', async () => {
        const writeStateSpy = jest.spyOn(network, 'writePlayerStateToDB').mockResolvedValue();

        const stateGetter = () => ({
          player_id: MOCK_PLAYER_ID,
          position_x: 100,
          position_y: 200,
          rotation: 0,
          velocity_x: 0,
          velocity_y: 0,
        });

        network.startPeriodicPlayerStateWrite(stateGetter);

        // Fast-forward time by 60 seconds
        jest.advanceTimersByTime(60000);

        await Promise.resolve(); // Allow promises to resolve

        expect(writeStateSpy).toHaveBeenCalled();

        writeStateSpy.mockRestore();
      });

      it('should call writePlayerStateToDB periodically with health data (host)', async () => {
        network.isHost = true;
        const writeStateSpy = jest.spyOn(network, 'writePlayerStateToDB').mockResolvedValue();

        const stateGetter = () => [
          { player_id: 'player-1', health: 80 },
          { player_id: 'player-2', health: 60 },
        ];

        network.startPeriodicPlayerStateWrite(stateGetter);

        // Fast-forward time by 60 seconds
        jest.advanceTimersByTime(60000);

        await Promise.resolve(); // Allow promises to resolve

        expect(writeStateSpy).toHaveBeenCalled();

        writeStateSpy.mockRestore();
      });

      it('should use custom interval when provided', () => {
        const stateGetter = () => ({ player_id: MOCK_PLAYER_ID, position_x: 100 });
        const customInterval = 30000; // 30 seconds

        network.startPeriodicPlayerStateWrite(stateGetter, customInterval);

        expect(network.playerStateWriteInterval).toBeDefined();
      });

      it('should not start multiple intervals if already running', () => {
        const stateGetter = () => ({ player_id: MOCK_PLAYER_ID, position_x: 100 });

        network.startPeriodicPlayerStateWrite(stateGetter);
        const firstInterval = network.playerStateWriteInterval;

        network.startPeriodicPlayerStateWrite(stateGetter);
        const secondInterval = network.playerStateWriteInterval;

        expect(firstInterval).toBe(secondInterval);
      });
    });

    describe('stopPeriodicPlayerStateWrite', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should stop periodic player state write interval', () => {
        const stateGetter = () => ({ player_id: MOCK_PLAYER_ID, position_x: 100 });

        network.startPeriodicPlayerStateWrite(stateGetter);
        expect(network.playerStateWriteInterval).toBeDefined();

        network.stopPeriodicPlayerStateWrite();

        expect(network.playerStateWriteInterval).toBeNull();
      });

      it('should not throw if called when no interval is running', () => {
        expect(() => network.stopPeriodicPlayerStateWrite()).not.toThrow();
      });
    });
  });

  describe('leaveGame', () => {
    const MOCK_PLAYER_ID = 'test-player-id';
    const MOCK_SESSION_ID = 'test-session-id';

    beforeEach(() => {
      jest.clearAllMocks();
      network = new Network();
      network.initialize(mockSupabaseClient, MOCK_PLAYER_ID);
      network.sessionId = MOCK_SESSION_ID;
      network.connected = true;
    });

    it('should delete player record when a non-host player leaves', async () => {
      network.isHost = false;
      const deleteMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      });
      mockSupabaseClient.from = jest.fn((table) => {
        if (table === 'session_players') {
          return { delete: deleteMock };
        }
      });

      const disconnectSpy = jest.spyOn(network, 'disconnect');

      await network.leaveGame();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
      expect(deleteMock).toHaveBeenCalled();
      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('should delete session record and broadcast session_terminated when the host leaves', async () => {
      network.isHost = true;
      const deleteMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null })
      });
      mockSupabaseClient.from = jest.fn((table) => {
        if (table === 'game_sessions') {
          return { delete: deleteMock };
        }
      });

      const disconnectSpy = jest.spyOn(network, 'disconnect');
      const sendSpy = jest.spyOn(network, 'send').mockImplementation();

      await network.leaveGame();

      expect(sendSpy).toHaveBeenCalledWith('session_terminated', expect.objectContaining({
        reason: 'host_left'
      }));
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('game_sessions');
      expect(deleteMock).toHaveBeenCalled();
      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('should always call disconnect even if database delete fails', async () => {
      network.isHost = false;
      mockSupabaseClient.from = jest.fn(() => ({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: new Error('DB error') })
          })
        })
      }));

      const disconnectSpy = jest.spyOn(network, 'disconnect');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await network.leaveGame();

      expect(disconnectSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });
});