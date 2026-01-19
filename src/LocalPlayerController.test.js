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
    expect(player.equipped_weapon).toBe('fist');
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
        ['test-player', { health: 50, equipped_weapon: 'spear' }],
      ]),
    };

    controller.update(0.1, mockSnapshot);

    expect(player.health).toBe(50);
    expect(player.equipped_weapon).toBe('spear');
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
      player.equipped_weapon = 'battleaxe'; 
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
      player.equipped_weapon = 'battleaxe'; // 1.0 attack speed = 1000ms cooldown
      
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
      player.equipped_weapon = 'battleaxe';
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
      player.equipped_weapon = 'battleaxe';
      
      let now = 10000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      // 1. Attack while moving East
      controller.handleInput({ attack: true, moveX: 1, moveY: 0 });
      controller.update(0.016, null);
      expect(mockNetwork.send).toHaveBeenLastCalledWith('attack_request', expect.objectContaining({
        aim_x: expect.any(Number),
        aim_y: player.y, // Should be East (aim_y same as player.y)
      }));

      // 2. Wait for cooldown and change movement to South
      now += 1100;
      controller.handleInput({ attack: true, moveX: 0, moveY: 1 });
      controller.update(1.1, null);

      expect(mockNetwork.send).toHaveBeenCalledTimes(2);
      expect(mockNetwork.send).toHaveBeenLastCalledWith('attack_request', expect.objectContaining({
        aim_x: player.x, // Should be South (aim_x same as player.x)
        aim_y: expect.any(Number),
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

  describe('Loot Interaction', () => {
    let mockLoot;
    let now;

    beforeEach(() => {
      controller = new LocalPlayerController(mockNetwork, null);
      mockLoot = [
        { id: 'loot-1', item_id: 'spear', x: CONFIG.WORLD.WIDTH / 2 + 10, y: CONFIG.WORLD.HEIGHT / 2 + 10 },
      ];
      now = 10000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('WhenUnarmedAndCollidingWithLoot_ShouldSendPickupRequest', () => {
      const player = controller.getPlayer();
      player.equipped_weapon = null;
      
      // Move player into range
      player.x = mockLoot[0].x;
      player.y = mockLoot[0].y;

      controller.update(0.016, null, mockLoot);

      expect(mockNetwork.send).toHaveBeenCalledWith('pickup_request', {
        loot_id: 'loot-1',
      });
    });

    test('WhenArmedAndCollidingWithLoot_ShouldNotAutoPickup', () => {
      const player = controller.getPlayer();
      player.equipped_weapon = 'bo';
      
      // Move player into range
      player.x = mockLoot[0].x;
      player.y = mockLoot[0].y;

      controller.update(0.016, null, mockLoot);

      expect(mockNetwork.send).not.toHaveBeenCalledWith('pickup_request', expect.any(Object));
    });

    test('WhenArmedAndCollidingWithLootAndPressingF_ShouldSendPickupRequest', () => {
      const player = controller.getPlayer();
      player.equipped_weapon = 'bo';
      
      // Move player into range
      player.x = mockLoot[0].x;
      player.y = mockLoot[0].y;

      // Press 'F'
      controller.handleInput({ interact: true });
      controller.update(0.016, null, mockLoot);

      expect(mockNetwork.send).toHaveBeenCalledWith('pickup_request', {
        loot_id: 'loot-1',
      });
    });

    test('WhenHoldingF_ShouldOnlySendOnePickupRequest', () => {
      const player = controller.getPlayer();
      player.equipped_weapon = 'bo';
      player.x = mockLoot[0].x;
      player.y = mockLoot[0].y;

      // Frame 1: Press F
      controller.handleInput({ interact: true });
      controller.update(0.016, null, mockLoot);
      expect(mockNetwork.send).toHaveBeenCalledTimes(1);
      
      // Clear mock
      mockNetwork.send.mockClear();

      // Frame 2: Still holding F
      controller.handleInput({ interact: true });
      controller.update(0.016, null, mockLoot);
      expect(mockNetwork.send).not.toHaveBeenCalled();

      // Frame 3: Release F
      controller.handleInput({ interact: false });
      controller.update(0.016, null, mockLoot);
      expect(mockNetwork.send).not.toHaveBeenCalled();

      // Advance time past throttle limit
      now += 1000;

      // Frame 4: Press F again
      controller.handleInput({ interact: true });
      controller.update(0.016, null, mockLoot);
      expect(mockNetwork.send).toHaveBeenCalledTimes(1);
    });
  });
});
