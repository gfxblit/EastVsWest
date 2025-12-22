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
    this.supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
    this.network = new Network();
    // For now, generate a random player ID. In a real app, this would come from auth.
    const tempPlayerId = `player-${Math.random().toString(36).substr(2, 9)}`;
    this.network.initialize(this.supabase, tempPlayerId);


    // Initialize UI
    this.ui = new UI();
    this.ui.init();

    // Set up lobby event handlers
    this.setupLobbyHandlers();
  }

  setupLobbyHandlers() {
    const hostBtn = document.getElementById('host-game-btn');
    const joinBtn = document.getElementById('join-game-btn');

    if (hostBtn) {
      hostBtn.addEventListener('click', () => this.hostGame());
    }

    if (joinBtn) {
      joinBtn.addEventListener('click', () => this.joinGame());
    }
  }

  async hostGame() {
    console.log('Hosting game...');
    try {
      const playerName = `Host-${Math.random().toString(36).substr(2, 5)}`;
      const { session } = await this.network.hostGame(playerName);
      this.ui.showJoinCode(session.join_code);
      this.network.startPositionBroadcasting();
      this.startGame();
    } catch (error) {
      console.error('Failed to host game:', error);
      alert(`Error hosting game: ${error.message}`);
    }
  }

  async joinGame() {
    const joinCodeInput = document.getElementById('join-code-input');
    const joinCode = joinCodeInput?.value.trim().toUpperCase();

    if (!joinCode) {
      alert('Please enter a join code');
      return;
    }

    // Validate join code format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(joinCode)) {
      alert('Please enter a valid 6-character join code');
      return;
    }

    console.log('Joining game with code:', joinCode);
    try {
      const playerName = `Player-${Math.random().toString(36).substr(2, 5)}`;
      await this.network.joinGame(joinCode, playerName);
      this.startGame();
    } catch (error) {
      console.error('Failed to join game:', error);
      alert(`Error joining game: ${error.message}`);
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
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
