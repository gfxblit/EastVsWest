/**
 * End-to-End Test for Spectator Mode Camera Switching
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

describe('Spectator Mode E2E', () => {
  let browser;
  let page;
  let baseUrl;

  beforeAll(async () => {
    baseUrl = await startViteServer();
    browser = await puppeteer.launch(getPuppeteerConfig());
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    await stopViteServer();
  });

  test('WhenPlayerDies_ShouldSwitchCameraToKiller', async () => {
    await page.goto(baseUrl);
    await page.waitForSelector('body.loaded');

    // Mock network and playersSnapshot
    await page.evaluate(() => {
      // Mock players: Local and Killer
      window.mockState = {
        players: new Map([
          ['local-player', { 
            player_id: 'local-player', 
            player_name: 'LocalPlayer',
            health: 100,
            position_x: 100,
            position_y: 100
          }],
          ['killer-player', { 
            player_id: 'killer-player', 
            player_name: 'KillerPlayer',
            health: 100,
            position_x: 800, // Far away
            position_y: 800
          }]
        ])
      };

      const listeners = {};

      const mockNetwork = {
        playerId: 'local-player',
        isHost: true,
        on: (event, callback) => {
          listeners[event] = callback;
        },
        hostGame: async () => ({ session: { id: 's1', join_code: 'ABCDEF' }, player: { id: 'local-player' } }),
        broadcastPlayerStateUpdate: () => {},
        startPeriodicPlayerStateWrite: () => {},
        send: () => {},
        disconnect: () => {}
      };

      const mockSnapshot = {
        ready: async () => {},
        getPlayers: () => window.mockState.players,
        getInterpolatedPlayerState: (id) => {
          const p = window.mockState.players.get(id);
          if (p) return { x: p.position_x, y: p.position_y, rotation: 0, vx: 0, vy: 0 };
          return null;
        },
        destroy: () => {}
      };

      window.app.network = mockNetwork;
      window.app.playersSnapshot = mockSnapshot;
      window.mockListeners = listeners;

      // Mock hostGame to immediately start the game
      window.app.hostGame = async function() {
        this.ui.showJoinCode('ABCDEF');
        this.ui.showLobby('Game Lobby');
        this.updateLobbyUI();
        this.startGame();
      };
    });
    
    // Start game
    await page.click('#host-game-btn');
    await page.waitForSelector('#game-screen.active');
    
    // Wait for game to initialize and register listeners
    await page.waitForFunction(() => window.game && window.mockListeners && window.mockListeners['player_death']);

    // Simulate death event
    await page.evaluate(() => {
      // 1. Set health to 0
      const localP = window.mockState.players.get('local-player');
      if (localP) localP.health = 0;
      
      if (window.game.localPlayerController) {
        const p = window.game.localPlayerController.getPlayer();
        if (p) p.health = 0;
      }

      // 2. Trigger player_death event
      if (window.mockListeners['player_death']) {
        window.mockListeners['player_death']({
          data: {
            victim_id: 'local-player',
            killer_id: 'killer-player'
          }
        });
      }
    });

    // Wait for camera to move towards killer (800, 800)
    await page.waitForFunction(() => {
        // Killer is at 800, 800. Camera should approach it.
        const dx = window.camera.x - 800;
        const dy = window.camera.y - 800;
        return Math.sqrt(dx*dx + dy*dy) < 50;
    }, { timeout: 5000 });

    const finalCamera = await page.evaluate(() => ({ x: window.camera.x, y: window.camera.y }));
    
    // Verify it is near killer
    expect(Math.abs(finalCamera.x - 800)).toBeLessThan(50);
    expect(Math.abs(finalCamera.y - 800)).toBeLessThan(50);

    // Verify UI shows spectating name
    const spectatingText = await page.$eval('#spectating-name', el => el.textContent);
    expect(spectatingText).toContain('KillerPlayer');
  });

  test('WhenClickingNextPlayer_ShouldSwitchToNextLivingPlayer', async () => {
    await page.goto(baseUrl);
    await page.waitForSelector('body.loaded');

    // Mock network and playersSnapshot with 3 players
    await page.evaluate(() => {
      // Mock players: Local, Player2, Player3
      window.mockState = {
        players: new Map([
          ['local-player', { 
            player_id: 'local-player', 
            player_name: 'LocalPlayer',
            health: 100,
            position_x: 100,
            position_y: 100
          }],
          ['player-2', { 
            player_id: 'player-2', 
            player_name: 'Player Two',
            health: 100,
            position_x: 800, 
            position_y: 800
          }],
          ['player-3', { 
            player_id: 'player-3', 
            player_name: 'Player Three',
            health: 100,
            position_x: 1500, 
            position_y: 1500
          }]
        ])
      };

      const listeners = {};

      const mockNetwork = {
        playerId: 'local-player',
        isHost: true,
        on: (event, callback) => {
          listeners[event] = callback;
        },
        hostGame: async () => ({ session: { id: 's1', join_code: 'ABCDEF' }, player: { id: 'local-player' } }),
        broadcastPlayerStateUpdate: () => {},
        startPeriodicPlayerStateWrite: () => {},
        send: () => {},
        disconnect: () => {}
      };

      const mockSnapshot = {
        ready: async () => {},
        getPlayers: () => window.mockState.players,
        getInterpolatedPlayerState: (id) => {
          const p = window.mockState.players.get(id);
          if (p) return { x: p.position_x, y: p.position_y, rotation: 0, vx: 0, vy: 0 };
          return null;
        },
        destroy: () => {}
      };

      window.app.network = mockNetwork;
      window.app.playersSnapshot = mockSnapshot;
      window.mockListeners = listeners;

      // Mock hostGame to immediately start the game
      window.app.hostGame = async function() {
        this.ui.showJoinCode('ABCDEF');
        this.ui.showLobby('Game Lobby');
        this.updateLobbyUI();
        this.startGame();
      };
    });
    
    // Start game
    await page.click('#host-game-btn');
    await page.waitForSelector('#game-screen.active');
    
    // Wait for game to initialize
    await page.waitForFunction(() => window.game && window.mockListeners && window.mockListeners['player_death']);

    // Simulate death event - Local Player killed by Player 2
    await page.evaluate(() => {
      // 1. Set health to 0
      const localP = window.mockState.players.get('local-player');
      if (localP) localP.health = 0;
      
      if (window.game.localPlayerController) {
        const p = window.game.localPlayerController.getPlayer();
        if (p) p.health = 0;
      }

      // 2. Trigger player_death event
      if (window.mockListeners['player_death']) {
        window.mockListeners['player_death']({
          data: {
            victim_id: 'local-player',
            killer_id: 'player-2'
          }
        });
      }
    });

    // Wait for spectator controls to appear
    await page.waitForSelector('#spectator-controls:not(.hidden)');
    
    // Verify currently spectating Player 2 (the killer)
    let spectatingName = await page.$eval('#spectating-name', el => el.textContent);
    expect(spectatingName).toBe('Player Two');

    // Click "Next Player"
    await page.click('#next-spectate-btn');

    // Wait for the name change to Player Three
    await page.waitForFunction(
        () => document.getElementById('spectating-name').textContent === 'Player Three',
        { timeout: 2000 }
    );

    spectatingName = await page.$eval('#spectating-name', el => el.textContent);
    expect(spectatingName).toBe('Player Three');
  });
});
