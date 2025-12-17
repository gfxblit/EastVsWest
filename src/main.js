/**
 * Main Entry Point
 * Initializes the game and manages the game loop
 */

import { CONFIG } from './config.js';
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { UI } from './ui.js';

class App {
  constructor() {
    this.game = null;
    this.renderer = null;
    this.input = null;
    this.ui = null;
    this.lastTimestamp = 0;
    this.running = false;
  }

  init() {
    console.log('Initializing Conflict Zone: East vs West');

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

  hostGame() {
    console.log('Hosting game...');
    this.ui.showJoinCode('DEMO-CODE'); // Placeholder for now
    this.startGame();
  }

  joinGame() {
    const joinCodeInput = document.getElementById('join-code-input');
    const joinCode = joinCodeInput?.value.trim();

    if (!joinCode) {
      alert('Please enter a join code');
      return;
    }

    console.log('Joining game with code:', joinCode);
    this.startGame();
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
    requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
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
    requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
  }

  stopGame() {
    this.running = false;
    if (this.input) {
      this.input.destroy();
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
