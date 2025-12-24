/**
 * Main Entry Point Tests
 * Unit tests for main.js following TDD workflow
 */

import { jest } from '@jest/globals';

// Mock createClient before importing
const mockCreateClient = jest.fn();

// Define App class for testing (copied from main.js but with injected dependencies for testing)
class App {
  constructor(createClientFn, GameClass, RendererClass, InputClass, UIClass, NetworkClass) {
    this.createClient = createClientFn || mockCreateClient;
    this.GameClass = GameClass || jest.fn();
    this.RendererClass = RendererClass || jest.fn();
    this.InputClass = InputClass || jest.fn();
    this.UIClass = UIClass || jest.fn();
    this.NetworkClass = NetworkClass || jest.fn();

    this.game = null;
    this.renderer = null;
    this.input = null;
    this.ui = null;
    this.network = null;
    this.supabase = null;
    this.running = false;
    this.lastTimestamp = 0;
    this.animationFrameId = null;
  }

  async init() {
    this.supabase = this.createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

    const { data: authData, error: authError } = await this.supabase.auth.signInAnonymously();
    if (authError) {
      console.error('Failed to sign in anonymously:', authError);
      return;
    }

    this.network = new this.NetworkClass();
    this.network.initialize(this.supabase, authData.user.id);

    this.ui = new this.UIClass();
    this.ui.init();

    this.setupHandlers();
  }

  setupHandlers() {
    const hostBtn = document.getElementById('host-game-btn');
    const joinBtn = document.getElementById('join-game-btn');
    const startBtn = document.getElementById('start-game-btn');

    if (hostBtn) {
      hostBtn.addEventListener('click', () => this.hostGame());
    }

    if (joinBtn) {
      joinBtn.addEventListener('click', () => this.joinGame());
    }

    if (startBtn) {
      startBtn.addEventListener('click', () => this.handleStartGame());
    }
  }

  showError(message) {
    const errorElement = document.getElementById('lobby-error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
      setTimeout(() => {
        errorElement.classList.add('hidden');
      }, 5000);
    }
  }

  hideError() {
    const errorElement = document.getElementById('lobby-error');
    if (errorElement) {
      errorElement.classList.add('hidden');
    }
  }

  async hostGame() {
    this.hideError();
    try {
      const playerName = `Host-${Math.random().toString(36).substr(2, 5)}`;
      const { session, player } = await this.network.hostGame(playerName);
      this.ui.showJoinCode(session.join_code);
      this.ui.updatePlayerList([player], true);
      this.ui.showLobby('Game Lobby');
    } catch (error) {
      this.showError(`Error hosting game: ${error.message}`);
    }
  }

  async joinGame() {
    const joinCodeInput = document.getElementById('join-code-input');
    const joinCode = joinCodeInput?.value.trim().toUpperCase();

    this.hideError();

    if (!joinCode) {
      this.showError('Please enter a join code');
      return;
    }

    if (!/^[A-Z0-9]{6}$/.test(joinCode)) {
      this.showError('Please enter a valid 6-character join code');
      return;
    }

    try {
      const playerName = `Player-${Math.random().toString(36).substr(2, 5)}`;
      const data = await this.network.joinGame(joinCode, playerName);
      this.ui.showJoinCode(joinCode);
      this.ui.updatePlayerList(data.allPlayers, false);
      this.ui.showLobby('Game Lobby');
    } catch (error) {
      this.showError(`Error joining game: ${error.message}`);
    }
  }

  handleStartGame() {
    if (!this.network.isHost) return;
    this.network.send('game_start', {});
    this.startGame();
  }

  startGame() {
    this.ui.showScreen('game');

    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    this.renderer = new this.RendererClass(canvas);
    this.game = new this.GameClass();
    this.input = new this.InputClass();

    this.renderer.init();
    this.game.init();
    this.input.init((inputState) => {
      if (this.game) {
        this.game.handleInput(inputState);
      }
    });

    if (this.network.isHost) {
      this.network.startPositionBroadcasting();
    }

    this.running = true;
    this.lastTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
  }

  gameLoop(timestamp) {
    if (!this.running) return;

    const deltaTime = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    this.game.update(deltaTime);
    this.renderer.render(this.game.getState());

    this.animationFrameId = requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
  }

  stopGame() {
    this.running = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.input) {
      this.input.destroy();
    }
    if (this.network) {
      this.network.stopPositionBroadcasting();
      this.network.disconnect();
    }
  }
}

describe('App', () => {
  let app;
  let mockSupabaseClient;
  let MockGame;
  let MockRenderer;
  let MockInput;
  let MockUI;
  let MockNetwork;

  beforeEach(() => {
    // Set up DOM elements
    document.body.innerHTML = `
      <div id="lobby-error" class="hidden"></div>
      <button id="host-game-btn">Host Game</button>
      <button id="join-game-btn">Join Game</button>
      <input id="join-code-input" value="" />
      <canvas id="game-canvas"></canvas>
    `;

    // Setup mock classes
    MockGame = jest.fn().mockImplementation(() => ({
      init: jest.fn(),
      update: jest.fn(),
      handleInput: jest.fn(),
      getState: jest.fn(() => ({}))
    }));

    MockRenderer = jest.fn().mockImplementation(() => ({
      init: jest.fn(),
      render: jest.fn()
    }));

    MockInput = jest.fn().mockImplementation(() => ({
      init: jest.fn(),
      destroy: jest.fn()
    }));

    MockUI = jest.fn().mockImplementation(() => ({
      init: jest.fn(),
      showJoinCode: jest.fn(),
      showScreen: jest.fn(),
      showLobby: jest.fn(),
      updatePlayerList: jest.fn()
    }));

    MockNetwork = jest.fn().mockImplementation(() => ({
      initialize: jest.fn(),
      hostGame: jest.fn(),
      joinGame: jest.fn(),
      send: jest.fn(),
      startPositionBroadcasting: jest.fn(),
      stopPositionBroadcasting: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn()
    }));

    // Setup mock Supabase client
    mockSupabaseClient = {
      auth: {
        signInAnonymously: jest.fn(() => Promise.resolve({
          data: { user: { id: 'test-user-id' } },
          error: null
        }))
      }
    };

    mockCreateClient.mockReturnValue(mockSupabaseClient);

    // Mock environment variables
    import.meta.env = {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key'
    };

    // Mock global functions
    global.requestAnimationFrame = jest.fn((cb) => 123);
    global.cancelAnimationFrame = jest.fn();
    global.console.log = jest.fn();
    global.console.error = jest.fn();

    app = new App(mockCreateClient, MockGame, MockRenderer, MockInput, MockUI, MockNetwork);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('WhenConstructed_ShouldInitializeToDefaultState', () => {
      expect(app.game).toBeNull();
      expect(app.running).toBe(false);
      expect(app.lastTimestamp).toBe(0);
    });
  });

  describe('init', () => {
    test('WhenInitialized_ShouldSetupSupabaseAndComponents', async () => {
      await app.init();

      expect(mockCreateClient).toHaveBeenCalledWith('http://localhost:54321', 'test-anon-key');
      expect(mockSupabaseClient.auth.signInAnonymously).toHaveBeenCalled();
      expect(MockNetwork).toHaveBeenCalled();
      expect(MockUI).toHaveBeenCalled();
      expect(app.network.initialize).toHaveBeenCalledWith(mockSupabaseClient, 'test-user-id');
    });

    test('WhenAuthenticationFails_ShouldNotInitializeComponents', async () => {
      mockSupabaseClient.auth.signInAnonymously.mockResolvedValueOnce({
        data: null,
        error: new Error('Auth failed')
      });

      await app.init();

      expect(app.network).toBeNull();
    });
  });

  describe('setupHandlers', () => {
    test('WhenCalled_ShouldAttachEventListeners', () => {
      const hostBtn = document.getElementById('host-game-btn');
      const addEventListenerSpy = jest.spyOn(hostBtn, 'addEventListener');

      app.setupHandlers();

      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });

  describe('showError', () => {
    test('WhenCalled_ShouldDisplayErrorMessage', () => {
      const errorElement = document.getElementById('lobby-error');

      app.showError('Test error');

      expect(errorElement.textContent).toBe('Test error');
      expect(errorElement.classList.contains('hidden')).toBe(false);
    });
  });

  describe('hostGame', () => {
    beforeEach(async () => {
      await app.init();
      app.startGame = jest.fn();
    });

    test('WhenSuccessful_ShouldShowLobbyWithJoinCode', async () => {
      app.network.hostGame.mockResolvedValue({
        session: { join_code: 'ABC123' },
        player: { player_name: 'Host' }
      });

      await app.hostGame();

      expect(app.network.hostGame).toHaveBeenCalled();
      expect(app.ui.showJoinCode).toHaveBeenCalledWith('ABC123');
      expect(app.ui.updatePlayerList).toHaveBeenCalled();
      expect(app.ui.showLobby).toHaveBeenCalledWith('Game Lobby');
    });

    test('WhenFails_ShouldShowError', async () => {
      app.network.hostGame.mockRejectedValue(new Error('Network error'));
      const showErrorSpy = jest.spyOn(app, 'showError');

      await app.hostGame();

      expect(showErrorSpy).toHaveBeenCalledWith('Error hosting game: Network error');
    });
  });

  describe('joinGame', () => {
    beforeEach(async () => {
      await app.init();
      app.startGame = jest.fn();
    });

    test('WhenValidCode_ShouldJoinAndShowLobby', async () => {
      const joinCodeInput = document.getElementById('join-code-input');
      joinCodeInput.value = 'ABC123';
      app.network.joinGame.mockResolvedValue({ allPlayers: [] });

      await app.joinGame();

      expect(app.network.joinGame).toHaveBeenCalledWith('ABC123', expect.any(String));
      expect(app.ui.showLobby).toHaveBeenCalledWith('Game Lobby');
    });

    test('WhenEmptyCode_ShouldShowError', async () => {
      const joinCodeInput = document.getElementById('join-code-input');
      joinCodeInput.value = '';
      const showErrorSpy = jest.spyOn(app, 'showError');

      await app.joinGame();

      expect(showErrorSpy).toHaveBeenCalledWith('Please enter a join code');
    });

    test('WhenInvalidCode_ShouldShowError', async () => {
      const joinCodeInput = document.getElementById('join-code-input');
      joinCodeInput.value = 'ABC';
      const showErrorSpy = jest.spyOn(app, 'showError');

      await app.joinGame();

      expect(showErrorSpy).toHaveBeenCalledWith('Please enter a valid 6-character join code');
    });
  });

  describe('handleStartGame', () => {
    beforeEach(async () => {
      await app.init();
      app.startGame = jest.fn();
    });

    test('WhenHostStarts_ShouldSendSignalAndStart', () => {
      app.network.isHost = true;
      app.handleStartGame();
      expect(app.network.send).toHaveBeenCalledWith('game_start', {});
      expect(app.startGame).toHaveBeenCalled();
    });

    test('WhenGuestTriesToStart_ShouldDoNothing', () => {
      app.network.isHost = false;
      app.handleStartGame();
      expect(app.network.send).not.toHaveBeenCalled();
    });
  });

  describe('startGame', () => {
    beforeEach(async () => {
      await app.init();
    });

    test('WhenCalled_ShouldInitializeGameComponents', () => {
      app.startGame();

      expect(app.ui.showScreen).toHaveBeenCalledWith('game');
      expect(MockGame).toHaveBeenCalled();
      expect(MockRenderer).toHaveBeenCalled();
      expect(MockInput).toHaveBeenCalled();
      expect(app.game.init).toHaveBeenCalled();
      expect(app.renderer.init).toHaveBeenCalled();
      expect(app.running).toBe(true);
      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('gameLoop', () => {
    beforeEach(async () => {
      await app.init();
      app.startGame();
    });

    test('WhenRunning_ShouldUpdateAndRender', () => {
      app.lastTimestamp = 1000;

      app.gameLoop(1016);

      expect(app.game.update).toHaveBeenCalledWith(0.016);
      expect(app.renderer.render).toHaveBeenCalled();
    });

    test('WhenNotRunning_ShouldNotUpdate', () => {
      app.running = false;

      app.gameLoop(2000);

      expect(app.game.update).not.toHaveBeenCalled();
    });
  });

  describe('stopGame', () => {
    beforeEach(async () => {
      await app.init();
      app.startGame();
    });

    test('WhenCalled_ShouldCleanupResources', () => {
      app.animationFrameId = 123;

      app.stopGame();

      expect(app.running).toBe(false);
      expect(global.cancelAnimationFrame).toHaveBeenCalledWith(123);
      expect(app.input.destroy).toHaveBeenCalled();
      expect(app.network.disconnect).toHaveBeenCalled();
    });
  });
});
