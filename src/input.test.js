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
      const event = new KeyboardEvent('keydown', { key: 'w' });
      input.handleKeyDown(event);

      expect(input.inputState.moveY).toBe(-1);
    });

    test('WhenAKeyPressed_ShouldUpdateMoveX', () => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      input.handleKeyDown(event);

      expect(input.inputState.moveX).toBe(-1);
    });

    test('WhenSKeyPressed_ShouldUpdateMoveY', () => {
      const event = new KeyboardEvent('keydown', { key: 's' });
      input.handleKeyDown(event);

      expect(input.inputState.moveY).toBe(1);
    });

    test('WhenDKeyPressed_ShouldUpdateMoveX', () => {
      const event = new KeyboardEvent('keydown', { key: 'd' });
      input.handleKeyDown(event);

      expect(input.inputState.moveX).toBe(1);
    });

    test('WhenSpecialAbilityKeyPressed_ShouldSetSpecialAbilityTrue', () => {
      const event = new KeyboardEvent('keydown', { key: CONFIG.INPUT.SPECIAL_ABILITY_KEY });
      input.handleKeyDown(event);

      expect(input.inputState.specialAbility).toBe(true);
    });

    test('WhenInteractKeyPressed_ShouldSetInteractTrue', () => {
      const event = new KeyboardEvent('keydown', { key: CONFIG.INPUT.INTERACT_KEY });
      input.handleKeyDown(event);

      expect(input.inputState.interact).toBe(true);
    });

    test('WhenKeyPressed_ShouldAddToKeysPressed', () => {
      const event = new KeyboardEvent('keydown', { key: 'w' });
      input.handleKeyDown(event);

      expect(input.keysPressed.has('w')).toBe(true);
    });

    test('WhenKeyPressed_ShouldCallCallback', () => {
      const event = new KeyboardEvent('keydown', { key: 'w' });
      input.handleKeyDown(event);

      expect(mockCallback).toHaveBeenCalled();
    });

    test('WhenUppercaseKey_ShouldConvertToLowercase', () => {
      const event = new KeyboardEvent('keydown', { key: 'W' });
      input.handleKeyDown(event);

      expect(input.keysPressed.has('w')).toBe(true);
      expect(input.inputState.moveY).toBe(-1);
    });
  });

  describe('handleKeyUp', () => {
    beforeEach(() => {
      input.init(mockCallback);
    });

    test('WhenWKeyReleased_ShouldResetMoveY', () => {
      // Press W
      const downEvent = new KeyboardEvent('keydown', { key: 'w' });
      input.handleKeyDown(downEvent);

      // Release W
      const upEvent = new KeyboardEvent('keyup', { key: 'w' });
      input.handleKeyUp(upEvent);

      expect(input.inputState.moveY).toBe(0);
    });

    test('WhenSpecialAbilityKeyReleased_ShouldSetSpecialAbilityFalse', () => {
      const downEvent = new KeyboardEvent('keydown', { key: CONFIG.INPUT.SPECIAL_ABILITY_KEY });
      input.handleKeyDown(downEvent);

      const upEvent = new KeyboardEvent('keyup', { key: CONFIG.INPUT.SPECIAL_ABILITY_KEY });
      input.handleKeyUp(upEvent);

      expect(input.inputState.specialAbility).toBe(false);
    });

    test('WhenInteractKeyReleased_ShouldSetInteractFalse', () => {
      const downEvent = new KeyboardEvent('keydown', { key: CONFIG.INPUT.INTERACT_KEY });
      input.handleKeyDown(downEvent);

      const upEvent = new KeyboardEvent('keyup', { key: CONFIG.INPUT.INTERACT_KEY });
      input.handleKeyUp(upEvent);

      expect(input.inputState.interact).toBe(false);
    });

    test('WhenKeyReleased_ShouldRemoveFromKeysPressed', () => {
      const downEvent = new KeyboardEvent('keydown', { key: 'w' });
      input.handleKeyDown(downEvent);

      const upEvent = new KeyboardEvent('keyup', { key: 'w' });
      input.handleKeyUp(upEvent);

      expect(input.keysPressed.has('w')).toBe(false);
    });
  });

  describe('updateMovement', () => {
    beforeEach(() => {
      input.init(mockCallback);
    });

    test('WhenWAndDPressed_ShouldNormalizeDiagonalMovement', () => {
      input.keysPressed.add('w');
      input.keysPressed.add('d');
      input.updateMovement();

      const magnitude = Math.sqrt(
        input.inputState.moveX ** 2 + input.inputState.moveY ** 2
      );
      expect(magnitude).toBeCloseTo(1, 5);
    });

    test('WhenWAndSPressed_ShouldCancelVerticalMovement', () => {
      input.keysPressed.add('w');
      input.keysPressed.add('s');
      input.updateMovement();

      expect(input.inputState.moveY).toBe(0);
    });

    test('WhenAAndDPressed_ShouldCancelHorizontalMovement', () => {
      input.keysPressed.add('a');
      input.keysPressed.add('d');
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
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      input.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', input.boundHandlers.keydown);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keyup', input.boundHandlers.keyup);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', input.boundHandlers.mousemove);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', input.boundHandlers.mousedown);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', input.boundHandlers.mouseup);

      removeEventListenerSpy.mockRestore();
    });

    test('WhenDestroyedMultipleTimes_ShouldNotThrowError', () => {
      expect(() => {
        input.destroy();
        input.destroy();
      }).not.toThrow();
    });
  });
});
