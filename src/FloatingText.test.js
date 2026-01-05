
import { FloatingText } from './FloatingText';
import { jest } from '@jest/globals';

describe('FloatingText', () => {
  let ctx;

  beforeEach(() => {
    ctx = {
      fillStyle: '',
      globalAlpha: 1,
      fillText: jest.fn(),
      strokeText: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      font: '',
    };
  });

  test('should initialize with correct properties', () => {
    const text = new FloatingText(100, 200, '50', '#ff0000');
    expect(text.x).toBe(100);
    expect(text.y).toBe(200);
    expect(text.text).toBe('50');
    expect(text.color).toBe('#ff0000');
    expect(text.lifeTime).toBeGreaterThan(0);
    expect(text.opacity).toBe(1);
  });

  test('update should move text upwards and reduce opacity', () => {
    const text = new FloatingText(100, 200, '50', '#ff0000');
    const initialY = text.y;
    const initialLifeTime = text.lifeTime;

    text.update(0.1); // 100ms

    expect(text.y).toBeLessThan(initialY); // Moved up
    expect(text.lifeTime).toBeLessThan(initialLifeTime); // Life reduced
  });

  test('isExpired should return true when lifetime is <= 0', () => {
    const text = new FloatingText(100, 200, '50', '#ff0000');
    text.lifeTime = 0.1;
    
    text.update(0.1); // Should expire it

    expect(text.isExpired()).toBe(true);
  });

  test('draw should render text to canvas', () => {
    const text = new FloatingText(100, 200, '50', '#ff0000');
    
    text.draw(ctx);

    expect(ctx.fillStyle).toBe('#ff0000');
    expect(ctx.fillText).toHaveBeenCalledWith('50', 100, 200);
  });
});
