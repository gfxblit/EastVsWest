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
  };

  beforeEach(() => {
    single.mockClear();
    network = new Network();
    network.initialize(mockSupabaseClient, MOCK_HOST_ID);
  });

  describe('hostGame', () => {
    it('should create a new game session in Supabase and return the join code', async () => {
      const mockJoinCode = 'ABCDEF';
      const mockSession = {
        id: 'mock-session-id',
        join_code: mockJoinCode,
        host_id: MOCK_HOST_ID,
      };

      single.mockResolvedValueOnce({ data: mockSession, error: null });

      const joinCode = await network.hostGame();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('game_sessions');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
        host_id: MOCK_HOST_ID,
        join_code: expect.any(String),
      })]));
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(single).toHaveBeenCalled();
      
      expect(joinCode).toBe(mockJoinCode);
      expect(network.isHost).toBe(true);
      expect(network.joinCode).toBe(mockJoinCode);
    });

    it('should throw an error if the game session could not be created', async () => {
      const mockError = new Error('Failed to create session');
      single.mockResolvedValueOnce({ data: null, error: mockError });

      // Suppress console.error for this test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(network.hostGame()).rejects.toThrow(mockError);

      expect(single).toHaveBeenCalled();
      expect(network.isHost).toBe(false);
      expect(network.joinCode).toBe(null);

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});