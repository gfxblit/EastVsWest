import { jest } from '@jest/globals';
/**
 * Input Handler Tests
 * Unit tests for input.js following TDD workflow
 */

import { Input } from './input.js';
import { CONFIG } from './config.js';

describe('Input', () => {
  let input;
  let mockCallback;

  beforeEach(() => {
    input = new Input();
    mockCallback = jest.fn();
  });

  afterEach(() => {
    if (input.boundHandlers && Object.keys(input.boundHandlers).length > 0) {
      input.destroy();
    }
  });

  describe('Constructor', () => {
    test('WhenConstructed_ShouldInitializeInputStateWithDefaults', () => {
      expect(input.inputState).toBeDefined();
      expect(input.inputState.moveX).toBe(0);
      expect(input.inputState.moveY).toBe(0);
      expect(input.inputState.aimX).toBe(0);
      expect(input.inputState.aimY).toBe(0);
      expect(input.inputState.attack).toBe(false);
      expect(input.inputState.specialAbility).toBe(false);
      expect(input.inputState.interact).toBe(false);
    });

    test('WhenConstructed_ShouldInitializeKeysPressed', () => {
      expect(input.keysPressed).toBeInstanceOf(Set);
      expect(input.keysPressed.size).toBe(0);
    });

    test('WhenConstructed_ShouldInitializeBoundHandlers', () => {
      expect(input.boundHandlers).toBeDefined();
      expect(typeof input.boundHandlers).toBe('object');
    });
  });

  describe('init', () => {
    test('WhenInitialized_ShouldStoreCallback', () => {
      input.init(mockCallback);
      expect(input.onInputChange).toBe(mockCallback);
    });

    test('WhenInitialized_ShouldBindEventHandlers', () => {
      input.init(mockCallback);
      expect(input.boundHandlers.keydown).toBeDefined();
      expect(input.boundHandlers.keyup).toBeDefined();
      expect(input.boundHandlers.mousemove).toBeDefined();
      expect(input.boundHandlers.mousedown).toBeDefined();
      expect(input.boundHandlers.mouseup).toBeDefined();
    });

    test('WhenInitialized_ShouldAddEventListeners', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      input.init(mockCallback);

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

      addEventListenerSpy.mockRestore();
    });
  });

  describe('handleKeyDown', () => {
    beforeEach(() => {
      input.init(mockCallback);
    });

    test('WhenWKeyPressed_ShouldUpdateMoveY', () => {
      const event = new KeyboardEvent('keydown', { code: 'KeyW' });
      input.handleKeyDown(event);

      expect(input.inputState.moveY).toBe(-1);
    });

    test('WhenAKeyPressed_ShouldUpdateMoveX', () => {
      const event = new KeyboardEvent('keydown', { code: 'KeyA' });
      input.handleKeyDown(event);

      expect(input.inputState.moveX).toBe(-1);
    });

    test('WhenSKeyPressed_ShouldUpdateMoveY', () => {
      const event = new KeyboardEvent('keydown', { code: 'KeyS' });
      input.handleKeyDown(event);

      expect(input.inputState.moveY).toBe(1);
    });

    test('WhenDKeyPressed_ShouldUpdateMoveX', () => {
      const event = new KeyboardEvent('keydown', { code: 'KeyD' });
      input.handleKeyDown(event);

      expect(input.inputState.moveX).toBe(1);
    });

    test('WhenSpecialAbilityKeyPressed_ShouldSetSpecialAbilityTrue', () => {
      const event = new KeyboardEvent('keydown', { code: CONFIG.INPUT.SPECIAL_ABILITY_KEY });
      input.handleKeyDown(event);

      expect(input.inputState.specialAbility).toBe(true);
    });

    test('WhenInteractKeyPressed_ShouldSetInteractTrue', () => {
      const event = new KeyboardEvent('keydown', { code: CONFIG.INPUT.INTERACT_KEY });
      input.handleKeyDown(event);

      expect(input.inputState.interact).toBe(true);
    });

    test('WhenKeyPressed_ShouldAddToKeysPressed', () => {
      const event = new KeyboardEvent('keydown', { code: 'KeyW' });
      input.handleKeyDown(event);

      expect(input.keysPressed.has('KeyW')).toBe(true);
    });

    test('WhenKeyPressed_ShouldCallCallback', () => {
      const event = new KeyboardEvent('keydown', { code: 'KeyW' });
      input.handleKeyDown(event);

      expect(mockCallback).toHaveBeenCalled();
    });

    test('WhenDvorakLayoutUsed_ShouldStillMoveBasedOnPhysicalPosition', () => {
      // On Dvorak, physical 'W' key produces ','
      const event = new KeyboardEvent('keydown', {
        key: ',',
        code: 'KeyW'
      });
      input.handleKeyDown(event);

      expect(input.inputState.moveY).toBe(-1);
    });

    test('WhenArrowUpPressed_ShouldUpdateMoveY', () => {
      const event = new KeyboardEvent('keydown', { code: 'ArrowUp' });
      input.handleKeyDown(event);

      expect(input.inputState.moveY).toBe(-1);
    });

    test('WhenArrowLeftPressed_ShouldUpdateMoveX', () => {
      const event = new KeyboardEvent('keydown', { code: 'ArrowLeft' });
      input.handleKeyDown(event);

      expect(input.inputState.moveX).toBe(-1);
    });

    test('WhenArrowDownPressed_ShouldUpdateMoveY', () => {
      const event = new KeyboardEvent('keydown', { code: 'ArrowDown' });
      input.handleKeyDown(event);

      expect(input.inputState.moveY).toBe(1);
    });

    test('WhenArrowRightPressed_ShouldUpdateMoveX', () => {
      const event = new KeyboardEvent('keydown', { code: 'ArrowRight' });
      input.handleKeyDown(event);

      expect(input.inputState.moveX).toBe(1);
    });

    test('WhenDebugCycleWeaponKeyPressed_ShouldEmitCycleWeaponEvent', () => {
      const emitSpy = jest.spyOn(input, 'emit');
      const event = new KeyboardEvent('keydown', { code: CONFIG.INPUT.DEBUG_CYCLE_WEAPON_KEY });
      input.handleKeyDown(event);

      expect(emitSpy).toHaveBeenCalledWith('cycle_weapon');
      emitSpy.mockRestore();
    });
  });

  describe('handleKeyUp', () => {
    beforeEach(() => {
      input.init(mockCallback);
    });

    test('WhenWKeyReleased_ShouldResetMoveY', () => {
      // Press W
      const downEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      input.handleKeyDown(downEvent);

      // Release W
      const upEvent = new KeyboardEvent('keyup', { code: 'KeyW' });
      input.handleKeyUp(upEvent);

      expect(input.inputState.moveY).toBe(0);
    });

    test('WhenSpecialAbilityKeyReleased_ShouldSetSpecialAbilityFalse', () => {
      const downEvent = new KeyboardEvent('keydown', { code: CONFIG.INPUT.SPECIAL_ABILITY_KEY });
      input.handleKeyDown(downEvent);

      const upEvent = new KeyboardEvent('keyup', { code: CONFIG.INPUT.SPECIAL_ABILITY_KEY });
      input.handleKeyUp(upEvent);

      expect(input.inputState.specialAbility).toBe(false);
    });

    test('WhenInteractKeyReleased_ShouldSetInteractFalse', () => {
      const downEvent = new KeyboardEvent('keydown', { code: CONFIG.INPUT.INTERACT_KEY });
      input.handleKeyDown(downEvent);

      const upEvent = new KeyboardEvent('keyup', { code: CONFIG.INPUT.INTERACT_KEY });
      input.handleKeyUp(upEvent);

      expect(input.inputState.interact).toBe(false);
    });

    test('WhenKeyReleased_ShouldRemoveFromKeysPressed', () => {
      const downEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      input.handleKeyDown(downEvent);

      const upEvent = new KeyboardEvent('keyup', { code: 'KeyW' });
      input.handleKeyUp(upEvent);

      expect(input.keysPressed.has('KeyW')).toBe(false);
    });

    test('WhenArrowUpReleased_ShouldResetMoveY', () => {
      // Press ArrowUp
      const downEvent = new KeyboardEvent('keydown', { code: 'ArrowUp' });
      input.handleKeyDown(downEvent);

      // Release ArrowUp
      const upEvent = new KeyboardEvent('keyup', { code: 'ArrowUp' });
      input.handleKeyUp(upEvent);

      expect(input.inputState.moveY).toBe(0);
    });
  });

  describe('updateMovement', () => {
    beforeEach(() => {
      input.init(mockCallback);
    });

    test('WhenWAndDPressed_ShouldNormalizeDiagonalMovement', () => {
      input.keysPressed.add('KeyW');
      input.keysPressed.add('KeyD');
      input.updateMovement();

      const magnitude = Math.sqrt(
        input.inputState.moveX ** 2 + input.inputState.moveY ** 2
      );
      expect(magnitude).toBeCloseTo(1, 5);
    });

    test('WhenWAndSPressed_ShouldCancelVerticalMovement', () => {
      input.keysPressed.add('KeyW');
      input.keysPressed.add('KeyS');
      input.updateMovement();

      expect(input.inputState.moveY).toBe(0);
    });

    test('WhenAAndDPressed_ShouldCancelHorizontalMovement', () => {
      input.keysPressed.add('KeyA');
      input.keysPressed.add('KeyD');
      input.updateMovement();

      expect(input.inputState.moveX).toBe(0);
    });

    test('WhenNoKeysPressed_ShouldSetMovementToZero', () => {
      input.updateMovement();

      expect(input.inputState.moveX).toBe(0);
      expect(input.inputState.moveY).toBe(0);
    });

    test('WhenMovementUpdated_ShouldCallCallback', () => {
      mockCallback.mockClear();
      input.updateMovement();

      expect(mockCallback).toHaveBeenCalledWith(input.inputState);
    });

    test('WhenArrowUpAndArrowRightPressed_ShouldNormalizeDiagonalMovement', () => {
      input.keysPressed.add('ArrowUp');
      input.keysPressed.add('ArrowRight');
      input.updateMovement();

      const magnitude = Math.sqrt(
        input.inputState.moveX ** 2 + input.inputState.moveY ** 2
      );
      expect(magnitude).toBeCloseTo(1, 5);
    });

    test('WhenArrowUpAndArrowDownPressed_ShouldCancelVerticalMovement', () => {
      input.keysPressed.add('ArrowUp');
      input.keysPressed.add('ArrowDown');
      input.updateMovement();

      expect(input.inputState.moveY).toBe(0);
    });

    test('WhenArrowLeftAndArrowRightPressed_ShouldCancelHorizontalMovement', () => {
      input.keysPressed.add('ArrowLeft');
      input.keysPressed.add('ArrowRight');
      input.updateMovement();

      expect(input.inputState.moveX).toBe(0);
    });

    test('WhenWASDAndArrowKeysPressed_ShouldCombineMovement', () => {
      input.keysPressed.add('KeyW');
      input.keysPressed.add('ArrowRight');
      input.updateMovement();

      // When both WASD and arrow keys are pressed, they combine
      // W gives y=-1, ArrowRight gives x=1
      // This creates diagonal movement that gets normalized
      expect(input.inputState.moveX).toBeCloseTo(0.7071067811865475, 5);
      expect(input.inputState.moveY).toBeCloseTo(-0.7071067811865475, 5);

      // Verify diagonal movement is normalized to magnitude 1
      const magnitude = Math.sqrt(
        input.inputState.moveX ** 2 + input.inputState.moveY ** 2
      );
      expect(magnitude).toBeCloseTo(1, 5);
    });
  });

  describe('handleMouseMove', () => {
    beforeEach(() => {
      input.init(mockCallback);

      // Mock canvas element
      const mockCanvas = document.createElement('canvas');
      mockCanvas.id = 'game-canvas';
      mockCanvas.getBoundingClientRect = jest.fn(() => ({
        left: 100,
        top: 50,
        right: 900,
        bottom: 650,
        width: 800,
        height: 600,
      }));
      document.body.appendChild(mockCanvas);
    });

    afterEach(() => {
      const canvas = document.getElementById('game-canvas');
      if (canvas) {
        canvas.remove();
      }
    });

    test('WhenMouseMoved_ShouldUpdateAimPosition', () => {
      const event = new MouseEvent('mousemove', {
        clientX: 200,
        clientY: 150,
      });
      input.handleMouseMove(event);

      expect(input.inputState.aimX).toBe(100); // 200 - 100 (rect.left)
      expect(input.inputState.aimY).toBe(100); // 150 - 50 (rect.top)
    });

    test('WhenMouseMoved_ShouldCallCallback', () => {
      mockCallback.mockClear();
      const event = new MouseEvent('mousemove', {
        clientX: 200,
        clientY: 150,
      });
      input.handleMouseMove(event);

      expect(mockCallback).toHaveBeenCalled();
    });

    test('WhenCanvasNotFound_ShouldNotThrowError', () => {
      const canvas = document.getElementById('game-canvas');
      canvas.remove();

      const event = new MouseEvent('mousemove', {
        clientX: 200,
        clientY: 150,
      });

      expect(() => input.handleMouseMove(event)).not.toThrow();
    });
  });

  describe('handleMouseDown', () => {
    beforeEach(() => {
      input.init(mockCallback);
    });

    test('WhenLeftMouseButtonPressed_ShouldSetAttackTrue', () => {
      const event = new MouseEvent('mousedown', { button: 0 });
      input.handleMouseDown(event);

      expect(input.inputState.attack).toBe(true);
    });

    test('WhenRightMouseButtonPressed_ShouldNotSetAttackTrue', () => {
      const event = new MouseEvent('mousedown', { button: 2 });
      input.handleMouseDown(event);

      expect(input.inputState.attack).toBe(false);
    });

    test('WhenMousePressed_ShouldCallCallback', () => {
      mockCallback.mockClear();
      const event = new MouseEvent('mousedown', { button: 0 });
      input.handleMouseDown(event);

      expect(mockCallback).toHaveBeenCalled();
    });
  });

  describe('handleMouseUp', () => {
    beforeEach(() => {
      input.init(mockCallback);
    });

    test('WhenLeftMouseButtonReleased_ShouldSetAttackFalse', () => {
      input.inputState.attack = true;

      const event = new MouseEvent('mouseup', { button: 0 });
      input.handleMouseUp(event);

      expect(input.inputState.attack).toBe(false);
    });

    test('WhenMouseReleased_ShouldCallCallback', () => {
      mockCallback.mockClear();
      const event = new MouseEvent('mouseup', { button: 0 });
      input.handleMouseUp(event);

      expect(mockCallback).toHaveBeenCalled();
    });
  });

  describe('notifyChange', () => {
    beforeEach(() => {
      input.init(mockCallback);
    });

    test('WhenCallbackSet_ShouldCallWithInputState', () => {
      mockCallback.mockClear();
      input.notifyChange();

      expect(mockCallback).toHaveBeenCalledWith(input.inputState);
    });

    test('WhenNoCallback_ShouldNotThrowError', () => {
      input.onInputChange = null;
      expect(() => input.notifyChange()).not.toThrow();
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      input.init(mockCallback);
    });

    test('WhenDestroyed_ShouldRemoveAllEventListeners', () => {
      const mockGameScreen = document.createElement('div');
      mockGameScreen.id = 'game-screen';
      const mockTouchControls = document.createElement('div');
      mockTouchControls.id = 'touch-controls';
      const mockJoystickBase = document.createElement('div');
      mockJoystickBase.id = 'joystick-base';
      const mockJoystickStick = document.createElement('div');
      mockJoystickStick.id = 'joystick-stick';

      document.body.appendChild(mockGameScreen);
      document.body.appendChild(mockTouchControls);
      document.body.appendChild(mockJoystickBase);
      document.body.appendChild(mockJoystickStick);

      // Re-init to attach to the new mockGameScreen
      input.init(mockCallback);

      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      const screenRemoveEventListenerSpy = jest.spyOn(mockGameScreen, 'removeEventListener');
      
      input.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', input.boundHandlers.keydown);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keyup', input.boundHandlers.keyup);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', input.boundHandlers.mousemove);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', input.boundHandlers.mousedown);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', input.boundHandlers.mouseup);

      expect(screenRemoveEventListenerSpy).toHaveBeenCalledWith('touchstart', input.boundHandlers.touchstart);

      removeEventListenerSpy.mockRestore();
      mockGameScreen.remove();
      mockTouchControls.remove();
      mockJoystickBase.remove();
      mockJoystickStick.remove();
    });

    test('WhenDestroyedMultipleTimes_ShouldNotThrowError', () => {
      expect(() => {
        input.destroy();
        input.destroy();
      }).not.toThrow();
    });
  });

  describe('Touch Controls - Initialization', () => {
    test('WhenConstructed_ShouldInitializeTouchState', () => {
      expect(input.touchState).toBeDefined();
      expect(input.touchState.active).toBe(false);
      expect(input.touchState.startX).toBe(0);
      expect(input.touchState.startY).toBe(0);
      expect(input.touchState.currentX).toBe(0);
      expect(input.touchState.currentY).toBe(0);
    });

    test('WhenInitialized_ShouldSetupTouchElements', () => {
      // Mock touch control elements
      const mockJoystickBase = document.createElement('div');
      mockJoystickBase.id = 'joystick-base';
      const mockJoystickStick = document.createElement('div');
      mockJoystickStick.id = 'joystick-stick';
      const mockTouchControls = document.createElement('div');
      mockTouchControls.id = 'touch-controls';
      const mockAttackButton = document.createElement('button');
      mockAttackButton.id = 'attack-button';
      const mockAbilityButton = document.createElement('button');
      mockAbilityButton.id = 'ability-button';

      document.body.appendChild(mockJoystickBase);
      document.body.appendChild(mockJoystickStick);
      document.body.appendChild(mockTouchControls);
      document.body.appendChild(mockAttackButton);
      document.body.appendChild(mockAbilityButton);

      input.init(mockCallback);

      expect(input.joystickBase).toBe(mockJoystickBase);
      expect(input.joystickStick).toBe(mockJoystickStick);
      expect(input.touchControls).toBe(mockTouchControls);
      expect(input.attackButton).toBe(mockAttackButton);
      expect(input.abilityButton).toBe(mockAbilityButton);

      // Cleanup
      mockJoystickBase.remove();
      mockJoystickStick.remove();
      mockTouchControls.remove();
      mockAttackButton.remove();
      mockAbilityButton.remove();
    });
  });

  describe('Touch Controls - Joystick Movement', () => {
    let mockCanvas;
    let mockGameScreen;
    let mockTouchControls;
    let mockJoystickBase;
    let mockJoystickStick;

    beforeEach(() => {
      // Setup DOM elements
      mockCanvas = document.createElement('canvas');
      mockCanvas.id = 'game-canvas';
      mockCanvas.getBoundingClientRect = jest.fn(() => ({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
      }));

      mockGameScreen = document.createElement('div');
      mockGameScreen.id = 'game-screen';

      mockTouchControls = document.createElement('div');
      mockTouchControls.id = 'touch-controls';
      mockTouchControls.style.opacity = '0';
      mockTouchControls.style.left = '0px';
      mockTouchControls.style.top = '0px';

      mockJoystickBase = document.createElement('div');
      mockJoystickBase.id = 'joystick-base';

      mockJoystickStick = document.createElement('div');
      mockJoystickStick.id = 'joystick-stick';

      document.body.appendChild(mockGameScreen);
      mockGameScreen.appendChild(mockCanvas);
      document.body.appendChild(mockTouchControls);
      document.body.appendChild(mockJoystickBase);
      document.body.appendChild(mockJoystickStick);

      input.init(mockCallback);
    });

    afterEach(() => {
      mockGameScreen.remove();
      mockTouchControls.remove();
      mockJoystickBase.remove();
      mockJoystickStick.remove();
    });

    test('WhenTouchStart_ShouldActivateTouchState', () => {
      const touch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 100,
        clientY: 200,
      });
      const event = new TouchEvent('touchstart', {
        touches: [touch],
        cancelable: true,
      });

      input.handleTouchStart(event);

      expect(input.touchState.active).toBe(true);
      expect(input.touchState.startX).toBe(100);
      expect(input.touchState.startY).toBe(200);
    });

    test('WhenTouchStart_ShouldPositionJoystickAtTouchLocation', () => {
      const touch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 100,
        clientY: 200,
      });
      const event = new TouchEvent('touchstart', {
        touches: [touch],
        cancelable: true,
      });

      input.handleTouchStart(event);

      expect(mockTouchControls.style.left).toBe('100px');
      expect(mockTouchControls.style.top).toBe('200px');
      expect(mockTouchControls.style.opacity).toBe('1');
    });

    test('WhenTouchMove_ShouldUpdateTouchState', () => {
      // Start touch
      const startTouch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 100,
        clientY: 200,
      });
      const startEvent = new TouchEvent('touchstart', {
        touches: [startTouch],
        cancelable: true,
      });
      input.handleTouchStart(startEvent);

      // Move touch
      const moveTouch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 120,
        clientY: 230,
      });
      const moveEvent = new TouchEvent('touchmove', {
        touches: [moveTouch],
        cancelable: true,
      });
      input.handleTouchMove(moveEvent);

      expect(input.touchState.currentX).toBe(120);
      expect(input.touchState.currentY).toBe(230);
    });

    test('WhenTouchMoveWithinMaxDistance_ShouldUpdateInputState', () => {
      // Start touch at (100, 200)
      const startTouch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 100,
        clientY: 200,
      });
      const startEvent = new TouchEvent('touchstart', {
        touches: [startTouch],
        cancelable: true,
      });
      input.handleTouchStart(startEvent);

      // Move 30px right, 20px down
      const moveTouch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 130,
        clientY: 220,
      });
      const moveEvent = new TouchEvent('touchmove', {
        touches: [moveTouch],
        cancelable: true,
      });
      input.handleTouchMove(moveEvent);

      // Movement should be normalized to -1 to 1 range
      expect(input.inputState.moveX).toBeGreaterThan(0);
      expect(input.inputState.moveY).toBeGreaterThan(0);
      expect(Math.abs(input.inputState.moveX)).toBeLessThanOrEqual(1);
      expect(Math.abs(input.inputState.moveY)).toBeLessThanOrEqual(1);
    });

    test('WhenTouchMoveBeyondMaxDistance_ShouldClampToMaxDistance', () => {
      const MAX_JOYSTICK_DISTANCE = 45;

      // Start touch
      const startTouch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 100,
        clientY: 200,
      });
      const startEvent = new TouchEvent('touchstart', {
        touches: [startTouch],
        cancelable: true,
      });
      input.handleTouchStart(startEvent);

      // Move 100px right (beyond max distance)
      const moveTouch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 200,
        clientY: 200,
      });
      const moveEvent = new TouchEvent('touchmove', {
        touches: [moveTouch],
        cancelable: true,
      });
      input.handleTouchMove(moveEvent);

      // Movement should be clamped to max values (-1 or 1)
      expect(Math.abs(input.inputState.moveX)).toBe(1);
    });

    test('WhenTouchEnd_ShouldDeactivateTouchState', () => {
      // Start touch
      const startTouch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 100,
        clientY: 200,
      });
      const startEvent = new TouchEvent('touchstart', {
        touches: [startTouch],
        cancelable: true,
      });
      input.handleTouchStart(startEvent);

      // End touch
      const endEvent = new TouchEvent('touchend', {
        cancelable: true,
      });
      input.handleTouchEnd(endEvent);

      expect(input.touchState.active).toBe(false);
      expect(input.inputState.moveX).toBe(0);
      expect(input.inputState.moveY).toBe(0);
    });

    test('WhenTouchEnd_ShouldHideJoystick', () => {
      // Start touch
      const startTouch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 100,
        clientY: 200,
      });
      const startEvent = new TouchEvent('touchstart', {
        touches: [startTouch],
        cancelable: true,
      });
      input.handleTouchStart(startEvent);

      // End touch
      const endEvent = new TouchEvent('touchend', {
        cancelable: true,
      });
      input.handleTouchEnd(endEvent);

      expect(mockTouchControls.style.opacity).toBe('0');
    });

    test('WhenSecondaryTouchEnds_ShouldNotDeactivateJoystickIfPrimaryTouchStillActive', () => {
      // Helper to create mock TouchEvents with proper property definitions
      const createMockTouchEvent = (type, touches = [], changedTouches = []) => {
        const event = new TouchEvent(type, { cancelable: true });
        Object.defineProperty(event, 'touches', { value: touches });
        Object.defineProperty(event, 'changedTouches', { value: changedTouches });
        return event;
      };

      // Start primary touch (joystick)
      const primaryTouch = {
        identifier: 10,
        target: mockCanvas,
        clientX: 100,
        clientY: 200,
      };
      
      const startEvent = createMockTouchEvent('touchstart', [primaryTouch], [primaryTouch]);
      input.handleTouchStart(startEvent);
      
      expect(input.touchState.active).toBe(true);
      expect(input.touchState.joystickTouchId).toBe(10);

      // Move primary touch to set movement
      const movedPrimaryTouch = {
        identifier: 10,
        target: mockCanvas,
        clientX: 150,
        clientY: 200,
      };
      
      const moveEvent = createMockTouchEvent('touchmove', [movedPrimaryTouch], []);
      input.handleTouchMove(moveEvent);
      
      expect(input.inputState.moveX).toBeGreaterThan(0);

      // Start secondary touch
      const secondaryTouch = {
        identifier: 20,
        target: mockCanvas,
        clientX: 300,
        clientY: 400,
      };
      
      const secondaryStartEvent = createMockTouchEvent(
        'touchstart', 
        [primaryTouch, secondaryTouch], 
        [secondaryTouch]
      );
      input.handleTouchStart(secondaryStartEvent);

      // End secondary touch (primary is still in 'touches')
      const secondaryEndEvent = createMockTouchEvent(
        'touchend', 
        [primaryTouch], 
        [secondaryTouch]
      );
      input.handleTouchEnd(secondaryEndEvent);

      // ASSERT: Joystick should still be active!
      expect(input.touchState.active).toBe(true);
      expect(input.touchState.joystickTouchId).toBe(10);
      expect(input.inputState.moveX).not.toBe(0);
    });
  });

  describe('Touch Controls - Attack and Ability Buttons', () => {
    let mockAttackButton;
    let mockAbilityButton;

    beforeEach(() => {
      mockAttackButton = document.createElement('button');
      mockAttackButton.id = 'attack-button';
      mockAbilityButton = document.createElement('button');
      mockAbilityButton.id = 'ability-button';

      document.body.appendChild(mockAttackButton);
      document.body.appendChild(mockAbilityButton);

      input.init(mockCallback);
    });

    afterEach(() => {
      mockAttackButton.remove();
      mockAbilityButton.remove();
    });

    test('WhenAttackButtonTouchStart_ShouldSetAttackTrue', () => {
      const touch = new Touch({
        identifier: 0,
        target: mockAttackButton,
        clientX: 0,
        clientY: 0,
      });
      const event = new TouchEvent('touchstart', {
        touches: [touch],
        cancelable: true,
      });

      input.handleAttackButtonTouchStart(event);

      expect(input.inputState.attack).toBe(true);
    });

    test('WhenAttackButtonTouchEnd_ShouldSetAttackFalse', () => {
      input.inputState.attack = true;

      const event = new TouchEvent('touchend', {
        cancelable: true,
      });

      input.handleAttackButtonTouchEnd(event);

      expect(input.inputState.attack).toBe(false);
    });

    test('WhenAbilityButtonTouchStart_ShouldSetSpecialAbilityTrue', () => {
      const touch = new Touch({
        identifier: 0,
        target: mockAbilityButton,
        clientX: 0,
        clientY: 0,
      });
      const event = new TouchEvent('touchstart', {
        touches: [touch],
        cancelable: true,
      });

      input.handleAbilityButtonTouchStart(event);

      expect(input.inputState.specialAbility).toBe(true);
    });

    test('WhenAbilityButtonTouchEnd_ShouldSetSpecialAbilityFalse', () => {
      input.inputState.specialAbility = true;

      const event = new TouchEvent('touchend', {
        cancelable: true,
      });

      input.handleAbilityButtonTouchEnd(event);

      expect(input.inputState.specialAbility).toBe(false);
    });

    test('WhenCycleWeaponButtonTouchStart_ShouldEmitCycleWeaponEvent', () => {
      const mockCycleWeaponButton = document.createElement('button');
      mockCycleWeaponButton.id = 'cycle-weapon-button';
      document.body.appendChild(mockCycleWeaponButton);

      input.init(mockCallback);
      const emitSpy = jest.spyOn(input, 'emit');

      const touch = new Touch({
        identifier: 0,
        target: mockCycleWeaponButton,
        clientX: 0,
        clientY: 0,
      });
      const event = new TouchEvent('touchstart', {
        touches: [touch],
        cancelable: true,
      });

      input.handleCycleWeaponButtonTouchStart(event);

      expect(emitSpy).toHaveBeenCalledWith('cycle_weapon');

      mockCycleWeaponButton.remove();
      emitSpy.mockRestore();
    });
  });

  describe('Touch Controls - Touch Priority Over Keyboard', () => {
    let mockCanvas;
    let mockTouchControls;
    let mockJoystickBase;
    let mockJoystickStick;

    beforeEach(() => {
      mockCanvas = document.createElement('canvas');
      mockCanvas.id = 'game-canvas';
      mockCanvas.getBoundingClientRect = jest.fn(() => ({
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
      }));

      mockTouchControls = document.createElement('div');
      mockTouchControls.id = 'touch-controls';
      mockTouchControls.style.opacity = '0';

      mockJoystickBase = document.createElement('div');
      mockJoystickBase.id = 'joystick-base';

      mockJoystickStick = document.createElement('div');
      mockJoystickStick.id = 'joystick-stick';

      document.body.appendChild(mockCanvas);
      document.body.appendChild(mockTouchControls);
      document.body.appendChild(mockJoystickBase);
      document.body.appendChild(mockJoystickStick);

      input.init(mockCallback);
    });

    afterEach(() => {
      mockCanvas.remove();
      mockTouchControls.remove();
      mockJoystickBase.remove();
      mockJoystickStick.remove();
    });

    test('WhenTouchActive_ShouldOverrideKeyboardInput', () => {
      // Press keyboard keys
      const keyEvent = new KeyboardEvent('keydown', { code: 'KeyW' });
      input.handleKeyDown(keyEvent);

      // Verify keyboard sets movement
      expect(input.inputState.moveY).toBe(-1);

      // Start touch
      const touch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 100,
        clientY: 200,
      });
      const touchStartEvent = new TouchEvent('touchstart', {
        touches: [touch],
        cancelable: true,
      });
      input.handleTouchStart(touchStartEvent);

      // Move touch to the right (positive X)
      const moveTouch = new Touch({
        identifier: 0,
        target: mockCanvas,
        clientX: 130,
        clientY: 200,
      });
      const touchMoveEvent = new TouchEvent('touchmove', {
        touches: [moveTouch],
        cancelable: true,
      });
      input.handleTouchMove(touchMoveEvent);

      // Touch should override keyboard - moveX should be positive from touch
      expect(input.inputState.moveX).toBeGreaterThan(0);
    });
  });

  describe('Touch Controls - Device Detection', () => {
    test('WhenDetectTouchDevice_ShouldCheckForTouchCapability', () => {
      const result = input.detectTouchDevice();

      // Result should be a boolean
      expect(typeof result).toBe('boolean');
    });

    test('WhenTouchDeviceDetected_ShouldShowTouchControls', () => {
      const mockTouchControls = document.createElement('div');
      mockTouchControls.id = 'touch-controls';
      mockTouchControls.style.display = 'none';

      document.body.appendChild(mockTouchControls);

      // Mock touch device
      Object.defineProperty(window, 'ontouchstart', {
        writable: true,
        value: true,
      });

      input.init(mockCallback);
      input.detectTouchDevice();

      // Touch controls should be displayed
      expect(mockTouchControls.style.display).not.toBe('none');

      // Cleanup
      mockTouchControls.remove();
      delete window.ontouchstart;
    });
  });
});