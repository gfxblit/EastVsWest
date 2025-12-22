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
  }

  handleKeyDown(event) {
    const key = event.key.toLowerCase();
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
    const key = event.key.toLowerCase();
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

  destroy() {
    // Remove event listeners
    window.removeEventListener('keydown', this.boundHandlers.keydown);
    window.removeEventListener('keyup', this.boundHandlers.keyup);
    window.removeEventListener('mousemove', this.boundHandlers.mousemove);
    window.removeEventListener('mousedown', this.boundHandlers.mousedown);
    window.removeEventListener('mouseup', this.boundHandlers.mouseup);
  }
}
