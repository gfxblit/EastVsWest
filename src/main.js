/**
 * Main entry point for the SnakeClaude game
 */

import { CONFIG } from './config.js';

/**
 * Initialize the game
 */
function init() {
  console.log('SnakeClaude initializing...');

  // Get canvas element
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  // Set canvas dimensions based on config
  canvas.width = CONFIG.CANVAS_WIDTH;
  canvas.height = CONFIG.CANVAS_HEIGHT;

  console.log('Game initialized successfully');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init };
