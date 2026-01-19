
import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { HostBotManager } from './HostBotManager.js';

describe('HostBotManager', () => {
  let hostBotManager;
  let mockNetwork;
  let mockSnapshot;
  let mockGame;
  let eventHandlers = {};

  beforeEach(() => {
    eventHandlers = {};
    mockNetwork = {
      on: jest.fn().mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
      }),
      broadcastPlayerStateUpdate: jest.fn(),
    };

    const players = new Map();
    mockSnapshot = {
      getPlayers: () => players,
    };
    
    mockGame = { state: { isRunning: true } };

    hostBotManager = new HostBotManager(mockNetwork, mockSnapshot, mockGame);
  });

  test('should listen for postgres_changes', () => {
    expect(mockNetwork.on).toHaveBeenCalledWith('postgres_changes', expect.any(Function));
  });

  test('should create BotController when bot is inserted', () => {
    const botId = 'bot-uuid';
    
    // Simulate DB insert event
    eventHandlers['postgres_changes']({
      table: 'session_players',
      eventType: 'INSERT',
      new: { player_id: botId, is_bot: true },
    });

    expect(hostBotManager.botControllers.has(botId)).toBe(true);
  });

  test('should initialize existing bots', () => {
    const botId = 'existing-bot';
    mockSnapshot.getPlayers().set(botId, { player_id: botId, is_bot: true });

    hostBotManager.initExistingBots();

    expect(hostBotManager.botControllers.has(botId)).toBe(true);
  });

  test('should remove BotController if player no longer in snapshot during update', () => {
    const botId = 'temp-bot';
    hostBotManager.addBot(botId);
    
    expect(hostBotManager.botControllers.has(botId)).toBe(true);

    // Snapshot is empty (doesn't have botId)
    hostBotManager.update(0.1);

    expect(hostBotManager.botControllers.has(botId)).toBe(false);
  });
});
