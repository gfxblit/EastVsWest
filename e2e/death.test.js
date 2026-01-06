/**
 * End-to-End Test for Player Death Flow
 */

import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

describe('Player Death Flow E2E', () => {
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

  test('WhenPlayerHealthReachesZero_ShouldShowSpectatorUIAndAllowLeaving', async () => {
    await page.goto(baseUrl);

    // Mock network and playersSnapshot to bypass real Supabase
    await page.evaluate(() => {
      // Create a mutable state for the mock
      window.mockState = {
        players: new Map([['test-player', { 
          player_id: 'test-player', 
          player_name: 'TestPlayer',
          health: 100,
          position_x: 500,
          position_y: 500
        }]])
      };

      // Create a more robust mock for network
      const mockNetwork = {
        playerId: 'test-player',
        isHost: true,
        on: () => {},
        hostGame: async () => ({ session: { id: 's1', join_code: 'ABCDEF' }, player: { id: 'p1' } }),
        broadcastPlayerStateUpdate: () => {},
        startPeriodicPlayerStateWrite: () => {},
        send: () => {},
        disconnect: () => {}
      };

      const mockSnapshot = {
        ready: async () => {},
        getPlayers: () => window.mockState.players,
        getInterpolatedPlayerState: (id) => ({
          x: 500,
          y: 500,
          rotation: 0,
          vx: 0,
          vy: 0
        }),
        destroy: () => {}
      };

      window.app.network = mockNetwork;
      window.app.playersSnapshot = mockSnapshot;

      // Mock hostGame to immediately start the game
      window.app.hostGame = async function() {
        this.ui.showJoinCode('ABCDEF');
        this.ui.showLobby('Game Lobby');
        this.updateLobbyUI();
        // Trigger start game immediately
        this.startGame();
      };
    });
    
    // 1. Start a game by clicking Host Game (it will use our mocked hostGame)
    await page.click('#host-game-btn');
    
    // Wait for game screen
    await page.waitForSelector('#game-screen.active');
    
    // Verify spectator controls are hidden initially
    const isSpectatorHidden = await page.$eval('#spectator-controls', el => el.classList.contains('hidden'));
    expect(isSpectatorHidden).toBe(true);

    // 2. Simulate death by setting health to 0 in both the player and the mock state
    await page.evaluate(() => {
      const playerData = window.mockState.players.get('test-player');
      if (playerData) {
        playerData.health = 0;
      }
      
      if (window.game && window.game.localPlayerController) {
        const player = window.game.localPlayerController.getPlayer();
        if (player) {
          player.health = 0;
        }
      }
    });

    // 3. Verify spectator controls are now visible
    // We might need to wait a frame for the game loop to update the UI
    await page.waitForFunction(() => {
      const controls = document.getElementById('spectator-controls');
      return controls && !controls.classList.contains('hidden');
    }, { timeout: 10000 });

    const spectatingName = await page.$eval('#spectating-name', el => el.textContent);
    expect(spectatingName).toBeTruthy();

    // 4. Click "Leave Match" button
    await page.click('#leave-spectate-btn');

    // 5. Verify we are back at the intro screen
    await page.waitForSelector('#intro-screen.active');
    
    const introActive = await page.$eval('#intro-screen', el => el.classList.contains('active'));
    expect(introActive).toBe(true);
  });
});
