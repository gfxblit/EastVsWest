import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { Input } from './input.js';

describe('Touch Layout and Interaction', () => {
  let input;
  let mockCanvas;
  let mockAttackBtn;
  let mockAbilityBtn;
  let mockInteractBtn;
  let mockTouchButtonsContainer;

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
      <div id="touch-buttons" class="touch-buttons">
        <button id="attack-button" class="touch-btn attack-btn"></button>
        <button id="ability-button" class="touch-btn ability-btn"></button>
        <button id="interact-button" class="touch-btn interact-btn"></button>
      </div>
    `;

    mockCanvas = document.getElementById('game-canvas');
    mockAttackBtn = document.getElementById('attack-button');
    mockAbilityBtn = document.getElementById('ability-button');
    mockInteractBtn = document.getElementById('interact-button');
    mockTouchButtonsContainer = document.getElementById('touch-buttons');

    // Mock getBoundingClientRect
    mockCanvas.getBoundingClientRect = jest.fn(() => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600
    }));

    input = new Input();
    input.init(jest.fn());
  });

  test('WhenTouchStartOnAttackButton_ShouldNOTActivateJoystick', () => {
    const touch = new Touch({
      identifier: 1,
      target: mockAttackBtn,
      clientX: 750,
      clientY: 550
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockAttackBtn });

    input.handleTouchStart(event);
    expect(input.touchState.active).toBe(false);
  });

  test('WhenTouchStartOnAbilityButton_ShouldNOTActivateJoystick', () => {
    const touch = new Touch({
      identifier: 2,
      target: mockAbilityBtn,
      clientX: 750,
      clientY: 450
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockAbilityBtn });

    input.handleTouchStart(event);
    expect(input.touchState.active).toBe(false);
  });

  test('WhenTouchStartOnInteractButton_ShouldNOTActivateJoystick', () => {
    const touch = new Touch({
      identifier: 3,
      target: mockInteractBtn,
      clientX: 650,
      clientY: 500
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockInteractBtn });

    input.handleTouchStart(event);
    expect(input.touchState.active).toBe(false);
  });

  test('WhenTouchStartOnButtonsContainer_ShouldNOTActivateJoystickDirectly', () => {
    // In a real browser with pointer-events: none, this touch would never hit the container
    // but would hit the canvas underneath. Here we test what happens if the event
    // somehow targets the container.
    const touch = new Touch({
      identifier: 4,
      target: mockTouchButtonsContainer,
      clientX: 700,
      clientY: 500
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockTouchButtonsContainer });

    input.handleTouchStart(event);
    
    // isValidJoystickTouch should return false for the container itself 
    // if it's not the canvas or a joystick element.
    expect(input.touchState.active).toBe(false);
  });

  test('WhenTouchStartOnCanvasUnderButtonsContainer_ShouldActivateJoystick', () => {
    // This simulates the behavior when pointer-events: none is active on the container
    const touch = new Touch({
      identifier: 5,
      target: mockCanvas,
      clientX: 700,
      clientY: 500
    });
    const event = new TouchEvent('touchstart', { touches: [touch] });
    Object.defineProperty(event, 'target', { value: mockCanvas });

    input.handleTouchStart(event);
    expect(input.touchState.active).toBe(true);
  });
});
