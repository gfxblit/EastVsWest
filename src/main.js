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
import { createClient } from '@supabase/supabase-js';

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
    this.supabase = null;
    this.running = false;
    this.lastTimestamp = 0;
    this.animationFrameId = null;
  }

  async init() {
    console.log('App initializing...');
    
    // Initialize UI first so we can show errors/interact
    this.ui = new UI();
    this.ui.init();
    this.setupLobbyHandlers();

    try {
      console.log('Creating Supabase client...');
      let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      let supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      // Dynamic URL construction for development to support Tailscale/LAN/Localhost seamlessly
      if (import.meta.env.DEV) {
        const currentHost = window.location.hostname;
        console.log(`Development mode detected. Current hostname: ${currentHost}`);
        
        // If we are on a custom hostname (like Tailscale or LAN IP), try to use that for the backend too
        // This assumes the backend is running on port 54321 on the same machine
        if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
            const dynamicUrl = `http://${currentHost}:54321`;
            console.log(`Overriding VITE_SUPABASE_URL to match hostname: ${dynamicUrl}`);
            supabaseUrl = dynamicUrl;
        }
      }

      // Fallback for local development if env vars are missing
      if ((!supabaseUrl || !supabaseKey) && import.meta.env.DEV) {
        console.warn('Supabase credentials missing in env, falling back to local defaults');
        supabaseUrl = 'http://127.0.0.1:54321';
        // Default local Supabase Anon Key
        supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
      }
      
      if (!supabaseUrl || !supabaseKey) {
        const msg = 'Missing Supabase credentials in environment variables';
        console.error(msg);
        this.showLobbyError(msg);
        return;
      }

      this.supabase = createClient(supabaseUrl, supabaseKey);

      // Diagnostic: Check if we can actually reach the Supabase server
      console.log(`Testing connectivity to ${supabaseUrl}...`);
      try {
        // Shorter timeout for the connectivity check
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);
        
        // Fetch the root of the REST API to check reachability
        const response = await fetch(`${supabaseUrl}/rest/v1/`, { 
          signal: controller.signal,
          headers: { 'apikey': supabaseKey }
        });
        clearTimeout(id);
        
        if (!response.ok) {
           console.warn('Supabase connectivity check returned non-OK status:', response.status);
        } else {
           console.log('Supabase is reachable.');
        }
      } catch (netErr) {
        console.error('Failed to reach Supabase server:', netErr);
        this.showLobbyError(`Cannot reach server at ${supabaseUrl}. Check Firewall/Wi-Fi.`);
        return;
      }

      // Sign in anonymously to get an auth.uid()
      console.log('Signing in anonymously...');
      const { data: authData, error: authError } = await this.supabase.auth.signInAnonymously();
      if (authError) {
        const msg = `Failed to sign in anonymously: ${authError.message}`;
        console.error(msg, authError);
        this.showLobbyError(msg);
        return;
      }
      console.log('Signed in anonymously', authData.user.id);

      this.network = new Network();
      // Use the authenticated user's ID as the player ID
      this.network.initialize(this.supabase, authData.user.id);

      console.log('App initialization complete');
    } catch (err) {
      console.error('Error during app initialization:', err);
      this.showLobbyError(`Initialization error: ${err.message}`);
    }
  }

  setupLobbyHandlers() {
    console.log('Setting up lobby handlers...');
    const hostBtn = document.getElementById('host-game-btn');
    const joinBtn = document.getElementById('join-game-btn');

    if (hostBtn) {
      console.log('Host button found, attaching listener');
      hostBtn.addEventListener('click', () => {
        console.log('Host button clicked');
        this.hostGame();
      });
    } else {
      console.error('Host button not found');
    }

    if (joinBtn) {
      console.log('Join button found, attaching listener');
      joinBtn.addEventListener('click', () => this.joinGame());
    } else {
      console.error('Join button not found');
    }
  }

  showLobbyError(message) {
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

  hideLobbyError() {
    const errorElement = document.getElementById('lobby-error');
    if (errorElement) {
      errorElement.classList.add('hidden');
    }
  }

  async hostGame() {
    console.log('Hosting game...');
    this.hideLobbyError();

    if (!this.network) {
      this.showLobbyError('Network not initialized. Please wait or refresh.');
      return;
    }

    try {
      const playerName = `Host-${Math.random().toString(36).substr(2, 5)}`;
      const { session } = await this.network.hostGame(playerName);
      this.ui.showJoinCode(session.join_code);
      this.network.startPositionBroadcasting();
      this.startGame();
    } catch (error) {
      console.error('Failed to host game:', error);
      this.showLobbyError(`Error hosting game: ${error.message}`);
    }
  }

  async joinGame() {
    const joinCodeInput = document.getElementById('join-code-input');
    const joinCode = joinCodeInput?.value.trim().toUpperCase();

    this.hideLobbyError();

    if (!joinCode) {
      this.showLobbyError('Please enter a join code');
      return;
    }

    if (!this.network) {
      this.showLobbyError('Network not initialized. Please wait or refresh.');
      return;
    }

    // Validate join code format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(joinCode)) {
      this.showLobbyError('Please enter a valid 6-character join code');
      return;
    }

    console.log('Joining game with code:', joinCode);
    try {
      const playerName = `Player-${Math.random().toString(36).substr(2, 5)}`;
      await this.network.joinGame(joinCode, playerName);
      this.startGame();
    } catch (error) {
      console.error('Failed to join game:', error);
      this.showLobbyError(`Error joining game: ${error.message}`);
    }
  }

  startGame() {
    console.log('Starting game...');

    // Switch to game screen
    this.ui.showScreen('game');

    // Initialize game components
    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }

    this.renderer = new Renderer(canvas);
    this.game = new Game();
    this.input = new Input();

    // Initialize components
    this.renderer.init();
    this.game.init();
    this.input.init((inputState) => {
      // Pass input to game
      if (this.game) {
        this.game.handleInput(inputState);
      }
    });

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

    // Render
    this.renderer.render(this.game.getState());

    // Continue loop
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

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const app = new App();
  await app.init();
});
