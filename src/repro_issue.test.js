import { jest } from '@jest/globals';
import { Network } from './network';

describe('Issue Reproduction: Host Lobby Update', () => {
  let network;
  const MOCK_HOST_ID = 'host-id';
  const MOCK_JOIN_CODE = 'HOST12';

  const mockChannel = {
    send: jest.fn().mockResolvedValue('ok'),
  };

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    insert: jest.fn().mockReturnThis(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    network = new Network();
    network.initialize(mockSupabaseClient, MOCK_HOST_ID);
    network.isHost = true;
    network.joinCode = MOCK_JOIN_CODE;
    network.channel = mockChannel;
    network.connected = true;
  });

  it('SHOULD emit player_joined locally when host handles a join request', async () => {
    const playerJoinedListener = jest.fn();
    network.on('player_joined', playerJoinedListener);

    const mockSession = { id: 'session-id', join_code: MOCK_JOIN_CODE };
    const mockNewPlayer = { player_id: 'joining-player-id', player_name: 'NewPlayer' };
    const mockAllPlayers = [
      { player_id: MOCK_HOST_ID, player_name: 'Host' },
      { player_id: 'joining-player-id', player_name: 'NewPlayer' }
    ];

    // Mock DB calls in _handlePlayerJoinRequest
    mockSupabaseClient.single
      .mockResolvedValueOnce({ data: mockSession, error: null }) // Get session
      .mockResolvedValueOnce({ data: mockNewPlayer, error: null }); // Add player

    mockSupabaseClient.from.mockImplementation((table) => {
        return {
            select: () => ({
                eq: () => ({
                    single: () => Promise.resolve({ data: table === 'game_sessions' ? mockSession : mockNewPlayer, error: null }),
                    then: (cb) => Promise.resolve({ data: mockAllPlayers, error: null }).then(cb)
                }),
                then: (cb) => Promise.resolve({ data: mockAllPlayers, error: null }).then(cb)
            }),
            insert: () => ({
                select: () => ({
                    single: () => Promise.resolve({ data: mockNewPlayer, error: null })
                })
            })
        };
    });

    const payload = {
      type: 'player_join_request',
      from: 'joining-player-id',
      data: { playerName: 'NewPlayer' }
    };

    await network._handlePlayerJoinRequest(payload);

    // Verify broadcast was sent
    expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        type: 'player_joined'
      })
    }));

    // Verify local event was emitted
    expect(playerJoinedListener).toHaveBeenCalled();
  });
});
