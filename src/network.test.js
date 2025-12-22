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
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockPlayerRecord, error: null })
              })
            })
          };
        }
      });

      const result = await network.hostGame('TestHost');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('game_sessions');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('session_players');
      expect(result.session.join_code).toBe(mockJoinCode);
      expect(result.player.id).toBe(mockPlayerRecord.id);
      expect(network.isHost).toBe(true);
      expect(network.joinCode).toBe(mockJoinCode);
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

      // Suppress console.error for this test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(network.hostGame('TestHost')).rejects.toThrow(mockError);

      expect(network.isHost).toBe(false);
      expect(network.joinCode).toBe(null);

      // Restore console.error
      consoleErrorSpy.mockRestore();
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

    describe('WhenJoinCodeIsValid_ShouldJoinSession', () => {
      it('should query the game_sessions table with the join code', async () => {
        const mockSession = {
          id: MOCK_SESSION_ID,
          join_code: MOCK_JOIN_CODE,
          host_id: 'host-uuid',
          status: 'lobby',
          max_players: 12,
          current_player_count: 1,
          realtime_channel_name: 'game_session:ABC123',
        };

        // Mock the rpc call for get_session_by_join_code
        mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

        // Mock the channel
        const mockChannel = {
          on: jest.fn().mockReturnThis(),
          subscribe: jest.fn((callback) => {
            callback('SUBSCRIBED');
            return mockChannel;
          }),
          send: jest.fn().mockResolvedValue('ok'),
        };
        mockSupabaseClient.channel.mockReturnValue(mockChannel);

        const joinPromise = network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME);

        // Simulate the player_joined event asynchronously
        const payload = {
          data: {
            player: { player_id: MOCK_PLAYER_ID },
            session: mockSession,
            allPlayers: [{ player_id: MOCK_PLAYER_ID }],
          }
        };
        setTimeout(() => network.emit('player_joined', payload), 0);

        const result = await joinPromise;

        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_session_by_join_code', { p_join_code: MOCK_JOIN_CODE });
        expect(result).toEqual(payload.data);
      });

      it('should add the player to the session_players table', async () => {
        const mockSession = {
          id: MOCK_SESSION_ID,
          join_code: MOCK_JOIN_CODE,
          host_id: 'host-uuid',
          status: 'lobby',
          max_players: 12,
          current_player_count: 1,
          realtime_channel_name: 'game_session:ABC123',
        };

        // Mock the rpc call
        mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

        // Mock the channel
        const mockChannel = {
          on: jest.fn().mockReturnThis(),
          subscribe: jest.fn((callback) => {
            callback('SUBSCRIBED');
            return mockChannel;
          }),
          send: jest.fn().mockResolvedValue('ok'),
        };
        mockSupabaseClient.channel.mockReturnValue(mockChannel);

        const joinPromise = network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME);

        // Simulate the player_joined event asynchronously
        const payload = {
          data: {
            player: {
              player_id: MOCK_PLAYER_ID,
              player_name: MOCK_PLAYER_NAME,
              is_host: false,
            },
            session: mockSession,
            allPlayers: [{ player_id: MOCK_PLAYER_ID }],
          }
        };
        setTimeout(() => network.emit('player_joined', payload), 0);

        await joinPromise;

        // Verify the join request was sent
        expect(mockChannel.send).toHaveBeenCalledWith({
          type: 'broadcast',
          event: 'message',
          payload: expect.objectContaining({
            type: 'player_join_request',
            from: MOCK_PLAYER_ID,
            data: { playerName: MOCK_PLAYER_NAME },
          }),
        });
      });

      it('should set network state correctly after joining', async () => {
        const mockSession = {
          id: MOCK_SESSION_ID,
          join_code: MOCK_JOIN_CODE,
          host_id: 'host-uuid',
          status: 'lobby',
          max_players: 12,
          current_player_count: 1,
          realtime_channel_name: 'game_session:ABC123',
        };

        // Mock the rpc call
        mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

        // Mock the channel
        const mockChannel = {
          on: jest.fn().mockReturnThis(),
          subscribe: jest.fn((callback) => {
            callback('SUBSCRIBED');
            return mockChannel;
          }),
          send: jest.fn().mockResolvedValue('ok'),
        };
        mockSupabaseClient.channel.mockReturnValue(mockChannel);

        const joinPromise = network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME);

        // Simulate the player_joined event asynchronously
        const payload = {
          data: {
            player: { player_id: MOCK_PLAYER_ID },
            session: mockSession,
            allPlayers: [{ player_id: MOCK_PLAYER_ID }],
          }
        };
        setTimeout(() => network.emit('player_joined', payload), 0);

        await joinPromise;

        expect(network.isHost).toBe(false);
        expect(network.joinCode).toBe(MOCK_JOIN_CODE);
        expect(network.connected).toBe(true);
      });
    });

    describe('WhenSessionDoesNotExist_ShouldThrowError', () => {
      it('should throw an error when the session is not found', async () => {
        // Mock rpc to return empty array (session not found)
        mockSupabaseClient.rpc.mockResolvedValue({ data: [], error: null });

        await expect(network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME))
          .rejects.toThrow('Session not found');
      });

      it('should throw an error when database returns an error', async () => {
        const dbError = new Error('Database connection failed');

        // Mock rpc to return error
        mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: dbError });

        await expect(network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME))
          .rejects.toThrow(dbError);
      });
    });

    describe('WhenSessionIsNotJoinable_ShouldThrowError', () => {
      it('should throw an error when session status is "active"', async () => {
        const mockSession = {
          id: MOCK_SESSION_ID,
          join_code: MOCK_JOIN_CODE,
          host_id: 'host-uuid',
          status: 'active',
          max_players: 12,
          current_player_count: 1,
        };

        // Mock rpc to return active session
        mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

        await expect(network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME))
          .rejects.toThrow('Session is not joinable');
      });

      it('should throw an error when session status is "ended"', async () => {
        const mockSession = {
          id: MOCK_SESSION_ID,
          join_code: MOCK_JOIN_CODE,
          host_id: 'host-uuid',
          status: 'ended',
          max_players: 12,
          current_player_count: 1,
        };

        // Mock rpc to return ended session
        mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

        await expect(network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME))
          .rejects.toThrow('Session is not joinable');
      });

      it('should throw an error when session is full', async () => {
        const mockSession = {
          id: MOCK_SESSION_ID,
          join_code: MOCK_JOIN_CODE,
          host_id: 'host-uuid',
          status: 'lobby',
          max_players: 12,
          current_player_count: 12,
        };

        // Mock rpc to return full session
        mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

        await expect(network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME))
          .rejects.toThrow('Session is full');
      });
    });

    describe('WhenSupabaseNotInitialized_ShouldThrowError', () => {
      it('should throw an error if supabase client is not initialized', async () => {
        const uninitializedNetwork = new Network();

        await expect(uninitializedNetwork.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME))
          .rejects.toThrow('Supabase client not initialized');
      });
    });

    describe('WhenPlayerIdNotSet_ShouldThrowError', () => {
      it('should throw an error if player ID is not set', async () => {
        const networkWithoutPlayerId = new Network();
        networkWithoutPlayerId.initialize(mockSupabaseClient, null);

        await expect(networkWithoutPlayerId.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME))
          .rejects.toThrow('Player ID not set');
      });
    });

    describe('Join Game Event Listener', () => {
      let onSpy, offSpy;

      beforeEach(() => {
        onSpy = jest.spyOn(network, 'on');
        offSpy = jest.spyOn(network, 'off');

        // Mock the session lookup to avoid actual DB calls
        const mockSession = {
            id: MOCK_SESSION_ID,
            join_code: MOCK_JOIN_CODE,
            host_id: 'host-uuid',
            status: 'lobby',
            max_players: 12,
            current_player_count: 1,
            realtime_channel_name: 'game_session:ABC123',
          };

        mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

        // Mock the channel
        const mockChannel = {
          on: jest.fn().mockReturnThis(),
          subscribe: jest.fn((callback) => {
            callback('SUBSCRIBED');
            return mockChannel;
          }),
          send: jest.fn().mockResolvedValue('ok'),
        };
        mockSupabaseClient.channel.mockReturnValue(mockChannel);
      });

      afterEach(() => {
        onSpy.mockRestore();
        offSpy.mockRestore();
      });

      it('should clean up player_joined listener on successful join', async () => {
        const joinPromise = network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME);

        // Simulate the player_joined event asynchronously
        const payload = { data: { player: { player_id: MOCK_PLAYER_ID } } };
        setTimeout(() => network.emit('player_joined', payload), 0);

        await joinPromise;

        expect(onSpy).toHaveBeenCalledWith('player_joined', expect.any(Function));
        expect(offSpy).toHaveBeenCalledWith('player_joined', expect.any(Function));
      });

      it('should clean up player_joined listener on timeout', async () => {
        jest.useFakeTimers();

        const joinPromise = network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME);

        // Catch any unhandled rejections
        joinPromise.catch(() => {});

        // Run all timers to trigger the timeout
        await jest.runAllTimersAsync();

        // The promise should be rejected now
        await expect(joinPromise).rejects.toThrow('Join request timed out.');

        expect(onSpy).toHaveBeenCalledWith('player_joined', expect.any(Function));
        expect(offSpy).toHaveBeenCalledWith('player_joined', expect.any(Function));

        jest.useRealTimers();
      });
    });

    describe('WhenPlayerInsertFails_ShouldThrowError', () => {
      it('should timeout if host does not respond to join request', async () => {
        jest.useFakeTimers();

        const mockSession = {
          id: MOCK_SESSION_ID,
          join_code: MOCK_JOIN_CODE,
          host_id: 'host-uuid',
          status: 'lobby',
          max_players: 12,
          current_player_count: 1,
          realtime_channel_name: 'game_session:ABC123',
        };

        // Mock the rpc call
        mockSupabaseClient.rpc.mockResolvedValue({ data: [mockSession], error: null });

        // Mock the channel
        const mockChannel = {
          on: jest.fn().mockReturnThis(),
          subscribe: jest.fn((callback) => {
            callback('SUBSCRIBED');
            return mockChannel;
          }),
          send: jest.fn().mockResolvedValue('ok'),
        };
        mockSupabaseClient.channel.mockReturnValue(mockChannel);

        const joinPromise = network.joinGame(MOCK_JOIN_CODE, MOCK_PLAYER_NAME);

        // Catch any unhandled rejections
        joinPromise.catch(() => {});

        // Run all timers to trigger the timeout
        await jest.runAllTimersAsync();

        // The promise should be rejected now
        await expect(joinPromise).rejects.toThrow('Join request timed out.');

        jest.useRealTimers();
      });
    });
  });

  describe('Position Updates (Client-Authoritative Movement)', () => {
    const MOCK_PLAYER_ID = 'test-player-id';
    const MOCK_CHANNEL_NAME = 'game_session:TEST123';

    beforeEach(() => {
      jest.clearAllMocks();
      network = new Network();
      network.initialize(mockSupabaseClient, MOCK_PLAYER_ID);
      network.connected = true;
      network.playerId = MOCK_PLAYER_ID;
    });

    describe('sendPositionUpdate', () => {
      describe('WhenClientSendsPositionUpdate_ShouldSendCorrectMessage', () => {
        it('should send position_update message with correct format', () => {
          const mockChannel = {
            send: jest.fn().mockResolvedValue({ status: 'ok' }),
          };
          network.channel = mockChannel;

          const positionData = {
            position: { x: 100, y: 200 },
            rotation: 1.57,
            velocity: { x: 1.0, y: 0.5 },
          };

          network.sendPositionUpdate(positionData);

          expect(mockChannel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'message',
            payload: {
              type: 'position_update',
              from: MOCK_PLAYER_ID,
              timestamp: expect.any(Number),
              data: positionData,
            },
          });
        });

        it('should not send if channel is not connected', () => {
          network.connected = false;
          const mockChannel = {
            send: jest.fn(),
          };
          network.channel = mockChannel;

          const positionData = {
            position: { x: 100, y: 200 },
            rotation: 1.57,
            velocity: { x: 1.0, y: 0.5 },
          };

          network.sendPositionUpdate(positionData);

          expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should not send if channel is null', () => {
          network.channel = null;
          const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

          const positionData = {
            position: { x: 100, y: 200 },
            rotation: 1.57,
            velocity: { x: 1.0, y: 0.5 },
          };

          network.sendPositionUpdate(positionData);

          expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Cannot send message, channel not connected.'
          );

          consoleWarnSpy.mockRestore();
        });
      });
    });

    describe('Host Position Broadcast', () => {
      describe('WhenHostReceivesPositionUpdates_ShouldBatchAndBroadcast', () => {
        it('should collect position updates from multiple clients', () => {
          network.isHost = true;
          const mockChannel = {
            send: jest.fn().mockResolvedValue({ status: 'ok' }),
          };
          network.channel = mockChannel;

          const update1 = {
            type: 'position_update',
            from: 'player-1',
            timestamp: Date.now(),
            data: {
              position: { x: 100, y: 200 },
              rotation: 0,
              velocity: { x: 1, y: 0 },
            },
          };

          const update2 = {
            type: 'position_update',
            from: 'player-2',
            timestamp: Date.now(),
            data: {
              position: { x: 300, y: 400 },
              rotation: 1.57,
              velocity: { x: 0, y: 1 },
            },
          };

          network._handleRealtimeMessage(update1);
          network._handleRealtimeMessage(update2);

          // Manually call the batch broadcast method
          network.broadcastPositionUpdates();

          expect(mockChannel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'message',
            payload: {
              type: 'position_broadcast',
              from: MOCK_PLAYER_ID,
              timestamp: expect.any(Number),
              data: {
                updates: [
                  {
                    player_id: 'player-1',
                    position: { x: 100, y: 200 },
                    rotation: 0,
                    velocity: { x: 1, y: 0 },
                  },
                  {
                    player_id: 'player-2',
                    position: { x: 300, y: 400 },
                    rotation: 1.57,
                    velocity: { x: 0, y: 1 },
                  },
                ],
              },
            },
          });
        });

        it('should include host own position when host calls sendPositionUpdate on itself', () => {
          network.isHost = true;
          const mockChannel = {
            send: jest.fn().mockResolvedValue({ status: 'ok' }),
          };
          network.channel = mockChannel;

          // Host sends its own position update
          // This should immediately add to buffer since Supabase doesn't echo back
          const hostPositionData = {
            position: { x: 50, y: 100 },
            rotation: 0.5,
            velocity: { x: 0.5, y: 0.5 },
          };
          network.sendPositionUpdate(hostPositionData);

          // Receive position update from another client
          const clientUpdate = {
            type: 'position_update',
            from: 'player-1',
            timestamp: Date.now(),
            data: {
              position: { x: 100, y: 200 },
              rotation: 0,
              velocity: { x: 1, y: 0 },
            },
          };
          network._handleRealtimeMessage(clientUpdate);

          // Clear previous send calls
          mockChannel.send.mockClear();

          // Host broadcasts all position updates
          network.broadcastPositionUpdates();

          // Verify broadcast includes BOTH host and client positions
          expect(mockChannel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'message',
            payload: {
              type: 'position_broadcast',
              from: MOCK_PLAYER_ID,
              timestamp: expect.any(Number),
              data: {
                updates: expect.arrayContaining([
                  {
                    player_id: MOCK_PLAYER_ID,
                    position: { x: 50, y: 100 },
                    rotation: 0.5,
                    velocity: { x: 0.5, y: 0.5 },
                  },
                  {
                    player_id: 'player-1',
                    position: { x: 100, y: 200 },
                    rotation: 0,
                    velocity: { x: 1, y: 0 },
                  },
                ]),
              },
            },
          });
        });

        it('should clear position buffer after broadcasting', () => {
          network.isHost = true;
          const mockChannel = {
            send: jest.fn().mockResolvedValue({ status: 'ok' }),
          };
          network.channel = mockChannel;

          const update1 = {
            type: 'position_update',
            from: 'player-1',
            timestamp: Date.now(),
            data: {
              position: { x: 100, y: 200 },
              rotation: 0,
              velocity: { x: 1, y: 0 },
            },
          };

          network._handleRealtimeMessage(update1);
          network.broadcastPositionUpdates();

          // Clear the mock to verify the second call
          mockChannel.send.mockClear();

          // Call again - should not broadcast anything
          network.broadcastPositionUpdates();

          expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should not broadcast if no position updates are pending', () => {
          network.isHost = true;
          const mockChannel = {
            send: jest.fn().mockResolvedValue({ status: 'ok' }),
          };
          network.channel = mockChannel;

          network.broadcastPositionUpdates();

          expect(mockChannel.send).not.toHaveBeenCalled();
        });
      });
    });

    describe('Client Position Broadcast Reception', () => {
      describe('WhenClientReceivesPositionBroadcast_ShouldEmitEvent', () => {
        it('should emit position_broadcast event with all player positions', () => {
          network.isHost = false;
          const eventListener = jest.fn();
          network.on('position_broadcast', eventListener);

          const broadcastMessage = {
            type: 'position_broadcast',
            from: 'host-id',
            timestamp: Date.now(),
            data: {
              updates: [
                {
                  player_id: 'player-1',
                  position: { x: 100, y: 200 },
                  rotation: 0,
                  velocity: { x: 1, y: 0 },
                },
                {
                  player_id: 'player-2',
                  position: { x: 300, y: 400 },
                  rotation: 1.57,
                  velocity: { x: 0, y: 1 },
                },
              ],
            },
          };

          network._handleRealtimeMessage(broadcastMessage);

          expect(eventListener).toHaveBeenCalledWith(broadcastMessage);
        });
      });
    });
  });

  describe('Position Broadcasting Timer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should call broadcastPositionUpdates periodically when started by host', () => {
      network.isHost = true;
      network.broadcastPositionUpdates = jest.fn();

      network.startPositionBroadcasting();

      // Advance time by one interval
      jest.advanceTimersByTime(50);
      expect(network.broadcastPositionUpdates).toHaveBeenCalledTimes(1);

      // Advance time by another interval
      jest.advanceTimersByTime(50);
      expect(network.broadcastPositionUpdates).toHaveBeenCalledTimes(2);
    });

    it('should stop calling broadcastPositionUpdates when stopped', () => {
      network.isHost = true;
      network.broadcastPositionUpdates = jest.fn();

      network.startPositionBroadcasting();
      jest.advanceTimersByTime(50);
      expect(network.broadcastPositionUpdates).toHaveBeenCalledTimes(1);

      network.stopPositionBroadcasting();

      // Advance time again, but broadcast should not be called
      jest.advanceTimersByTime(50);
      expect(network.broadcastPositionUpdates).toHaveBeenCalledTimes(1);
    });

    it('should not start broadcasting if not the host', () => {
      network.isHost = false;
      network.startPositionBroadcasting();
      expect(network.broadcastInterval).toBeNull();
    });

    it('should not start a new interval if one is already running', () => {
      network.isHost = true;
      network.startPositionBroadcasting();
      const firstIntervalId = network.broadcastInterval;

      network.startPositionBroadcasting();
      expect(network.broadcastInterval).toBe(firstIntervalId);
    });
  });

  describe('Position Update Validation', () => {
    beforeEach(() => {
      network.isHost = true;
    });

    it('should accept a valid position update', () => {
      const payload = {
        from: 'player-1',
        data: {
          position: { x: 100, y: 100 },
          rotation: 0,
          velocity: { x: 10, y: 10 },
        },
      };
      expect(network._isValidPositionUpdate(payload)).toBe(true);
    });

    it('should reject an update with invalid data types', () => {
      const payload = {
        from: 'player-1',
        data: {
          position: { x: '100', y: 100 }, // x is a string
          rotation: 0,
          velocity: { x: 10, y: 10 },
        },
      };
      expect(network._isValidPositionUpdate(payload)).toBe(false);
    });

    it('should reject an update with out-of-bounds position', () => {
      const payload = {
        from: 'player-1',
        data: {
          position: { x: 2000, y: 100 }, // x is out of bounds
          rotation: 0,
          velocity: { x: 10, y: 10 },
        },
      };
      expect(network._isValidPositionUpdate(payload)).toBe(false);
    });

    it('should reject an update that teleports the player', () => {
      const player1Id = 'player-1';
      network.playerPositions.set(player1Id, { x: 100, y: 100 });
      const payload = {
        from: player1Id,
        data: {
          position: { x: 500, y: 500 }, // large jump
          rotation: 0,
          velocity: { x: 10, y: 10 },
        },
      };
      expect(network._isValidPositionUpdate(payload)).toBe(false);
    });

    it('should accept the first position update from a player', () => {
      const payload = {
        from: 'new-player',
        data: {
          position: { x: 100, y: 100 },
          rotation: 0,
          velocity: { x: 10, y: 10 },
        },
      };
      expect(network._isValidPositionUpdate(payload)).toBe(true);
    });

    it('should accept a subsequent valid position update', () => {
      const player1Id = 'player-1';
      network.playerPositions.set(player1Id, { x: 100, y: 100 });
      const payload = {
        from: player1Id,
        data: {
          position: { x: 105, y: 105 }, // small move
          rotation: 0,
          velocity: { x: 10, y: 10 },
        },
      };
      expect(network._isValidPositionUpdate(payload)).toBe(true);
    });
  });
});