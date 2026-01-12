/**
 * Main Entry Point
 * Initializes the game and manages the game loop
 */

import { CONFIG } from './config.js';
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Network } from './network.js';
import { Camera } from './camera.js';
import { AssetManager } from './AssetManager.js';
import { AuthManager } from './AuthManager.js';
import { LobbyManager } from './LobbyManager.js';

// Initialize Eruda for mobile debugging (console, network, elements inspector)
// Only load in development/preview builds, or when ?debug=true query parameter is present
export async function initializeDebugTools(env = import.meta.env, location = window.location) {
  const urlParams = new URLSearchParams(location.search);
  const debugParam = urlParams.get('debug') === 'true';

  if (env.DEV || debugParam) {
    const eruda = await import('eruda');
    eruda.default.init();
    return true; // Return true to indicate Eruda was initialized
  }
  return false; // Return false to indicate Eruda was not initialized
}

// Initialize debug tools asynchronously (non-blocking)
initializeDebugTools().catch(err => console.warn('Failed to initialize debug tools:', err));

class App {
  constructor() {
    this.game = null;
    this.renderer = null;
    this.input = null;
    this.ui = null;
    this.network = null;
    this.authManager = new AuthManager();
    this.lobbyManager = null;
    this.camera = null;
    this.running = false;
    this.lastTimestamp = 0;
    this.animationFrameId = null;
    this.lastWeaponId = null;
    this.lastArmorId = null;
    this.assetManager = new AssetManager();
  }

  async init() {
    console.log('App initializing...');
    
    // Initialize UI first so we can show errors/interact
    this.ui = new UI();
    this.ui.init();
    this.setupHandlers();

    // Load assets
    try {
        await this.loadAssets();
    } catch (e) {
        console.error('Failed to load assets:', e);
        this.showError('Failed to load game assets. Please refresh.');
        return;
    }
    
    // Show intro screen
    this.ui.showScreen('intro');

    try {
      const supabase = await this.authManager.init();
      
      this.network = new Network();
      // Use the authenticated user's ID as the player ID
      this.network.initialize(supabase, this.authManager.getUserId());
      this.setupNetworkHandlers();

      this.lobbyManager = new LobbyManager(this.network, this.ui);

      console.log('App initialization complete');
      document.body.classList.add('loaded');
    } catch (err) {
      console.error('Error during app initialization:', err);
      this.showError(`Initialization error: ${err.message}`);
    }
  }

  async loadAssets() {
    console.log('Starting asset loading...');
    const manifest = [];
    const { ASSETS, WEAPONS } = CONFIG;
    const baseUrl = ASSETS.BASE_URL.endsWith('/') ? ASSETS.BASE_URL : `${ASSETS.BASE_URL}/`;
    const weaponsBaseUrl = ASSETS.WEAPONS_BASE_URL;

    // Spritesheets
    manifest.push({ 
        key: 'walk', 
        src: ASSETS.SPRITE_SHEET.PATH, 
        metadata: ASSETS.SPRITE_SHEET.METADATA, 
        type: 'spritesheet' 
    });
    manifest.push({
        key: 'slash',
        src: ASSETS.PLAYER_SLASH.PATH,
        metadata: ASSETS.PLAYER_SLASH.METADATA,
        type: 'spritesheet'
    });
    
    // Death spritesheet
    if (ASSETS.PLAYER_DEATH && ASSETS.PLAYER_DEATH.PATH) {
         manifest.push({
             key: 'death',
             src: ASSETS.PLAYER_DEATH.PATH,
             type: 'image'
         });
    }

    // VFX
    if (ASSETS.VFX) {
        Object.values(ASSETS.VFX).forEach(group => {
            Object.values(group).forEach(path => {
                manifest.push({ src: path, type: 'image' });
            });
        });
    }

    // Weapons
    if (WEAPONS) {
        Object.values(WEAPONS).forEach(weapon => {
            if (weapon.icon) {
                manifest.push({ 
                    src: `${weaponsBaseUrl}${weapon.icon}`, 
                    type: 'image' 
                });
            }
        });
    }

    // Backgrounds
    manifest.push({ src: 'game-background.png', type: 'image' });
    manifest.push({ src: 'lobby-background.png', type: 'image' });

    console.log(`Loading ${manifest.length} assets...`);
    
    await this.assetManager.preloadAssets(manifest, (progress) => {
        this.ui.updateLoading(progress);
    });
    
    console.log('Assets loaded');
  }

  setupHandlers() {
    const hostBtn = document.getElementById('host-game-btn');
    const joinBtn = document.getElementById('join-game-btn');
    const startBtn = document.getElementById('start-game-btn');
    const leaveBtn = document.getElementById('leave-lobby-btn');
    const leaveSpectateBtn = document.getElementById('leave-spectate-btn');

    if (hostBtn) {
      hostBtn.addEventListener('click', () => this.hostGame());
    }

    if (joinBtn) {
      joinBtn.addEventListener('click', () => this.joinGame());
    }

    if (startBtn) {
      startBtn.addEventListener('click', () => this.handleStartGame());
    }

    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => this.leaveGame());
    }

    if (leaveSpectateBtn) {
      leaveSpectateBtn.addEventListener('click', () => this.leaveGame());
    }
  }

  setupNetworkHandlers() {
    this.network.on('game_start', () => {
      console.log('Game starting signal received');
      this.startGame();
    });

    this.network.on('game_over', (payload) => {
      console.log('Match ended', payload);
      this.stopGameLoop();
      this.game = null;

      const { winner_id, stats } = payload.data;
      const winner = stats.find(p => p.player_id === winner_id);
      const winnerName = winner ? winner.name : 'Unknown';

      let summaryHtml = `<h4>Winner: ${winnerName}</h4>`;
      summaryHtml += '<ul>';
      // Sort by kills (desc)
      stats.sort((a, b) => b.kills - a.kills);

      stats.forEach(p => {
        const isWinner = p.player_id === winner_id;
        const winnerClass = isWinner ? 'class="winner-row"' : '';
        summaryHtml += `<li ${winnerClass}>${p.name}: ${p.kills} Kills ${isWinner ? '(WINNER)' : ''}</li>`;
      });
      summaryHtml += '</ul>';

      this.ui.showLobby('Match Ended', summaryHtml);
      
      // Resume lobby polling
      if (this.lobbyManager) {
        this.lobbyManager.stopPolling();
        this.lobbyManager.startPolling();
        this.lobbyManager.updateUI();
      }
    });

    this.network.on('session_terminated', (payload) => {
      console.log('Session terminated:', payload.data.reason);
      
      // If we are not the one who initiated the leave (host), show a message
      if (payload.from !== this.network.playerId) {
        this.showError(payload.data.message || 'The host has left the game.');
      }
      
      // Clean up and return to intro
      this.handleHostLeft();
    });
  }

  showError(message) {
    const errorElement = document.getElementById('lobby-error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
      // Auto-hide after 5 seconds
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
    console.log('Hosting game...');
    this.hideError();

    if (!this.network) {
      this.showError('Network not initialized. Please wait or refresh.');
      return;
    }

    try {
      await this.lobbyManager.hostGame();
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

    if (!this.network) {
      this.showError('Network not initialized. Please wait or refresh.');
      return;
    }

    // Validate join code format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(joinCode)) {
      this.showError('Please enter a valid 6-character join code');
      return;
    }

    console.log('Joining game with code:', joinCode);
    try {
      await this.lobbyManager.joinGame(joinCode);
    } catch (error) {
      this.showError(`Error joining game: ${error.message}`);
    }
  }

  async handleStartGame() {
    if (!this.network.isHost) return;

    console.log('Host starting game...');
    
    // Reset player states in DB
    await this.resetPlayerStates();

    this.network.send('game_start', {});
    this.startGame();
  }

  async resetPlayerStates() {
    const playersSnapshot = this.lobbyManager.getPlayersSnapshot();
    if (!playersSnapshot) return;

    console.log('Resetting player states...');
    const updates = [];
    const players = playersSnapshot.getPlayers();
    
    const centerX = CONFIG.WORLD.WIDTH / 2;
    const centerY = CONFIG.WORLD.HEIGHT / 2;
    const spawnRadius = 200;

    let i = 0;
    const totalPlayers = players.size;
    const angleStep = (Math.PI * 2) / (totalPlayers || 1);

    for (const [playerId, player] of players) {
      const angle = i * angleStep;
      const x = centerX + Math.cos(angle) * spawnRadius;
      const y = centerY + Math.sin(angle) * spawnRadius;
      
      updates.push({
        player_id: playerId,
        health: 100,
        kills: 0,
        damage_dealt: 0,
        position_x: x,
        position_y: y,
        velocity_x: 0,
        velocity_y: 0,
        rotation: 0,
        equipped_weapon: 'fist',
        equipped_armor: null
      });
      i++;
    }

    if (updates.length > 0) {
      // Write to DB (authoritative source)
      await this.network.writePlayerStateToDB(updates);
      // Also broadcast to ensure immediate client update
      this.network.broadcastPlayerStateUpdate(updates);
    }
  }

  async leaveGame() {
    if (this.network?.isHost) {
      const confirmed = window.confirm("Leaving as host will end the game for all players. Are you sure?");
      if (!confirmed) return;
    }

    if (this.lobbyManager) {
        await this.lobbyManager.leaveGame();
    }

    this.stopGameLoop();
    this.game = null;
    this.lastWeaponId = null;
    this.lastArmorId = null;

    this.ui.showSpectatorControls(false);
    this.ui.showScreen('intro');
  }

  handleHostLeft() {
    if (this.lobbyManager) {
        this.lobbyManager.handleHostLeft();
    }

    this.stopGameLoop();
    this.game = null;
    this.lastWeaponId = null;
    this.lastArmorId = null;

    this.ui.showSpectatorControls(false);
    this.ui.showScreen('intro');
  }

  startGame() {
    console.log('Entering game screen...');

    if (this.lobbyManager) {
        this.lobbyManager.stopPolling();
    }

    // Switch to game screen
    this.ui.showScreen('game');

    // Initialize game components
    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }

    this.renderer = new Renderer(canvas, this.assetManager);
    this.game = new Game();
    this.input = new Input();

    // Initialize components
    this.renderer.init();

    // Get snapshot from lobby manager
    const playersSnapshot = this.lobbyManager ? this.lobbyManager.getPlayersSnapshot() : null;
    this.game.init(playersSnapshot, this.network, this.renderer);

    // Initialize camera with actual canvas dimensions (after renderer.init)
    this.camera = new Camera(
      CONFIG.WORLD.WIDTH,
      CONFIG.WORLD.HEIGHT,
      canvas.width,
      canvas.height
    );

    // Initialize camera to local player position
    const localPlayer = this.game.getLocalPlayer();
    if (localPlayer) {
      this.camera.x = localPlayer.x;
      this.camera.y = localPlayer.y;
    }

    // Handle window resize and orientation changes with debouncing
    this.resizeTimeout = null;
    this.handleResize = () => {
      // Debounce resize events to avoid excessive calls
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }

      this.resizeTimeout = setTimeout(() => {
        if (this.renderer && this.camera && canvas) {
          // Resize canvas to match new viewport
          this.renderer.resizeCanvas();

          // Update camera viewport to match new canvas dimensions
          this.camera.updateViewport(canvas.width, canvas.height);
        }
        this.resizeTimeout = null;
      }, 150); // 150ms debounce delay
    };

    // Listen to resize (covers most cases including orientation change)
    window.addEventListener('resize', this.handleResize);

    // Start periodic player state DB writes if we have a session (for persistence)
    if (playersSnapshot && this.network) {
      this.network.startPeriodicPlayerStateWrite(() => {
        const localPlayer = this.game.getLocalPlayer();
        if (!localPlayer) return { player_id: this.network.playerId };
        
        return {
          player_id: this.network.playerId,
          position_x: localPlayer.x,
          position_y: localPlayer.y,
          rotation: localPlayer.rotation,
          velocity_x: localPlayer.velocity.x,
          velocity_y: localPlayer.velocity.y,
        };
      }, 60000); // 60 seconds

      // Host-authoritative periodic health persistence
      // Persist health for ALL players to DB every 60 seconds
      if (this.network.isHost) {
        this.network.startPeriodicPlayerStateWrite(() => {
          if (!playersSnapshot) return [];

          const updates = [];
          for (const [playerId, player] of playersSnapshot.getPlayers()) {
            // Only write if health is defined
            if (player.health !== undefined) {
              updates.push({
                player_id: playerId,
                health: player.health
              });
            }
          }
          return updates;
        }, 60000); // 60 seconds
      }
    }

    this.input.init((inputState) => {
      // Pass input to game
      if (this.game) {
        this.game.handleInput(inputState);
      }
    });

    // Expose game, camera, and renderer on window for integration tests
    window.game = this.game;
    window.camera = this.camera;
    window.renderer = this.renderer;

    // Start game loop
    this.running = true;
    this.lastTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
  }

  gameLoop(timestamp) {
    if (!this.running) return;

    // Calculate delta time
    const deltaTime = (timestamp - this.lastTimestamp) / 1000; // Convert to seconds
    this.lastTimestamp = timestamp;

    // Update game state
    this.game.update(deltaTime);

    // Update camera to follow target (local player or spectated player)
    const cameraTarget = this.game.getCameraTarget();
    if (cameraTarget && this.camera) {
      this.camera.update(cameraTarget.x, cameraTarget.y, CONFIG.CAMERA.LERP_FACTOR);
    }

    // Update UI
    const localPlayer = this.game.getLocalPlayer();
    if (localPlayer) {
      this.ui.updateHealth(localPlayer.health);
      
      // Check for death/spectator mode
      if (this.game.localPlayerController && this.game.localPlayerController.isDead()) {
        // If spectating someone else, show their name. Otherwise show own name (or generic message)
        const spectatingName = (cameraTarget && cameraTarget.id !== localPlayer.id) ? cameraTarget.name : localPlayer.name;
        this.ui.showSpectatorControls(true, spectatingName);
      } else {
        this.ui.showSpectatorControls(false);
      }
      
      // Update cooldowns
      if (this.game.localPlayerController) {
        const cooldowns = this.game.localPlayerController.getCooldownStatus();
        this.ui.updateCooldowns(cooldowns.attackPct, cooldowns.abilityPct);
      }

      // Check for equipment changes
      // We store the last known equipment on the App instance to avoid unnecessary DOM updates
      const currentWeaponId = localPlayer.equipped_weapon;
      const currentArmorId = localPlayer.armor;

      if (this.lastWeaponId !== currentWeaponId || this.lastArmorId !== currentArmorId) {
        const weaponConfig = currentWeaponId ? Object.values(CONFIG.WEAPONS).find(w => w.id === currentWeaponId) : null;
        const armorConfig = currentArmorId ? Object.values(CONFIG.ARMOR).find(a => a.id === currentArmorId) : null;
        
        this.ui.updateEquipment(weaponConfig, armorConfig);
        this.ui.updateActionButtons(weaponConfig);
        
        this.lastWeaponId = currentWeaponId;
        this.lastArmorId = currentArmorId;
      }
    }

    // Render
    // Get snapshot from lobby manager if game doesn't expose it directly (Game.init stores it but doesn't expose it)
    // Actually, App.init passes playersSnapshot to game.init.
    // In original code, App kept a reference to playersSnapshot.
    // In new code, LobbyManager has it.
    const playersSnapshot = this.lobbyManager ? this.lobbyManager.getPlayersSnapshot() : null;

    this.renderer.render(this.game.getState(), this.game.getLocalPlayer(), playersSnapshot, this.camera, deltaTime);

    // Continue loop
    this.animationFrameId = requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
  }

  stopGameLoop() {
    this.running = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.input) {
      this.input.destroy();
    }
    // Clean up resize handlers
    if (this.handleResize) {
      window.removeEventListener('resize', this.handleResize);
      this.handleResize = null;
    }
    // Clear any pending resize timeout
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
  }

  stopGame() {
    this.stopGameLoop();
    if (this.network) {
      this.network.disconnect();
    }
    this.game = null;
    if (this.lobbyManager) {
        this.lobbyManager.stopPolling();
        if (this.lobbyManager.playersSnapshot) {
            this.lobbyManager.playersSnapshot.destroy();
            this.lobbyManager.playersSnapshot = null;
        }
    }
    this.lastWeaponId = null;
    this.lastArmorId = null;
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const app = new App();
  window.app = app;
  await app.init();
});
