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
      expect(game.localPlayer).toBeNull();
    });
  });

  describe('init', () => {
    test('WhenInitializedWithoutSnapshot_ShouldSetIsRunningToTrue', () => {
      game.init();
      expect(game.state.isRunning).toBe(true);
    });

    test('WhenInitializedWithoutSnapshot_ShouldCreateTestPlayer', () => {
      game.init();
      expect(game.localPlayer).toBeDefined();
      expect(game.localPlayer.id).toBe('player-1');
      expect(game.localPlayer.health).toBe(100);
      expect(game.localPlayer.weapon).toBeNull();
      expect(game.localPlayer.armor).toBeNull();
    });

    test('WhenInitializedWithoutSnapshot_ShouldSpawnPlayerAtCenterOfWorld', () => {
      game.init();
      expect(game.localPlayer.x).toBe(CONFIG.WORLD.WIDTH / 2);
      expect(game.localPlayer.y).toBe(CONFIG.WORLD.HEIGHT / 2);
    });

    test('WhenInitializedWithSnapshot_ShouldLoadLocalPlayerFromSnapshot', () => {
      const mockSnapshot = {
        getPlayers: jest.fn().mockReturnValue(new Map([
          ['player-1', { player_id: 'player-1', player_name: 'Alice', position_x: 100, position_y: 200, rotation: 0.5, health: 90 }],
        ])),
      };
      const mockNetwork = { playerId: 'player-1' };

      game.init(mockSnapshot, mockNetwork);

      expect(game.localPlayer).toBeDefined();
      expect(game.localPlayer.id).toBe('player-1');
      expect(game.localPlayer.name).toBe('Alice');
      expect(game.localPlayer.x).toBe(100);
      expect(game.localPlayer.y).toBe(200);
      expect(game.localPlayer.rotation).toBe(0.5);
      expect(game.localPlayer.health).toBe(90);
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

    test('WhenRunning_ShouldCallUpdateLocalPlayer', () => {
      game.init();
      const spy = jest.spyOn(game, 'updateLocalPlayer');
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

    test('WhenShrinking_ShouldNotGoBelowMinimum', () => {
      game.state.isRunning = true;
      game.state.gameTime = CONFIG.GAME.INITIAL_ZONE_SHRINK_DELAY_SECONDS + 1;
      game.state.conflictZone.radius = CONFIG.ZONE.MIN_RADIUS;
      game.updateConflictZone(1000); // Large delta time
      expect(game.state.conflictZone.radius).toBe(CONFIG.ZONE.MIN_RADIUS);
    });
  });

  describe('updateLocalPlayer', () => {
    beforeEach(() => {
      game.init();
    });

    test('WhenPlayerHasVelocity_ShouldUpdatePosition', () => {
      game.localPlayer.velocity = { x: 100, y: 50 };
      const initialX = game.localPlayer.x;
      const initialY = game.localPlayer.y;

      game.updateLocalPlayer(0.1); // 0.1 seconds

      expect(game.localPlayer.x).toBe(initialX + 10); // 100 * 0.1
      expect(game.localPlayer.y).toBe(initialY + 5); // 50 * 0.1
    });

    test('WhenPlayerMovesOutOfBounds_ShouldClampToWorldWidth', () => {
      game.localPlayer.x = CONFIG.WORLD.WIDTH - 10;
      game.localPlayer.velocity = { x: 200, y: 0 };

      game.updateLocalPlayer(1); // Move way beyond bounds

      expect(game.localPlayer.x).toBe(CONFIG.WORLD.WIDTH);
    });

    test('WhenPlayerMovesOutOfBounds_ShouldClampToMinimumX', () => {
      game.localPlayer.x = 10;
      game.localPlayer.velocity = { x: -200, y: 0 };

      game.updateLocalPlayer(1);

      expect(game.localPlayer.x).toBe(0);
    });

    test('WhenPlayerMovesOutOfBounds_ShouldClampToWorldHeight', () => {
      game.localPlayer.y = CONFIG.WORLD.HEIGHT - 10;
      game.localPlayer.velocity = { x: 0, y: 200 };

      game.updateLocalPlayer(1);

      expect(game.localPlayer.y).toBe(CONFIG.WORLD.HEIGHT);
    });

    test('WhenPlayerMovesOutOfBounds_ShouldClampToMinimumY', () => {
      game.localPlayer.y = 10;
      game.localPlayer.velocity = { x: 0, y: -200 };

      game.updateLocalPlayer(1);

      expect(game.localPlayer.y).toBe(0);
    });

    test('WhenPlayerOutsideZone_ShouldTakeDamage', () => {
      game.localPlayer.health = 100;

      // Place player far outside zone
      game.localPlayer.x = 0;
      game.localPlayer.y = 0;
      game.state.conflictZone.centerX = CONFIG.WORLD.WIDTH / 2;
      game.state.conflictZone.centerY = CONFIG.WORLD.HEIGHT / 2;
      game.state.conflictZone.radius = 10; // Very small zone

      game.updateLocalPlayer(1); // 1 second

      const expectedDamage = CONFIG.ZONE.DAMAGE_PER_SECOND +
        (CONFIG.ZONE.DAMAGE_INCREASE_PER_PHASE * game.state.phase);
      expect(game.localPlayer.health).toBe(100 - expectedDamage);
    });

    test('WhenPlayerInsideZone_ShouldNotTakeDamage', () => {
      game.localPlayer.health = 100;

      // Place player at center of zone
      game.localPlayer.x = game.state.conflictZone.centerX;
      game.localPlayer.y = game.state.conflictZone.centerY;

      game.updateLocalPlayer(1);

      expect(game.localPlayer.health).toBe(100);
    });

    test('WhenPlayerOutsideZoneInHigherPhase_ShouldTakeMoreDamage', () => {
      // Place player outside zone
      game.localPlayer.x = 0;
      game.localPlayer.y = 0;
      game.state.conflictZone.radius = 10;

      // Test Phase 0
      game.state.phase = 0;
      game.localPlayer.health = 100;
      game.updateLocalPlayer(1);
      const phase0Damage = 100 - game.localPlayer.health;

      // Test Phase 2
      game.state.phase = 2;
      game.localPlayer.health = 100;
      game.updateLocalPlayer(1);
      const phase2Damage = 100 - game.localPlayer.health;

      expect(phase2Damage).toBeGreaterThan(phase0Damage);
    });
  });

  describe('handleInput', () => {
    beforeEach(() => {
      game.init();
    });

    test('WhenMovingRight_ShouldSetVelocityX', () => {
      const inputState = { moveX: 1, moveY: 0 };
      game.handleInput(inputState);
      expect(game.localPlayer.velocity.x).toBe(CONFIG.PLAYER.BASE_MOVEMENT_SPEED);
      expect(game.localPlayer.velocity.y).toBe(0);
    });

    test('WhenMovingLeft_ShouldSetNegativeVelocityX', () => {
      const inputState = { moveX: -1, moveY: 0 };
      game.handleInput(inputState);
      expect(game.localPlayer.velocity.x).toBe(-CONFIG.PLAYER.BASE_MOVEMENT_SPEED);
      expect(game.localPlayer.velocity.y).toBe(0);
    });

    test('WhenMovingUp_ShouldSetNegativeVelocityY', () => {
      const inputState = { moveX: 0, moveY: -1 };
      game.handleInput(inputState);
      expect(game.localPlayer.velocity.x).toBe(0);
      expect(game.localPlayer.velocity.y).toBe(-CONFIG.PLAYER.BASE_MOVEMENT_SPEED);
    });

    test('WhenMovingDown_ShouldSetVelocityY', () => {
      const inputState = { moveX: 0, moveY: 1 };
      game.handleInput(inputState);
      expect(game.localPlayer.velocity.x).toBe(0);
      expect(game.localPlayer.velocity.y).toBe(CONFIG.PLAYER.BASE_MOVEMENT_SPEED);
    });

    test('WhenMovingDiagonally_ShouldNormalizeVelocity', () => {
      const inputState = { moveX: 1, moveY: 1 };
      game.handleInput(inputState);

      // Diagonal movement should be normalized so total speed equals base speed
      const expectedSpeed = CONFIG.PLAYER.BASE_MOVEMENT_SPEED / Math.SQRT2;
      expect(game.localPlayer.velocity.x).toBeCloseTo(expectedSpeed);
      expect(game.localPlayer.velocity.y).toBeCloseTo(expectedSpeed);
    });

    test('WhenNotMoving_ShouldSetVelocityToZero', () => {
      const inputState = { moveX: 0, moveY: 0 };
      game.handleInput(inputState);
      expect(game.localPlayer.velocity.x).toBe(0);
      expect(game.localPlayer.velocity.y).toBe(0);
    });

    test('WhenPlayerHasDoubleHandedWeapon_ShouldApplySpeedModifier', () => {
      game.localPlayer.weapon = { stance: 'double' };
      const inputState = { moveX: 1, moveY: 0 };
      game.handleInput(inputState);

      const expectedSpeed = CONFIG.PLAYER.BASE_MOVEMENT_SPEED *
        CONFIG.PLAYER.DOUBLE_HANDED_SPEED_MODIFIER;
      expect(game.localPlayer.velocity.x).toBe(expectedSpeed);
    });

    test('WhenPlayerHasNonDoubleWeapon_ShouldNotApplyModifier', () => {
      game.localPlayer.weapon = { stance: 'single' };
      const inputState = { moveX: 1, moveY: 0 };
      game.handleInput(inputState);
      expect(game.localPlayer.velocity.x).toBe(CONFIG.PLAYER.BASE_MOVEMENT_SPEED);
    });
  });

  describe('Multiplayer Integration', () => {
    let mockPlayersSnapshot;
    let mockNetwork;

    beforeEach(() => {
      mockPlayersSnapshot = {
        getPlayers: jest.fn().mockReturnValue(new Map([
          ['player-1', {
            player_id: 'player-1',
            player_name: 'Alice',
            position_x: CONFIG.WORLD.WIDTH / 2,
            position_y: CONFIG.WORLD.HEIGHT / 2,
            rotation: 0,
            health: 100
          }],
          ['player-2', {
            player_id: 'player-2',
            player_name: 'Bob',
            position_x: CONFIG.WORLD.WIDTH / 2 + 50,
            position_y: CONFIG.WORLD.HEIGHT / 2 + 50,
            rotation: 1.5,
            health: 80
          }],
        ])),
      };

      mockNetwork = {
        playerId: 'player-1',
        sendPositionUpdate: jest.fn(),
      };
    });

    test('WhenInitializedWithSnapshot_ShouldLoadLocalPlayerFromSnapshot', () => {
      game.init(mockPlayersSnapshot, mockNetwork);

      expect(game.localPlayer).toBeDefined();
      expect(game.localPlayer.id).toBe('player-1');
      expect(game.localPlayer.name).toBe('Alice');
      expect(game.localPlayer.x).toBe(CONFIG.WORLD.WIDTH / 2);
      expect(game.localPlayer.y).toBe(CONFIG.WORLD.HEIGHT / 2);
      expect(game.localPlayer.rotation).toBe(0);
      expect(game.localPlayer.health).toBe(100);
    });

    test('WhenLocalPlayerMovesInMultiplayer_ShouldUpdateLocalPlayerPosition', () => {
      game.init(mockPlayersSnapshot, mockNetwork);

      const inputState = { moveX: 1, moveY: 0 };
      game.handleInput(inputState);
      game.update(0.1); // Update for 0.1 seconds

      expect(game.localPlayer.x).toBe(CONFIG.WORLD.WIDTH / 2 + CONFIG.PLAYER.BASE_MOVEMENT_SPEED * 0.1);
    });

    test('WhenLocalPlayerMovesInMultiplayer_ShouldSendPositionUpdate', () => {
      game.init(mockPlayersSnapshot, mockNetwork);

      const inputState = { moveX: 1, moveY: 0 };
      game.handleInput(inputState);
      game.update(0.1); // Update triggers position send

      expect(mockNetwork.sendPositionUpdate).toHaveBeenCalled();
      const call = mockNetwork.sendPositionUpdate.mock.calls[0][0];
      expect(call.position.x).toBeCloseTo(CONFIG.WORLD.WIDTH / 2 + 20, 1); // center + 200 * 0.1
      expect(call.position.y).toBe(CONFIG.WORLD.HEIGHT / 2);
    });

    test('WhenLocalPlayerPositionUnchanged_ShouldNotSendUpdate', () => {
      game.init(mockPlayersSnapshot, mockNetwork);

      // Don't move the player
      game.update(0.016);

      // Should not send position update since position/health didn't change
      expect(mockNetwork.sendPositionUpdate).not.toHaveBeenCalled();
    });

    test('WhenLocalPlayerHealthChanges_ShouldSendUpdateEvenIfPositionUnchanged', () => {
      game.init(mockPlayersSnapshot, mockNetwork);

      // Manually change health
      game.localPlayer.health = 90;
      
      game.update(0.016);

      // Should send update because health changed
      expect(mockNetwork.sendPositionUpdate).toHaveBeenCalled();
      const call = mockNetwork.sendPositionUpdate.mock.calls[0][0];
      expect(call.health).toBe(90);
    });

    test('WhenLocalPlayerPositionChangesTinyAmount_ShouldNotSendUpdate', () => {
      game.init(mockPlayersSnapshot, mockNetwork);

      // Simulate tiny floating point error
      game.localPlayer.x += Number.EPSILON * 0.5;
      
      game.update(0.016);

      // Should not send position update since change is negligible
      expect(mockNetwork.sendPositionUpdate).not.toHaveBeenCalled();
    });

    test('WhenSnapshotUpdated_ShouldNotAffectLocalPlayer', () => {
      game.init(mockPlayersSnapshot, mockNetwork);
      expect(game.localPlayer.x).toBe(CONFIG.WORLD.WIDTH / 2);

      // Update snapshot with different position for local player
      mockPlayersSnapshot.getPlayers.mockReturnValue(new Map([
        ['player-1', {
          player_id: 'player-1',
          player_name: 'Alice',
          position_x: 999,
          position_y: 999,
          rotation: 0.5,
          health: 90
        }],
        ['player-2', {
          player_id: 'player-2',
          player_name: 'Bob',
          position_x: 350,
          position_y: 450,
          rotation: 2.0,
          health: 70
        }],
      ]));

      game.update(0.016);

      // Local player position should NOT be affected by snapshot changes
      expect(game.localPlayer.x).toBe(CONFIG.WORLD.WIDTH / 2);
      expect(game.localPlayer.y).toBe(CONFIG.WORLD.HEIGHT / 2);
    });
  });

  describe('getState', () => {
    test('WhenCalled_ShouldReturnGameState', () => {
      const state = game.getState();
      expect(state).toBe(game.state);
    });
  });

  describe('getLocalPlayer', () => {
    test('WhenCalled_ShouldReturnLocalPlayer', () => {
      game.init();
      const localPlayer = game.getLocalPlayer();
      expect(localPlayer).toBe(game.localPlayer);
    });
  });
});
