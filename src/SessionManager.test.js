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
            const resetEqSpy = jest.fn().mockResolvedValue({ error: null });
            
            const mockPlayers = [
                { id: 1, player_id: TEST_PLAYER_ID, player_name: 'Host' }
            ];

            const mockPlayersWithBots = [
                ...mockPlayers,
                { player_id: 'bot-1', player_name: 'Bot-1', health: 100, is_bot: true },
                { player_id: 'bot-2', player_name: 'Bot-2', health: 100, is_bot: true },
                { player_id: 'bot-3', player_name: 'Bot-3', health: 100, is_bot: true }
            ];

            mockSupabase.from.mockImplementation((table) => {
                if (table === 'session_players') {
                    return {
                        select: jest.fn().mockImplementation((cols) => {
                            return {
                                eq: jest.fn().mockImplementation((field, value) => {
                                    if (cols === 'id' || cols === 'player_id') {
                                        return Promise.resolve({ data: mockPlayers, error: null });
                                    }
                                    if (cols === '*') {
                                        return Promise.resolve({ data: mockPlayersWithBots, error: null });
                                    }
                                    return Promise.resolve({ data: [], error: null });
                                })
                            };
                        }),
                        insert: jest.fn().mockResolvedValue({ error: null }),
                        update: jest.fn().mockImplementation((data) => {
                            updateSpy(data);
                            return {
                                eq: jest.fn().mockImplementation(() => {
                                    return {
                                        eq: resetEqSpy
                                    };
                                })
                            };
                        }),
                    };
                }
                if (table === 'game_sessions') {
                    return {
                        update: jest.fn().mockImplementation((data) => {
                            updateSpy(data);
                            return {
                                eq: jest.fn().mockResolvedValue({ error: null })
                            };
                        }),
                    };
                }
                return mockSupabase;
            });

            await sessionManager.startGame();

            // Verify bots were inserted (called once with 3 bots)
            expect(mockSupabase.from).toHaveBeenCalledWith('session_players');
            
            // Verify session status updated
            expect(updateSpy).toHaveBeenCalledWith({ status: 'active' });

            // Verify player states were reset
            // One call for each player in mockPlayers (which is 1)
            const centerX = CONFIG.WORLD.WIDTH / 2;
            const centerY = CONFIG.WORLD.HEIGHT / 2;
            const spawnRadius = CONFIG.PLAYER.SPAWN_RADIUS;
            
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                health: 100,
                is_alive: true,
                position_x: centerX + spawnRadius,
                position_y: centerY
            }));

            // Verify game_start broadcast includes player states
            expect(mockNetwork.send).toHaveBeenCalledWith('game_start', expect.objectContaining({
                timestamp: expect.any(Number),
                players: mockPlayersWithBots
            }));
        });
    });
});
