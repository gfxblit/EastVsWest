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

    test('WhenConstructed_ShouldInitializeSpectatingTargetIdToNull', () => {
      expect(game.spectatingTargetId).toBeNull();
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
      expect(localPlayer.equipped_weapon).toBe('fist');
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
            health: 90, 
          }],
        ])),
      };
      const mockNetwork = { playerId: 'player-1', on: jest.fn(), send: jest.fn() };

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
      expect(spy).toHaveBeenCalledWith(0.016, null, []);
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

  describe('Loot Management', () => {
    let mockNetwork;
    let mockSnapshot;

    beforeEach(() => {
      mockNetwork = { 
        playerId: 'player-1', 
        on: jest.fn(), 
        send: jest.fn(),
        isHost: false, 
      };
      mockSnapshot = { 
        getPlayers: jest.fn().mockReturnValue(new Map()), 
      };
      game.init(mockSnapshot, mockNetwork);
    });

    test('WhenLootSpawnedMessageReceived_ShouldAddLootToState', () => {
      // Find the loot_spawned handler
      const lootSpawnedHandler = mockNetwork.on.mock.calls.find(call => call[0] === 'loot_spawned')[1];
      
      const lootItem = { id: 'loot-1', type: 'weapon', item_id: 'spear', x: 100, y: 100 };
      lootSpawnedHandler({ data: lootItem });

      expect(game.state.loot).toContainEqual(lootItem);
    });

    test('WhenLootPickedUpMessageReceived_ShouldRemoveLootFromState', () => {
      game.state.loot = [{ id: 'loot-1', type: 'weapon', item_id: 'spear', x: 100, y: 100 }];
      
      // Find the loot_picked_up handler
      const lootPickedUpHandler = mockNetwork.on.mock.calls.find(call => call[0] === 'loot_picked_up')[1];
      
      lootPickedUpHandler({ data: { loot_id: 'loot-1', player_id: 'player-2' } });

      expect(game.state.loot).toHaveLength(0);
    });
  });

  describe('Spectator Mode', () => {
    let mockNetwork;
    let mockSnapshot;

    beforeEach(() => {
      mockNetwork = { 
        playerId: 'player-1', 
        on: jest.fn(), 
        send: jest.fn(),
        isHost: false, 
      };
      // Mock players
      const players = new Map();
      players.set('player-1', { id: 'player-1', x: 0, y: 0, position_x: 0, position_y: 0 }); // Local
      players.set('killer-1', { id: 'killer-1', player_name: 'Killer', position_x: 100, position_y: 100 });

      mockSnapshot = { 
        getPlayers: jest.fn().mockReturnValue(players),
        getInterpolatedPlayerState: jest.fn((id) => {
          if (id === 'killer-1') return { x: 100, y: 100 };
          return null;
        }),
      };
      
      game.init(mockSnapshot, mockNetwork);
    });

    test('WhenPlayerDeathEventReceivedForLocalPlayer_ShouldUpdateSpectatingTargetId', () => {
      // Find the handler
      const calls = mockNetwork.on.mock.calls;
      const deathHandlerEntry = calls.find(call => call[0] === 'player_death');
      
      expect(deathHandlerEntry).toBeDefined();
      const deathHandler = deathHandlerEntry[1];

      // Execute handler
      deathHandler({ 
        from: 'host', 
        data: { victim_id: 'player-1', killer_id: 'killer-1' }, 
      });

      expect(game.spectatingTargetId).toBe('killer-1');
    });

    test('WhenPlayerDeathEventReceivedForOtherPlayer_ShouldIgnore', () => {
      const calls = mockNetwork.on.mock.calls;
      const deathHandlerEntry = calls.find(call => call[0] === 'player_death');
      
      if (deathHandlerEntry) {
        const deathHandler = deathHandlerEntry[1];
        deathHandler({ 
          from: 'host', 
          data: { victim_id: 'other-player', killer_id: 'killer-1' }, 
        });
      }

      expect(game.spectatingTargetId).toBeNull();
    });

    test('getCameraTarget_ShouldReturnLocalPlayer_WhenNotSpectating', () => {
      const target = game.getCameraTarget();
      expect(target).toBeDefined();
      expect(target.id).toBe('player-1');
    });

    test('getCameraTarget_ShouldReturnKiller_WhenSpectating', () => {
      game.spectatingTargetId = 'killer-1';
      const target = game.getCameraTarget();
      
      expect(target).toBeDefined();
      // Should return normalized coordinates
      expect(target.x).toBe(100);
      expect(target.y).toBe(100);
      expect(target.name).toBe('Killer');
    });

    test('getCameraTarget_ShouldReturnLocalPlayer_WhenSpectatingInvalidTarget', () => {
      game.spectatingTargetId = 'non-existent';
      const target = game.getCameraTarget();
      
      expect(target.id).toBe('player-1');
    });

    test('cycleSpectatorTarget_ShouldSwitchToNextAvailablePlayer', () => {
      // Setup players: Local, Killer (Alive), Bystander (Alive), DeadGuy (Dead)
      const players = new Map();
      players.set('player-1', { player_id: 'player-1', health: 0 }); // Local (Dead)
      players.set('killer-1', { player_id: 'killer-1', player_name: 'Killer', health: 100 });
      players.set('bystander-1', { player_id: 'bystander-1', player_name: 'Bystander', health: 100 });
      players.set('dead-1', { player_id: 'dead-1', player_name: 'DeadGuy', health: 0 });

      mockSnapshot.getPlayers = jest.fn().mockReturnValue(players);
      
      // Start spectating Killer
      game.spectatingTargetId = 'killer-1';

      // First cycle: Should go to Bystander (alphabetically 'bystander-1' comes before 'killer-1' but we need to check sort order)
      // IDs: 'bystander-1', 'killer-1'. 
      // Current is 'killer-1'. Next in list (looping) is 'bystander-1'.
      
      game.cycleSpectatorTarget();
      expect(game.spectatingTargetId).toBe('bystander-1');

      // Second cycle: Should go back to Killer
      game.cycleSpectatorTarget();
      expect(game.spectatingTargetId).toBe('killer-1');
      
      // Ensure 'dead-1' was skipped
      game.cycleSpectatorTarget(); 
      expect(game.spectatingTargetId).toBe('bystander-1');
    });

    describe('Game Simulation Pause', () => {
      let mockNetwork;
      let mockSnapshot;

      beforeEach(() => {
        mockNetwork = { 
          playerId: 'player-1', 
          on: jest.fn(), 
          send: jest.fn(),
          isHost: true, 
        };
      
        mockSnapshot = { 
          getPlayers: jest.fn().mockReturnValue(new Map([
            ['player-1', { player_id: 'player-1', health: 100 }],
          ])),
        };
      
        game.init(mockSnapshot, mockNetwork);
      });

      test('WhenPaused_ShouldNotProcessLootSpawnedEvents', () => {
      // 1. Pause the game
        game.state.isRunning = false;
      
        // 2. Simulate incoming loot_spawned event
        // Find the handler
        const lootSpawnedHandler = mockNetwork.on.mock.calls.find(call => call[0] === 'loot_spawned')[1];
        expect(lootSpawnedHandler).toBeDefined();

        const lootItem = { id: 'loot-pause-test', type: 'weapon', item_id: 'spear', x: 100, y: 100 };
      
        // 3. Trigger event
        lootSpawnedHandler({ data: lootItem });

        // 4. Assert that loot was NOT added because simulation is paused
        expect(game.state.loot).not.toContainEqual(lootItem);
      });

      test('WhenPaused_ShouldNotProcessAttackRequests', () => {
      // 1. Pause the game
        game.state.isRunning = false;
      
        // 2. Simulate incoming attack_request
        const attackHandler = mockNetwork.on.mock.calls.find(call => call[0] === 'attack_request')[1];
        expect(attackHandler).toBeDefined();

        // Mock hostCombatManager to verify it's not called
        const spy = jest.spyOn(game.hostCombatManager, 'handleAttackRequest');

        // 3. Trigger event
        attackHandler({ from: 'player-2', data: {} });

        // 4. Assert that combat manager was NOT invoked
        expect(spy).not.toHaveBeenCalled();
      });
    });
  });
});
