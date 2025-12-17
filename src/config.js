/**
 * Game configuration constants
 */

export const CONFIG = {
  // Grid dimensions
  GRID_WIDTH: 20,
  GRID_HEIGHT: 20,

  // Cell size in pixels
  CELL_SIZE: 20,

  // Game speed (milliseconds per frame)
  GAME_SPEED: 150,

  // Canvas dimensions (derived from grid and cell size)
  get CANVAS_WIDTH() {
    return this.GRID_WIDTH * this.CELL_SIZE;
  },
  get CANVAS_HEIGHT() {
    return this.GRID_HEIGHT * this.CELL_SIZE;
  },

  // Colors
  COLORS: {
    SNAKE: '#4CAF50',
    FOOD: '#FF5722',
    BACKGROUND: '#000000',
  },
};
