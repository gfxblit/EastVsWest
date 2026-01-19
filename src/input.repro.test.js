import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { Input } from './input.js';
import { CONFIG } from './config.js';

describe('Issue 250 Reproduction - Touch Dragging Fails', () => {
  let input;
  let mockCallback;
  let mockCanvas;
  let mockJoystickBase;

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

  test('WhenTouchStartOnDebugButton_ShouldNOTActivateJoystick', () => {
    const TOUCH_ID_DEBUG = 103;
    document.body.innerHTML += '<button id="debug-toggle-btn" class="touch-debug-btn"></button>';
    const mockDebugBtn = document.getElementById('debug-toggle-btn');
    const touch = new Touch({
      identifier: TOUCH_ID_DEBUG,
      target: mockDebugBtn,
      clientX: 5,
      clientY: 5
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockDebugBtn });

    input.handleTouchStart(event);
    
    expect(input.touchState.active).toBe(false);
  });

  test('WhenTouchStartOnOtherUIElement_ShouldNOTActivateJoystick', () => {
    const TOUCH_ID_UI = 104;
    document.body.innerHTML += '<div id="player-stats"></div>';
    const mockUI = document.getElementById('player-stats');
    const touch = new Touch({
      identifier: TOUCH_ID_UI,
      target: mockUI,
      clientX: 5,
      clientY: 5
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockUI });

    input.handleTouchStart(event);
    
    expect(input.touchState.active).toBe(false);
  });
});
