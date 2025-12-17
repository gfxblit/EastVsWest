/**
 * Unit tests for game configuration
 */

import { CONFIG } from './config.js';

describe('CONFIG', () => {
  test('should have correct grid dimensions', () => {
    expect(CONFIG.GRID_WIDTH).toBe(20);
    expect(CONFIG.GRID_HEIGHT).toBe(20);
  });

  test('should have correct cell size', () => {
    expect(CONFIG.CELL_SIZE).toBe(20);
  });

  test('should calculate canvas dimensions correctly', () => {
    expect(CONFIG.CANVAS_WIDTH).toBe(400);
    expect(CONFIG.CANVAS_HEIGHT).toBe(400);
  });

  test('should have game speed configured', () => {
    expect(CONFIG.GAME_SPEED).toBe(150);
  });

  test('should have color configuration', () => {
    expect(CONFIG.COLORS).toBeDefined();
    expect(CONFIG.COLORS.SNAKE).toBe('#4CAF50');
    expect(CONFIG.COLORS.FOOD).toBe('#FF5722');
    expect(CONFIG.COLORS.BACKGROUND).toBe('#000000');
  });
});
