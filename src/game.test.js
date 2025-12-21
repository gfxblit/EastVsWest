import { jest } from '@jest/globals';
/**
 * Game Logic Tests
 * Unit tests for game.js following TDD workflow
 */

import { Game } from './game.js';
import { CONFIG } from './config.js';

describe('Game', () => {
  let game;

  beforeEach(() => {
    game = new Game();
  });

  describe('Constructor', () => {
    test('WhenConstructed_ShouldInitializeStateWithDefaults', () => {
      expect(game.state).toBeDefined();
      expect(game.state.players).toEqual([]);
      expect(game.state.loot).toEqual([]);
      expect(game.state.gameTime).toBe(0);
      expect(game.state.phase).toBe(0);
      expect(game.state.isRunning).toBe(false);
    });

    test('WhenConstructed_ShouldInitializeConflictZoneWithCenterAndRadius', () => {
      expect(game.state.conflictZone).toBeDefined();
      expect(game.state.conflictZone.centerX).toBe(CONFIG.CANVAS.WIDTH / 2);
      expect(game.state.conflictZone.centerY).toBe(CONFIG.CANVAS.HEIGHT / 2);
      expect(game.state.conflictZone.radius).toBe(CONFIG.ZONE.INITIAL_RADIUS);
    });
  });

  describe('init', () => {
    test('WhenInitialized_ShouldSetIsRunningToTrue', () => {
      game.init();
      expect(game.state.isRunning).toBe(true);
    });

    test('WhenInitialized_ShouldCreateTestPlayer', () => {
      game.init();
      expect(game.state.players.length).toBe(1);
      expect(game.state.players[0].id).toBe('player-1');
      expect(game.state.players[0].health).toBe(100);
      expect(game.state.players[0].weapon).toBeNull();
      expect(game.state.players[0].armor).toBeNull();
    });

    test('WhenInitialized_ShouldSpawnPlayerAtCenterOfCanvas', () => {
      game.init();
      const player = game.state.players[0];
      expect(player.x).toBe(CONFIG.CANVAS.WIDTH / 2);
      expect(player.y).toBe(CONFIG.CANVAS.HEIGHT / 2);
    });
  });

  describe('update', () => {
    test('WhenNotRunning_ShouldNotUpdateGameTime', () => {
      game.state.isRunning = false;
      const initialTime = game.state.gameTime;
      game.update(0.016);
      expect(game.state.gameTime).toBe(initialTime);
    });

    test('WhenRunning_ShouldUpdateGameTime', () => {
      game.state.isRunning = true;
      game.update(0.016);
      expect(game.state.gameTime).toBe(0.016);
    });

    test('WhenRunning_ShouldCallUpdateConflictZone', () => {
      game.state.isRunning = true;
      const spy = jest.spyOn(game, 'updateConflictZone');
      game.update(0.016);
      expect(spy).toHaveBeenCalledWith(0.016);
    });

    test('WhenRunning_ShouldCallUpdatePlayers', () => {
      game.state.isRunning = true;
      const spy = jest.spyOn(game, 'updatePlayers');
      game.update(0.016);
      expect(spy).toHaveBeenCalledWith(0.016);
    });
  });

  describe('updateConflictZone', () => {
    test('WhenBeforeInitialDelay_ShouldNotShrinkZone', () => {
      game.state.isRunning = true;
      game.state.gameTime = 30; // 30 seconds
      const initialRadius = game.state.conflictZone.radius;
      game.updateConflictZone(0.016);
      expect(game.state.conflictZone.radius).toBe(initialRadius);
    });

    test('WhenAfterInitialDelay_ShouldShrinkZone', () => {
      game.state.isRunning = true;
      game.state.gameTime = CONFIG.GAME.INITIAL_ZONE_SHRINK_DELAY_SECONDS + 1;
      const initialRadius = game.state.conflictZone.radius;
      game.updateConflictZone(1);
      expect(game.state.conflictZone.radius).toBeLessThan(initialRadius);
    });

    test('WhenShrinking_ShouldNotGoBelowMinimumRadius', () => {
      game.state.isRunning = true;
      game.state.gameTime = CONFIG.GAME.INITIAL_ZONE_SHRINK_DELAY_SECONDS + 1;
      game.state.conflictZone.radius = CONFIG.ZONE.MIN_RADIUS || 50;

      // Shrink for a long time
      for (let i = 0; i < 100; i++) {
        game.updateConflictZone(1);
      }

      expect(game.state.conflictZone.radius).toBe(CONFIG.ZONE.MIN_RADIUS || 50);
    });

    test('WhenInHigherPhase_ShouldShrinkFaster', () => {
      game.state.isRunning = true;
      game.state.gameTime = CONFIG.GAME.INITIAL_ZONE_SHRINK_DELAY_SECONDS + 1;

      // Phase 0
      game.state.phase = 0;
      const phase0Radius = game.state.conflictZone.radius;
      game.updateConflictZone(1);
      const phase0Shrink = phase0Radius - game.state.conflictZone.radius;

      // Reset and test Phase 1
      game.state.conflictZone.radius = phase0Radius;
      game.state.phase = 1;
      game.updateConflictZone(1);
      const phase1Shrink = phase0Radius - game.state.conflictZone.radius;

      expect(phase1Shrink).toBeGreaterThan(phase0Shrink);
    });
  });

  describe('updatePlayers', () => {
    beforeEach(() => {
      game.init();
    });

    test('WhenPlayerHasVelocity_ShouldUpdatePosition', () => {
      const player = game.state.players[0];
      player.velocity = { x: 100, y: 50 };
      const initialX = player.x;
      const initialY = player.y;

      game.updatePlayers(0.1); // 0.1 seconds

      expect(player.x).toBe(initialX + 10); // 100 * 0.1
      expect(player.y).toBe(initialY + 5); // 50 * 0.1
    });

    test('WhenPlayerMovesOutOfBounds_ShouldClampToCanvasWidth', () => {
      const player = game.state.players[0];
      player.x = CONFIG.CANVAS.WIDTH - 10;
      player.velocity = { x: 200, y: 0 };

      game.updatePlayers(1); // Move way beyond bounds

      expect(player.x).toBe(CONFIG.CANVAS.WIDTH);
    });

    test('WhenPlayerMovesOutOfBounds_ShouldClampToMinimumX', () => {
      const player = game.state.players[0];
      player.x = 10;
      player.velocity = { x: -200, y: 0 };

      game.updatePlayers(1);

      expect(player.x).toBe(0);
    });

    test('WhenPlayerMovesOutOfBounds_ShouldClampToCanvasHeight', () => {
      const player = game.state.players[0];
      player.y = CONFIG.CANVAS.HEIGHT - 10;
      player.velocity = { x: 0, y: 200 };

      game.updatePlayers(1);

      expect(player.y).toBe(CONFIG.CANVAS.HEIGHT);
    });

    test('WhenPlayerMovesOutOfBounds_ShouldClampToMinimumY', () => {
      const player = game.state.players[0];
      player.y = 10;
      player.velocity = { x: 0, y: -200 };

      game.updatePlayers(1);

      expect(player.y).toBe(0);
    });

    test('WhenPlayerOutsideZone_ShouldTakeDamage', () => {
      const player = game.state.players[0];
      player.health = 100;

      // Place player far outside zone
      player.x = 0;
      player.y = 0;
      game.state.conflictZone.centerX = CONFIG.CANVAS.WIDTH / 2;
      game.state.conflictZone.centerY = CONFIG.CANVAS.HEIGHT / 2;
      game.state.conflictZone.radius = 10; // Very small zone

      game.updatePlayers(1); // 1 second

      const expectedDamage = CONFIG.ZONE.DAMAGE_PER_SECOND +
        (CONFIG.ZONE.DAMAGE_INCREASE_PER_PHASE * game.state.phase);
      expect(player.health).toBe(100 - expectedDamage);
    });

    test('WhenPlayerInsideZone_ShouldNotTakeDamage', () => {
      const player = game.state.players[0];
      player.health = 100;

      // Place player at center of zone
      player.x = game.state.conflictZone.centerX;
      player.y = game.state.conflictZone.centerY;

      game.updatePlayers(1);

      expect(player.health).toBe(100);
    });

    test('WhenPlayerOutsideZoneInHigherPhase_ShouldTakeMoreDamage', () => {
      const player = game.state.players[0];

      // Place player outside zone
      player.x = 0;
      player.y = 0;
      game.state.conflictZone.radius = 10;

      // Test Phase 0
      game.state.phase = 0;
      player.health = 100;
      game.updatePlayers(1);
      const phase0Damage = 100 - player.health;

      // Test Phase 2
      game.state.phase = 2;
      player.health = 100;
      game.updatePlayers(1);
      const phase2Damage = 100 - player.health;

      expect(phase2Damage).toBeGreaterThan(phase0Damage);
    });
  });

  describe('handleInput', () => {
    beforeEach(() => {
      game.init();
    });

    test('WhenNoPlayer_ShouldNotThrowError', () => {
      game.state.players = [];
      const inputState = { moveX: 1, moveY: 0 };

      expect(() => game.handleInput(inputState)).not.toThrow();
    });

    test('WhenInputProvided_ShouldUpdatePlayerVelocity', () => {
      const inputState = { moveX: 1, moveY: 0 };
      game.handleInput(inputState);

      const player = game.state.players[0];
      expect(player.velocity.x).toBe(CONFIG.PLAYER.BASE_MOVEMENT_SPEED);
      expect(player.velocity.y).toBe(0);
    });

    test('WhenPlayerHasDoubleHandedWeapon_ShouldApplySpeedModifier', () => {
      const player = game.state.players[0];
      player.weapon = { stance: 'double' };

      const inputState = { moveX: 1, moveY: 0 };
      game.handleInput(inputState);

      const expectedSpeed = CONFIG.PLAYER.BASE_MOVEMENT_SPEED *
        CONFIG.PLAYER.DOUBLE_HANDED_SPEED_MODIFIER;
      expect(player.velocity.x).toBe(expectedSpeed);
    });

    test('WhenPlayerHasSingleHandedWeapon_ShouldNotApplySpeedModifier', () => {
      const player = game.state.players[0];
      player.weapon = { stance: 'single' };

      const inputState = { moveX: 1, moveY: 0 };
      game.handleInput(inputState);

      expect(player.velocity.x).toBe(CONFIG.PLAYER.BASE_MOVEMENT_SPEED);
    });

    test('WhenDiagonalInput_ShouldMaintainSpeed', () => {
      const inputState = { moveX: 1, moveY: 1 };
      game.handleInput(inputState);

      const player = game.state.players[0];
      const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);
      expect(speed).toBeCloseTo(CONFIG.PLAYER.BASE_MOVEMENT_SPEED, 1);
    });
  });

  describe('getState', () => {
    test('WhenCalled_ShouldReturnGameState', () => {
      const state = game.getState();
      expect(state).toBe(game.state);
    });
  });
});