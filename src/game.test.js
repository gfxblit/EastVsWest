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
      expect(game.state.loot).toEqual([]);
      expect(game.state.gameTime).toBe(0);
      expect(game.state.phase).toBe(0);
      expect(game.state.isRunning).toBe(false);
    });

    test('WhenConstructed_ShouldInitializeConflictZoneWithCenterAndRadius', () => {
      expect(game.state.conflictZone).toBeDefined();
      expect(game.state.conflictZone.centerX).toBe(CONFIG.WORLD.WIDTH / 2);
      expect(game.state.conflictZone.centerY).toBe(CONFIG.WORLD.HEIGHT / 2);
      expect(game.state.conflictZone.radius).toBe(CONFIG.ZONE.INITIAL_RADIUS);
    });

    test('WhenConstructed_ShouldNotHaveLocalPlayerYet', () => {
      expect(game.getLocalPlayer()).toBeUndefined();
    });
  });

  describe('init', () => {
    test('WhenInitializedWithoutSnapshot_ShouldSetIsRunningToTrue', () => {
      game.init();
      expect(game.state.isRunning).toBe(true);
    });

    test('WhenInitializedWithoutSnapshot_ShouldCreateTestPlayer', () => {
      game.init();
      const localPlayer = game.getLocalPlayer();
      expect(localPlayer).toBeDefined();
      expect(localPlayer.id).toBe('player-1');
      expect(localPlayer.health).toBe(100);
      expect(localPlayer.weapon).toBeNull();
      expect(localPlayer.armor).toBeNull();
    });

    test('WhenInitializedWithoutSnapshot_ShouldSpawnPlayerAtCenterOfWorld', () => {
      game.init();
      const localPlayer = game.getLocalPlayer();
      expect(localPlayer.x).toBe(CONFIG.WORLD.WIDTH / 2);
      expect(localPlayer.y).toBe(CONFIG.WORLD.HEIGHT / 2);
    });

    test('WhenInitializedWithSnapshot_ShouldLoadLocalPlayerFromSnapshot', () => {
      const mockSnapshot = {
        getPlayers: jest.fn().mockReturnValue(new Map([
          ['player-1', { 
            player_id: 'player-1', 
            player_name: 'Alice', 
            position_x: 100, 
            position_y: 200, 
            velocity_x: 10,
            velocity_y: 20,
            rotation: 0.5, 
            health: 90 
          }],
        ])),
      };
      const mockNetwork = { playerId: 'player-1', on: jest.fn() };

      game.init(mockSnapshot, mockNetwork);

      const localPlayer = game.getLocalPlayer();
      expect(localPlayer).toBeDefined();
      expect(localPlayer.id).toBe('player-1');
      expect(localPlayer.name).toBe('Alice');
      expect(localPlayer.x).toBe(100);
      expect(localPlayer.y).toBe(200);
      expect(localPlayer.velocity.x).toBe(10);
      expect(localPlayer.velocity.y).toBe(20);
      expect(localPlayer.rotation).toBe(0.5);
      expect(localPlayer.health).toBe(90);
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

    test('WhenRunning_ShouldUpdateLocalPlayerController', () => {
      game.init();
      const spy = jest.spyOn(game.localPlayerController, 'update');
      game.update(0.016);
      expect(spy).toHaveBeenCalledWith(0.016, null);
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

    test('WhenShrinking_ShouldNotGoBelowMinimum', () => {
      game.state.isRunning = true;
      game.state.gameTime = CONFIG.GAME.INITIAL_ZONE_SHRINK_DELAY_SECONDS + 1;
      game.state.conflictZone.radius = CONFIG.ZONE.MIN_RADIUS;
      game.updateConflictZone(1000); // Large delta time
      expect(game.state.conflictZone.radius).toBe(CONFIG.ZONE.MIN_RADIUS);
    });
  });

  describe('LocalPlayer Updates', () => {
    beforeEach(() => {
      game.init();
    });

    test('WhenPlayerHasVelocity_ShouldUpdatePosition', () => {
      const player = game.getLocalPlayer();
      player.velocity = { x: 100, y: 50 };
      const initialX = player.x;
      const initialY = player.y;

      game.update(0.1); // 0.1 seconds

      expect(player.x).toBe(initialX + 10); // 100 * 0.1
      expect(player.y).toBe(initialY + 5); // 50 * 0.1
    });

    test('WhenPlayerMovesOutOfBounds_ShouldClampToWorldWidth', () => {
      const player = game.getLocalPlayer();
      player.x = CONFIG.WORLD.WIDTH - 10;
      player.velocity = { x: 200, y: 0 };

      game.update(1); // Move way beyond bounds

      expect(player.x).toBe(CONFIG.WORLD.WIDTH);
    });
  });

  describe('handleInput', () => {
    beforeEach(() => {
      game.init();
    });

    test('WhenMovingRight_ShouldSetVelocityX', () => {
      const inputState = { moveX: 1, moveY: 0 };
      game.handleInput(inputState);
      const player = game.getLocalPlayer();
      expect(player.velocity.x).toBe(CONFIG.PLAYER.BASE_MOVEMENT_SPEED);
      expect(player.velocity.y).toBe(0);
    });

    test('WhenMovingDiagonally_ShouldNormalizeVelocity', () => {
      const inputState = { moveX: 1, moveY: 1 };
      game.handleInput(inputState);

      const player = game.getLocalPlayer();
      const expectedSpeed = CONFIG.PLAYER.BASE_MOVEMENT_SPEED / Math.SQRT2;
      expect(player.velocity.x).toBeCloseTo(expectedSpeed);
      expect(player.velocity.y).toBeCloseTo(expectedSpeed);
    });
  });

  describe('Animation State', () => {
    test('WhenPlayerInitialized_ShouldHaveAnimationState', () => {
      game.init();
      const player = game.getLocalPlayer();

      expect(player.animationState).toBeDefined();
      expect(player.animationState.currentFrame).toBe(0);
    });

    test('WhenPlayerIsMoving_ShouldUpdateAnimationState', () => {
      game.init();
      const player = game.getLocalPlayer();
      player.velocity = { x: 100, y: 0 }; // Moving east

      game.update(1 / CONFIG.ANIMATION.FPS);

      expect(player.animationState.currentFrame).toBeGreaterThan(0);
    });
  });
});
