import { jest } from '@jest/globals';
import { LocalPlayerController } from './LocalPlayerController.js';
import { CONFIG } from './config.js';

describe('LocalPlayerController', () => {
  let controller;
  let mockNetwork;

  beforeEach(() => {
    mockNetwork = {
      playerId: 'test-player',
      broadcastPlayerStateUpdate: jest.fn(),
      send: jest.fn(),
    };
  });

  test('ShouldInitializeWithDefaultValues', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();

    expect(player.id).toBe('test-player');
    expect(player.x).toBe(CONFIG.WORLD.WIDTH / 2);
    expect(player.y).toBe(CONFIG.WORLD.HEIGHT / 2);
  });

  test('ShouldUpdatePositionBasedOnVelocity', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();
    
    player.velocity.x = 100;
    player.velocity.y = 0;

    controller.update(1.0, null); // 1 second

    expect(player.x).toBe(CONFIG.WORLD.WIDTH / 2 + 100);
  });

  test('ShouldHandleMovementInput', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();

    controller.handleInput({ moveX: 1, moveY: 0 });

    expect(player.velocity.x).toBeGreaterThan(0);
    expect(player.velocity.y).toBe(0);
  });

  test('ShouldBroadcastPositionUpdate', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();
    
    // Move player
    player.x += 10;
    
    // Force enough time to pass for throttle
    // Using a large number to ensure we are past the interval
    const mockNow = jest.spyOn(Date, 'now').mockReturnValue(10000000);
    controller.lastPositionSendTime = 0; // Ensure logic sees it as ready
    
    controller.update(0.1, { getPlayers: () => new Map() }); // pass mock snapshot

    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    
    mockNow.mockRestore();
  });

  test('ShouldSyncFromSnapshot', () => {
    controller = new LocalPlayerController(mockNetwork, null);
    const player = controller.getPlayer();

    const mockSnapshot = {
        getPlayers: () => new Map([
            ['test-player', { health: 50, equipped_weapon: 'spear' }]
        ])
    };

    controller.update(0.1, mockSnapshot);

    expect(player.health).toBe(50);
    expect(player.weapon).toBe('spear');
  });

  describe('getCooldownStatus', () => {
    beforeEach(() => {
      controller = new LocalPlayerController(mockNetwork, null);
    });

    test('WhenNoCooldown_ShouldReturnZeros', () => {
      const status = controller.getCooldownStatus();
      expect(status.attackPct).toBe(0);
      expect(status.abilityPct).toBe(0);
    });

    test('WhenAttackOnCooldown_ShouldReturnPercentage', () => {
      const player = controller.getPlayer();
      const now = Date.now();
      
      // Mock weapon with 1.0 attack speed (1000ms cooldown)
      player.weapon = 'spear'; 
      player.lastAttackTime = now - 500; // Halfway through cooldown

      const status = controller.getCooldownStatus();
      
      // Should be around 0.5 (50%)
      expect(status.attackPct).toBeCloseTo(0.5, 1);
    });

    test('WhenSpecialOnCooldown_ShouldReturnPercentage', () => {
      const player = controller.getPlayer();
      const now = Date.now();
      
      // Special cooldown is 3000ms by default
      const cooldown = CONFIG.COMBAT.SPECIAL_ABILITY_COOLDOWN_MS;
      player.lastSpecialTime = now - (cooldown / 2); // Halfway

      const status = controller.getCooldownStatus();
      
      expect(status.abilityPct).toBeCloseTo(0.5, 1);
    });
  });

  describe('Auto-Attack', () => {
    beforeEach(() => {
      controller = new LocalPlayerController(mockNetwork, null);
    });

    test('WhenAttackButtonHeld_ShouldTriggerMultipleAttacksOverTime', () => {
      const player = controller.getPlayer();
      player.weapon = 'spear'; // 1.0 attack speed = 1000ms cooldown
      
      let now = 10000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      // 1. First attack
      controller.handleInput({ attack: true });
      controller.update(0.016, null);
      expect(mockNetwork.send).toHaveBeenCalledTimes(1);

      // 2. Wait 500ms, update (should not attack)
      now += 500;
      controller.update(0.5, null);
      expect(mockNetwork.send).toHaveBeenCalledTimes(1);

      // 3. Wait another 600ms (total 1100ms), update (should attack again)
      now += 600;
      controller.update(0.6, null);
      expect(mockNetwork.send).toHaveBeenCalledTimes(2);

      jest.restoreAllMocks();
    });

    test('WhenSpecialAbilityButtonHeld_ShouldTriggerMultipleAttacksOverTime', () => {
      const player = controller.getPlayer();
      const cooldown = CONFIG.COMBAT.SPECIAL_ABILITY_COOLDOWN_MS;
      
      let now = 10000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      // 1. First special
      controller.handleInput({ specialAbility: true });
      controller.update(0.016, null);
      expect(mockNetwork.send).toHaveBeenCalledTimes(1);

      // 2. Wait halfway, update (should not attack)
      now += cooldown / 2;
      controller.update(cooldown / 2000, null);
      expect(mockNetwork.send).toHaveBeenCalledTimes(1);

      // 3. Wait past cooldown, update (should attack again)
      now += (cooldown / 2) + 100;
      controller.update((cooldown / 2000) + 0.1, null);
      expect(mockNetwork.send).toHaveBeenCalledTimes(2);

      jest.restoreAllMocks();
    });

    test('WhenMovingWhileAutoAttacking_ShouldUpdateAttackDirection', () => {
      const player = controller.getPlayer();
      player.weapon = 'spear';
      
      let now = 10000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      // 1. Attack while moving East
      controller.handleInput({ attack: true, moveX: 1, moveY: 0 });
      controller.update(0.016, null);
      expect(mockNetwork.send).toHaveBeenLastCalledWith('attack_request', expect.objectContaining({
        aim_x: expect.any(Number),
        aim_y: player.y // Should be East (aim_y same as player.y)
      }));

      // 2. Wait for cooldown and change movement to South
      now += 1100;
      controller.handleInput({ attack: true, moveX: 0, moveY: 1 });
      controller.update(1.1, null);

      expect(mockNetwork.send).toHaveBeenCalledTimes(2);
      expect(mockNetwork.send).toHaveBeenLastCalledWith('attack_request', expect.objectContaining({
        aim_x: player.x, // Should be South (aim_x same as player.x)
        aim_y: expect.any(Number)
      }));

      jest.restoreAllMocks();
    });
  });

  describe('Death Behavior', () => {
    beforeEach(() => {
      controller = new LocalPlayerController(mockNetwork, null);
    });

    test('WhenHealthIsZero_ShouldDisableMovementInput', () => {
      const player = controller.getPlayer();
      player.health = 0;

      controller.handleInput({ moveX: 1, moveY: 0 });

      expect(player.velocity.x).toBe(0);
      expect(player.velocity.y).toBe(0);
    });

    test('WhenHealthIsNegative_ShouldDisableMovementInput', () => {
      const player = controller.getPlayer();
      player.health = -10;

      controller.handleInput({ moveX: 0, moveY: 1 });

      expect(player.velocity.x).toBe(0);
      expect(player.velocity.y).toBe(0);
    });

    test('WhenHealthIsZero_ShouldDisableAttack', () => {
      const player = controller.getPlayer();
      player.health = 0;

      controller.handleInput({ attack: true });

      expect(mockNetwork.send).not.toHaveBeenCalledWith('attack_request', expect.any(Object));
      expect(player.isAttacking).toBe(false);
    });

    test('isDead_ShouldReturnTrueWhenHealthIsZeroOrLess', () => {
      const player = controller.getPlayer();
      
      player.health = 100;
      expect(controller.isDead()).toBe(false);

      player.health = 0;
      expect(controller.isDead()).toBe(true);

      player.health = -1;
      expect(controller.isDead()).toBe(true);
    });
  });
});
