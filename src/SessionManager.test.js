import { jest } from '@jest/globals';
import { SessionManager } from './SessionManager.js';
import { CONFIG } from './config.js';

describe('SessionManager', () => {
    let sessionManager;
    let mockSupabase;
    let mockNetwork;
    const TEST_PLAYER_ID = 'test-player-id';
    const TEST_SESSION_ID = 'test-session-id';

    beforeEach(() => {
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            rpc: jest.fn(),
        };

        mockNetwork = {
            playerId: TEST_PLAYER_ID,
            sessionId: TEST_SESSION_ID,
            isHost: true,
            send: jest.fn(),
            _subscribeToChannel: jest.fn().mockResolvedValue(),
        };

        sessionManager = new SessionManager(mockSupabase, mockNetwork);
    });

    describe('startGame', () => {
        it('should add bots if below minimum and broadcast game_start with player states', async () => {
            const updateSpy = jest.fn().mockReturnThis();
            const eqSpy = jest.fn().mockResolvedValue({ error: null });
            
            const mockPlayers = [
                { id: 1, player_id: TEST_PLAYER_ID, player_name: 'Host' }
            ];

            // Mock fetching players AFTER bot insertion to include them in the broadcast
            const mockPlayersWithBots = [
                ...mockPlayers,
                { player_id: 'bot-1', player_name: 'Bot-1', health: 100, is_bot: true }
            ];

            // Update the mock to return bots on second call or if we can distinguish
            let callCount = 0;
            mockSupabase.from.mockImplementation((table) => {
                if (table === 'session_players') {
                    return {
                        select: jest.fn().mockReturnThis(),
                        eq: jest.fn().mockImplementation(() => {
                            callCount++;
                            if (callCount === 1) {
                                return Promise.resolve({ data: mockPlayers, error: null });
                            } else {
                                return Promise.resolve({ data: mockPlayersWithBots, error: null });
                            }
                        }),
                        insert: jest.fn().mockResolvedValue({ error: null }),
                        update: updateSpy,
                    };
                }
                if (table === 'game_sessions') {
                    return {
                        update: updateSpy,
                        eq: eqSpy,
                    };
                }
                return mockSupabase;
            });

            await sessionManager.startGame();

            // Verify bots were inserted
            expect(mockSupabase.from).toHaveBeenCalledWith('session_players');
            
            // Verify session status updated
            expect(mockSupabase.from).toHaveBeenCalledWith('game_sessions');
            expect(updateSpy).toHaveBeenCalledWith({ status: 'active' });

            // Verify player states were reset
            expect(mockSupabase.from).toHaveBeenCalledWith('session_players');
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                health: 100,
                is_alive: true
            }));

            // Verify game_start broadcast includes player states
            expect(mockNetwork.send).toHaveBeenCalledWith('game_start', expect.objectContaining({
                timestamp: expect.any(Number),
                players: mockPlayersWithBots
            }));
        });
    });
});
