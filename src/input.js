/**
 * Input Handler
 * Manages keyboard, mouse, and touch input
 */

import { CONFIG } from './config.js';

export class Input {
  constructor() {
    this.events = {};
    this.inputState = {
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      attack: false,
      specialAbility: false,
      interact: false,
    };

    this.keysPressed = new Set();
    this.boundHandlers = {};

    // Touch state
    this.touchState = {
      active: false,
      joystickTouchId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    };

    // Touch UI elements
    this.touchControls = null;
    this.joystickBase = null;
    this.joystickStick = null;
    this.attackButton = null;
    this.abilityButton = null;
    this.interactButton = null;
  }

  init(onInputChange) {
    this.onInputChange = onInputChange;

    // Bind event handlers
    this.boundHandlers.keydown = this.handleKeyDown.bind(this);
    this.boundHandlers.keyup = this.handleKeyUp.bind(this);
    this.boundHandlers.mousemove = this.handleMouseMove.bind(this);
    this.boundHandlers.mousedown = this.handleMouseDown.bind(this);
    this.boundHandlers.mouseup = this.handleMouseUp.bind(this);

    // Add event listeners
    window.addEventListener('keydown', this.boundHandlers.keydown);
    window.addEventListener('keyup', this.boundHandlers.keyup);
    window.addEventListener('mousemove', this.boundHandlers.mousemove);
    window.addEventListener('mousedown', this.boundHandlers.mousedown);
    window.addEventListener('mouseup', this.boundHandlers.mouseup);

    // Setup touch controls
    this.setupTouchControls();
    this.detectTouchDevice();
  }

  handleKeyDown(event) {
    const key = event.code;
    this.keysPressed.add(key);
    this.updateMovement();

    // Handle special keys
    if (key === CONFIG.INPUT.SPECIAL_ABILITY_KEY) {
      this.inputState.specialAbility = true;
      this.notifyChange();
    } else if (key === CONFIG.INPUT.INTERACT_KEY) {
      this.inputState.interact = true;
      this.notifyChange();
    }
  }

  handleKeyUp(event) {
    const key = event.code;
    this.keysPressed.delete(key);
    this.updateMovement();

    // Handle special keys
    if (key === CONFIG.INPUT.SPECIAL_ABILITY_KEY) {
      this.inputState.specialAbility = false;
      this.notifyChange();
    } else if (key === CONFIG.INPUT.INTERACT_KEY) {
      this.inputState.interact = false;
      this.notifyChange();
    }
  }

  updateMovement() {
    let moveX = 0;
    let moveY = 0;

    // Touch input overrides keyboard input
    if (this.touchState.active) {
      const deltaX = this.touchState.currentX - this.touchState.startX;
      const deltaY = this.touchState.currentY - this.touchState.startY;

      // Calculate distance from center
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > 0) {
        // Limit the joystick movement
        let normalizedDX = deltaX;
        let normalizedDY = deltaY;

        if (distance > CONFIG.INPUT.MAX_JOYSTICK_DISTANCE) {
          const angle = Math.atan2(deltaY, deltaX);
          normalizedDX = Math.cos(angle) * CONFIG.INPUT.MAX_JOYSTICK_DISTANCE;
          normalizedDY = Math.sin(angle) * CONFIG.INPUT.MAX_JOYSTICK_DISTANCE;
        }

        // Update joystick visual position
        if (this.joystickStick) {
          this.joystickStick.style.transform = `translate(calc(-50% + ${normalizedDX}px), calc(-50% + ${normalizedDY}px))`;
        }

        // Update touch state with normalized direction (-1 to 1)
        moveX = normalizedDX / CONFIG.INPUT.MAX_JOYSTICK_DISTANCE;
        moveY = normalizedDY / CONFIG.INPUT.MAX_JOYSTICK_DISTANCE;
      }
    } else {
      // Check WASD keys
      for (const [key, direction] of Object.entries(CONFIG.INPUT.KEYBOARD_MOVE_KEYS)) {
        if (this.keysPressed.has(key)) {
          moveX += direction.x;
          moveY += direction.y;
        }
      }

      // Normalize diagonal movement
      if (moveX !== 0 && moveY !== 0) {
        const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
        moveX /= magnitude;
        moveY /= magnitude;
      }
    }

    this.inputState.moveX = moveX;
    this.inputState.moveY = moveY;
    this.notifyChange();
  }

  handleMouseMove(event) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    this.inputState.aimX = event.clientX - rect.left;
    this.inputState.aimY = event.clientY - rect.top;
    this.notifyChange();
  }

  handleMouseDown(event) {
    if (event.button === 0) {
      // Left mouse button
      this.inputState.attack = true;
      this.notifyChange();
    }
  }

  handleMouseUp(event) {
    if (event.button === 0) {
      // Left mouse button
      this.inputState.attack = false;
      this.notifyChange();
    }
  }

  notifyChange() {
    if (this.onInputChange) {
      this.onInputChange(this.inputState);
    }
  }

  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(cb => cb(data));
    }
  }

  setupTouchControls() {
    // Get touch UI elements
    this.touchControls = document.getElementById('touch-controls');
    this.joystickBase = document.getElementById('joystick-base');
    this.joystickStick = document.getElementById('joystick-stick');
    this.attackButton = document.getElementById('attack-button');
    this.abilityButton = document.getElementById('ability-button');
    this.interactButton = document.getElementById('interact-button');

    if (!this.touchControls || !this.joystickBase || !this.joystickStick) {
      return;
    }

    // Bind touch event handlers
    this.boundHandlers.touchstart = this.handleTouchStart.bind(this);
    this.boundHandlers.touchmove = this.handleTouchMove.bind(this);
    this.boundHandlers.touchend = this.handleTouchEnd.bind(this);

    // Add touch event listeners to game-screen to catch touches anywhere
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) {
      gameScreen.addEventListener('touchstart', this.boundHandlers.touchstart, { passive: false });
      gameScreen.addEventListener('touchmove', this.boundHandlers.touchmove, { passive: false });
      gameScreen.addEventListener('touchend', this.boundHandlers.touchend, { passive: false });
      gameScreen.addEventListener('touchcancel', this.boundHandlers.touchend, { passive: false });
    }

    // Setup attack button
    if (this.attackButton) {
      this.boundHandlers.attackTouchStart = this.handleAttackButtonTouchStart.bind(this);
      this.boundHandlers.attackTouchEnd = this.handleAttackButtonTouchEnd.bind(this);

      this.attackButton.addEventListener('touchstart', this.boundHandlers.attackTouchStart, { passive: false });
      this.attackButton.addEventListener('touchend', this.boundHandlers.attackTouchEnd, { passive: false });
    }

    // Setup ability button
    if (this.abilityButton) {
      this.boundHandlers.abilityTouchStart = this.handleAbilityButtonTouchStart.bind(this);
      this.boundHandlers.abilityTouchEnd = this.handleAbilityButtonTouchEnd.bind(this);

      this.abilityButton.addEventListener('touchstart', this.boundHandlers.abilityTouchStart, { passive: false });
      this.abilityButton.addEventListener('touchend', this.boundHandlers.abilityTouchEnd, { passive: false });
    }

    // Setup interact button
    if (this.interactButton) {
      this.boundHandlers.interactTouchStart = this.handleInteractButtonTouchStart.bind(this);
      this.boundHandlers.interactTouchEnd = this.handleInteractButtonTouchEnd.bind(this);

      this.interactButton.addEventListener('touchstart', this.boundHandlers.interactTouchStart, { passive: false });
      this.interactButton.addEventListener('touchend', this.boundHandlers.interactTouchEnd, { passive: false });
    }

    // Setup cycle weapon button (debug)
    if (this.cycleWeaponButton) {
      this.boundHandlers.cycleWeaponTouchStart = this.handleCycleWeaponButtonTouchStart.bind(this);
      this.cycleWeaponButton.addEventListener('touchstart', this.boundHandlers.cycleWeaponTouchStart, { passive: false });
    }
  }

  /**
   * Checks if a touch event target is a UI button (attack/ability).
   * @param {Touch|Event} targetObj - The touch or event object to check.
   * @returns {boolean} - True if the touch is NOT on a button.
   */
  isValidJoystickTouch(targetObj) {
    if (targetObj.target && targetObj.target.closest) {
      // Don't start joystick if touch is on any button or UI element
      return !targetObj.target.closest('button') && 
             !targetObj.target.closest('.touch-btn') &&
             !targetObj.target.closest('#spectator-controls');
    }
    return true;
  }

  /**
   * Handles touch start events to activate the joystick.
   * @param {TouchEvent} event - The touch start event.
   */
  handleTouchStart(event) {
    // Ignore if touch is on a button
    if (!this.isValidJoystickTouch(event)) {
      return;
    }

    event.preventDefault();
    
    // Find a touch that isn't on a button to start the joystick
    const changedTouches = event.changedTouches || [];
    const touch = Array.from(changedTouches).find(t => this.isValidJoystickTouch(t)) || 
                  (event.touches && event.touches[0]);

    if (!touch) return;

    // Only activate joystick if not already active
    if (!this.touchState.active) {
      // Position joystick at touch location
      const canvas = document.getElementById('game-canvas');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();

      // Position the joystick base at touch point
      if (this.touchControls) {
        this.touchControls.style.left = `${touch.clientX}px`;
        this.touchControls.style.top = `${touch.clientY}px`;
        this.touchControls.style.transform = 'translate(-50%, -50%)';
        this.touchControls.style.opacity = '1';
      }

      this.touchState.active = true;
      this.touchState.joystickTouchId = touch.identifier;
      this.touchState.startX = touch.clientX;
      this.touchState.startY = touch.clientY;
      this.touchState.currentX = touch.clientX;
      this.touchState.currentY = touch.clientY;

      this.updateMovement();
    }
  }

  /**
   * Handles touch move events to update joystick position.
   * Only responds to the touch ID that activated the joystick.
   * @param {TouchEvent} event - The touch move event.
   */
  handleTouchMove(event) {
    event.preventDefault();
    if (!this.touchState.active) return;

    // Find the touch that started the joystick
    let touch = null;
    for (const t of event.touches) {
      if (t.identifier === this.touchState.joystickTouchId) {
        touch = t;
        break;
      }
    }
    
    if (!touch) return;

    this.touchState.currentX = touch.clientX;
    this.touchState.currentY = touch.clientY;

    this.updateMovement();
  }

  /**
   * Handles touch end events to deactivate the joystick.
   * Only deactivates if the specific joystick touch ended.
   * @param {TouchEvent} event - The touch end event.
   */
  handleTouchEnd(event) {
    if (!this.touchState.active) return;

    // Check if the joystick touch ended
    const changedTouches = event.changedTouches || [];
    let joystickTouchEnded = Array.from(changedTouches).some(t => t.identifier === this.touchState.joystickTouchId);
    
    // Fallback: if no touches remain, the joystick touch must have ended
    if (!joystickTouchEnded && event.touches && event.touches.length === 0) {
      joystickTouchEnded = true;
    }

    if (!joystickTouchEnded) {
      return;
    }

    event.preventDefault();
    this.touchState.active = false;
    this.touchState.joystickTouchId = null;
    this.touchState.currentX = this.touchState.startX;
    this.touchState.currentY = this.touchState.startY;

    // Reset joystick visual position
    if (this.joystickStick) {
      this.joystickStick.style.transform = 'translate(-50%, -50%)';
    }

    // Hide the joystick
    if (this.touchControls) {
      this.touchControls.style.opacity = '0';
    }

    // Reset movement
    this.inputState.moveX = 0;
    this.inputState.moveY = 0;
    this.notifyChange();
  }

  handleAttackButtonTouchStart(event) {
    event.preventDefault();
    this.inputState.attack = true;
    this.notifyChange();
  }

  handleAttackButtonTouchEnd(event) {
    event.preventDefault();
    this.inputState.attack = false;
    this.notifyChange();
  }

  handleAbilityButtonTouchStart(event) {
    event.preventDefault();
    this.inputState.specialAbility = true;
    this.notifyChange();
  }

  handleAbilityButtonTouchEnd(event) {
    event.preventDefault();
    this.inputState.specialAbility = false;
    this.notifyChange();
  }

  handleInteractButtonTouchStart(event) {
    event.preventDefault();
    this.inputState.interact = true;
    this.notifyChange();
  }

  handleInteractButtonTouchEnd(event) {
    event.preventDefault();
    this.inputState.interact = false;
    this.notifyChange();
  }

  detectTouchDevice() {
    const isTouchDevice = ('ontouchstart' in window) ||
                          (navigator.maxTouchPoints > 0) ||
                          (navigator.msMaxTouchPoints > 0);

    if (isTouchDevice || window.innerWidth <= 850) {
      if (this.touchControls) {
        this.touchControls.style.display = 'block';
      }
    }

    return isTouchDevice;
  }

  destroy() {
    // Remove event listeners
    window.removeEventListener('keydown', this.boundHandlers.keydown);
    window.removeEventListener('keyup', this.boundHandlers.keyup);
    window.removeEventListener('mousemove', this.boundHandlers.mousemove);
    window.removeEventListener('mousedown', this.boundHandlers.mousedown);
    window.removeEventListener('mouseup', this.boundHandlers.mouseup);

    // Remove touch event listeners
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen && this.boundHandlers.touchstart) {
      gameScreen.removeEventListener('touchstart', this.boundHandlers.touchstart);
      gameScreen.removeEventListener('touchmove', this.boundHandlers.touchmove);
      gameScreen.removeEventListener('touchend', this.boundHandlers.touchend);
      gameScreen.removeEventListener('touchcancel', this.boundHandlers.touchend);
    }

    // Remove button event listeners
    if (this.attackButton && this.boundHandlers.attackTouchStart) {
      this.attackButton.removeEventListener('touchstart', this.boundHandlers.attackTouchStart);
      this.attackButton.removeEventListener('touchend', this.boundHandlers.attackTouchEnd);
    }

    if (this.abilityButton && this.boundHandlers.abilityTouchStart) {
      this.abilityButton.removeEventListener('touchstart', this.boundHandlers.abilityTouchStart);
      this.abilityButton.removeEventListener('touchend', this.boundHandlers.abilityTouchEnd);
    }

    if (this.interactButton && this.boundHandlers.interactTouchStart) {
      this.interactButton.removeEventListener('touchstart', this.boundHandlers.interactTouchStart);
      this.interactButton.removeEventListener('touchend', this.boundHandlers.interactTouchEnd);
    }
  }
}
