import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { Input } from './input.js';
import { CONFIG } from './config.js';

describe('Issue 250 Reproduction - Touch Dragging Fails', () => {
  let input;
  let mockCallback;
  let mockCanvas;
  let mockJoystickBase;
  let mockTouchControls;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="game-screen">
        <canvas id="game-canvas"></canvas>
        <div id="touch-controls" class="touch-controls">
          <div id="joystick-base" class="joystick-base">
            <div id="joystick-stick" class="joystick-stick"></div>
          </div>
        </div>
      </div>
      <div id="touch-buttons">
        <button id="attack-button" class="touch-btn"></button>
        <button id="ability-button" class="touch-btn"></button>
        <button id="interact-button" class="touch-btn"></button>
      </div>
    `;

    mockCanvas = document.getElementById('game-canvas');
    mockJoystickBase = document.getElementById('joystick-base');
    mockTouchControls = document.getElementById('touch-controls');

    // Mock getBoundingClientRect
    mockCanvas.getBoundingClientRect = jest.fn(() => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600
    }));

    input = new Input();
    mockCallback = jest.fn();
    input.init(mockCallback);
  });

  test('WhenTouchStartOnCanvas_ShouldActivateJoystick', () => {
    const TOUCH_ID_CANVAS = 100;
    const touch = new Touch({
      identifier: TOUCH_ID_CANVAS,
      target: mockCanvas,
      clientX: 100,
      clientY: 100
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockCanvas });

    input.handleTouchStart(event);
    expect(input.touchState.active).toBe(true);
  });

  test('WhenTouchStartOnJoystickBase_ShouldActivateJoystick', () => {
    const TOUCH_ID_JOYSTICK = 101;
    const touch = new Touch({
      identifier: TOUCH_ID_JOYSTICK,
      target: mockJoystickBase,
      clientX: 100,
      clientY: 100
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockJoystickBase });

    input.handleTouchStart(event);
    
    expect(input.touchState.active).toBe(true);
  });

  test('WhenTouchStartOnGameScreenOutsideCanvas_ShouldNOTActivateJoystick', () => {
    const TOUCH_ID_OUTSIDE = 102;
    const mockGameScreen = document.getElementById('game-screen');
    const touch = new Touch({
      identifier: TOUCH_ID_OUTSIDE,
      target: mockGameScreen,
      clientX: 5,
      clientY: 5
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockGameScreen });

    input.handleTouchStart(event);
    
    expect(input.touchState.active).toBe(false);
  });
});
