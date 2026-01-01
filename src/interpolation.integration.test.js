import { jest } from '@jest/globals';
import { SessionPlayersSnapshot } from './SessionPlayersSnapshot.js';
import { Renderer } from './renderer.js';
import { CONFIG } from './config.js';

describe('Interpolation Simulation', () => {
  let snapshot;
  let mockNetwork;
  let renderer;
  let mockCanvas;
  let mockCtx;
  let mockNow;
  let networkHandler;

  beforeEach(async () => {
    // Mock Config
    CONFIG.NETWORK.INTERPOLATION_DELAY_MS = 100;
    CONFIG.NETWORK.INTERPOLATION_BUFFER_SIZE = 3;

    // Mock Network
    mockNetwork = {
      supabase: { from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: [] }) }) }) },
      on: jest.fn(),
      off: jest.fn(),
    };

    // Mock Canvas/Context
    mockCtx = {
      clearRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      drawImage: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      closePath: jest.fn(),
      fill: jest.fn(),
      stroke: jest.fn(),
      fillRect: jest.fn(),
      arc: jest.fn(),
    };
    mockCanvas = {
      getContext: jest.fn().mockReturnValue(mockCtx),
      width: 800,
      height: 600
    };

    // Mock performance.now
    mockNow = jest.spyOn(performance, 'now');
    mockNow.mockReturnValue(0);

    // Setup Snapshot
    snapshot = new SessionPlayersSnapshot(mockNetwork, 'test-session');
    
    // Capture network handler
    await snapshot.ready(); // Triggers subscription
    const calls = mockNetwork.on.mock.calls;
    networkHandler = calls.find(call => call[0] === 'player_state_update')[1];
    
    // Setup Renderer
    renderer = new Renderer(mockCanvas);
    renderer.init();
  });
  
  afterEach(() => {
    mockNow.mockRestore();
  });

  test('ShouldSmoothlyInterpolateMovementOverTime', async () => {
    const playerId = 'player-1';
    snapshot.players.set(playerId, { 
      player_id: playerId,
      player_name: 'Test',
      position_x: 0, 
      position_y: 0,
      rotation: 0,
      velocity_x: 100,
      velocity_y: 0 
    });

    const sendUpdate = (t, x) => {
      mockNow.mockReturnValue(t);
      networkHandler({
        type: 'player_state_update',
        from: playerId,
        data: {
          position_x: x,
          position_y: 0,
          rotation: 0,
          velocity_x: 100,
          velocity_y: 0
        }
      });
    };

    const checkRender = (time, expectedX) => {
      mockNow.mockReturnValue(time);
      const result = renderer.interpolatePosition(snapshot.getPlayers().get(playerId), time);
      expect(result.x).toBeCloseTo(expectedX, 1);
    };

    // Start simulation
    // t=1000: Update x=0
    sendUpdate(1000, 0);
    
    // t=1050: Update x=5
    sendUpdate(1050, 5);
    
    // t=1100: Update x=10
    sendUpdate(1100, 10);
    
    // At t=1100, we have history [1000, 1050, 1100].
    // Render at 1100. Target = 1000. Should be 0.
    checkRender(1100, 0);
    
    // Render at 1125. Target = 1025.
    // 1025 is between 1000 and 1050.
    // Lerp: (1025-1000)/50 = 0.5. x = 0 + 0.5*5 = 2.5
    checkRender(1125, 2.5);
    
    // t=1150: Update x=15. History becomes [1050, 1100, 1150]. (1000 removed)
    sendUpdate(1150, 15);
    
    // Render at 1150. Target = 1050. Should be 5.
    checkRender(1150, 5);
    
    // Render at 1175. Target = 1075.
    // 1075 is between 1050 and 1100.
    // Lerp: x = 5 + 0.5*5 = 7.5
    checkRender(1175, 7.5);
    
    // t=1200: Update x=20. History becomes [1100, 1150, 1200].
    sendUpdate(1200, 20);
    
    // Render at 1200. Target = 1100. Should be 10.
    checkRender(1200, 10);
  });
});