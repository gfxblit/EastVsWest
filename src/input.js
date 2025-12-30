/**
 * Input Handler
 * Manages keyboard, mouse, and touch input
 */

import { CONFIG } from './config.js';

export class Input {
  constructor() {
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

  setupTouchControls() {
    // Get touch UI elements
    this.touchControls = document.getElementById('touch-controls');
    this.joystickBase = document.getElementById('joystick-base');
    this.joystickStick = document.getElementById('joystick-stick');
    this.attackButton = document.getElementById('attack-button');
    this.abilityButton = document.getElementById('ability-button');

    if (!this.touchControls || !this.joystickBase || !this.joystickStick) {
      return;
    }

    // Bind touch event handlers
    this.boundHandlers.touchstart = this.handleTouchStart.bind(this);
    this.boundHandlers.touchmove = this.handleTouchMove.bind(this);
    this.boundHandlers.touchend = this.handleTouchEnd.bind(this);

    // Add touch event listeners to canvas
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.addEventListener('touchstart', this.boundHandlers.touchstart, { passive: false });
      canvas.addEventListener('touchmove', this.boundHandlers.touchmove, { passive: false });
      canvas.addEventListener('touchend', this.boundHandlers.touchend, { passive: false });
      canvas.addEventListener('touchcancel', this.boundHandlers.touchend, { passive: false });
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
  }

  handleTouchStart(event) {
    // Ignore if touch is on a button
    if (event.target && event.target.closest) {
      if (event.target.closest('#attack-button') || event.target.closest('#ability-button')) {
        return;
      }
    }

    event.preventDefault();
    const touch = event.touches[0];

    // Only activate joystick if not already active
    if (!this.touchState.active) {
      // Position joystick at touch location
      const canvas = document.getElementById('game-canvas');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();

      // Calculate position relative to canvas
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      // Position the joystick base at touch point
      if (this.touchControls) {
        this.touchControls.style.left = `${touch.clientX}px`;
        this.touchControls.style.top = `${touch.clientY}px`;
        this.touchControls.style.transform = 'translate(-50%, -50%)';
        this.touchControls.style.opacity = '1';
      }

      this.touchState.active = true;
      this.touchState.startX = touch.clientX;
      this.touchState.startY = touch.clientY;
      this.touchState.currentX = touch.clientX;
      this.touchState.currentY = touch.clientY;

      this.updateMovement();
    }
  }

  handleTouchMove(event) {
    event.preventDefault();
    if (!this.touchState.active) return;

    const touch = event.touches[0];
    this.touchState.currentX = touch.clientX;
    this.touchState.currentY = touch.clientY;

    this.updateMovement();
  }

  handleTouchEnd(event) {
    if (!this.touchState.active) return;

    event.preventDefault();
    this.touchState.active = false;
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
    const canvas = document.getElementById('game-canvas');
    if (canvas && this.boundHandlers.touchstart) {
      canvas.removeEventListener('touchstart', this.boundHandlers.touchstart);
      canvas.removeEventListener('touchmove', this.boundHandlers.touchmove);
      canvas.removeEventListener('touchend', this.boundHandlers.touchend);
      canvas.removeEventListener('touchcancel', this.boundHandlers.touchend);
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
  }
}
