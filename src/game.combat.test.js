import { jest } from '@jest/globals';
import { Game } from './game.js';
import { CONFIG } from './config.js';

describe('Game Combat', () => {
  let game;
  let mockNetwork;
  let mockPlayersSnapshot;

  beforeEach(() => {
    mockNetwork = {
      playerId: 'player-1',
      send: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
      broadcastPlayerStateUpdate: jest.fn(),
      writePlayerStateToDB: jest.fn().mockResolvedValue({}),
      isHost: true,
    };

    mockPlayersSnapshot = {
      getPlayers: jest.fn().mockReturnValue(new Map([
        ['player-1', {
          player_id: 'player-1',
          position_x: 100,
          position_y: 100,
          health: 100,
          equipped_weapon: 'spear',
        }],
        ['player-2', {
          player_id: 'player-2',
          position_x: 150,
          position_y: 100,
          health: 100,
          equipped_weapon: 'fist',
        }],
      ])),
    };

    game = new Game();
    game.init(mockPlayersSnapshot, mockNetwork);
  });

  describe('Player Combat State', () => {
    test('WhenInitialized_ShouldHaveCooldownTimers', () => {
      const localPlayer = game.getLocalPlayer();
      expect(localPlayer.lastAttackTime).toBe(0);
      expect(localPlayer.lastSpecialTime).toBe(0);
    });
  });

  describe('Input Handling & Attack Requests', () => {
    test('WhenAttackInputPressed_ShouldSendAttackRequest', () => {
      const inputState = { 
        attack: true, 
        specialAbility: false,
        aimX: 200, // Should be ignored
        aimY: 100,  // Should be ignored
      };

      // Player is at 100,100 with rotation 0 (North). 
      // Attack vector (0, -1) * 100 = (0, -100). Target: 100, 0.
      game.handleInput(inputState);
      game.update(0.016);

      expect(mockNetwork.send).toHaveBeenCalledWith('attack_request', expect.objectContaining({
        weapon_id: 'spear',
        aim_x: 100,
        aim_y: 0,
        is_special: false,
      }));
    });

    test('WhenSpecialAbilityInputPressed_ShouldSendSpecialAttackRequest', () => {
      const inputState = { 
        attack: false, 
        specialAbility: true,
        aimX: 200, // Should be ignored
        aimY: 100,  // Should be ignored
      };

      game.handleInput(inputState);
      game.update(0.016);

      expect(mockNetwork.send).toHaveBeenCalledWith('attack_request', expect.objectContaining({
        weapon_id: 'spear',
        aim_x: 100,
        aim_y: 0,
        is_special: true,
      }));
    });

    test('WhenAttackingOnCooldown_ShouldNotSendRequest', () => {
      const localPlayer = game.getLocalPlayer();
      localPlayer.lastAttackTime = Date.now();
      
      const inputState = { attack: true, specialAbility: false };
      game.handleInput(inputState);
      game.update(0.016);

      expect(mockNetwork.send).not.toHaveBeenCalledWith('attack_request', expect.any(Object));
    });
  });

  describe('Host Attack Validation', () => {
    beforeEach(() => {
      game.network.isHost = true;
      // Re-init to create HostCombatManager (since it checks isHost)
      // Actually, HostCombatManager is created if network is present. 
      // But we need to make sure handleAttackRequest uses the updated isHost flag or we mock the manager?
      // The Game class creates HostCombatManager in init.
      // game.network reference is updated, but HostCombatManager takes network in constructor.
      // HostCombatManager constructor stores network. 
      // So if we update game.network.isHost, does HostCombatManager see it?
      // Yes, because it stores the reference.
    });

    test('WhenHostReceivesValidAttack_ShouldUpdateVictimHealth', () => {
      const attackRequest = {
        type: 'attack_request',
        from: 'player-1',
        data: {
          weapon_id: 'spear',
          aim_x: 150,
          aim_y: 100,
          is_special: false,
        },
      };

      // Manually trigger the handler on the HostCombatManager
      game.hostCombatManager.handleAttackRequest(attackRequest, mockPlayersSnapshot);

      const players = mockPlayersSnapshot.getPlayers();
      const victim = players.get('player-2');
      
      // Spear damage is 25. player-2 starts at 100 health.
      // No armor on player-2 in this setup.
      expect(victim.health).toBe(75);
      expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          player_id: 'player-2',
          health: 75,
        }),
      ]));
    });

    test('WhenAttackerIsDead_ShouldIgnoreAttack', () => {
      const players = mockPlayersSnapshot.getPlayers();
      players.get('player-1').health = 0;

      const attackRequest = {
        type: 'attack_request',
        from: 'player-1',
        data: { weapon_id: 'spear', aim_x: 150, aim_y: 100, is_special: false },
      };

      game.hostCombatManager.handleAttackRequest(attackRequest, mockPlayersSnapshot);
      expect(players.get('player-2').health).toBe(100);
    });

    test('WhenTargetOutOfRange_ShouldIgnoreAttack', () => {
      const players = mockPlayersSnapshot.getPlayers();
      // Move player-2 far away
      players.get('player-2').position_x = 1000;

      const attackRequest = {
        type: 'attack_request',
        from: 'player-1',
        data: { weapon_id: 'spear', aim_x: 1000, aim_y: 100, is_special: false },
      };

      game.hostCombatManager.handleAttackRequest(attackRequest, mockPlayersSnapshot);
      expect(players.get('player-2').health).toBe(100);
    });
  });

  describe('Damage Calculation', () => {
    beforeEach(() => {
      game.network.isHost = true;
    });

    test('WhenAttackingArmoredTarget_ShouldApplyResistances', () => {
      const players = mockPlayersSnapshot.getPlayers();
      // Give player-2 Plated armor (resistant to piercing - spear is piercing)
      players.get('player-2').equipped_armor = 'plated';

      const attackRequest = {
        type: 'attack_request',
        from: 'player-1',
        data: { weapon_id: 'spear', aim_x: 150, aim_y: 100, is_special: false },
      };

      game.hostCombatManager.handleAttackRequest(attackRequest, mockPlayersSnapshot);

      // Spear base damage: 25. Plated resistance to piercing: 0.5.
      // Expected damage: 25 * 0.5 = 12.5. New health: 100 - 12.5 = 87.5.
      expect(players.get('player-2').health).toBe(87.5);
    });

    test('WhenAttackingArmoredTarget_ShouldApplyWeaknesses', () => {
      const players = mockPlayersSnapshot.getPlayers();
      // Give player-2 Plated armor (weak to blunt - fist is blunt)
      players.get('player-2').equipped_armor = 'plated';
      players.get('player-1').equipped_weapon = 'fist';

      const attackRequest = {
        type: 'attack_request',
        from: 'player-1',
        data: { weapon_id: 'fist', aim_x: 150, aim_y: 100, is_special: false },
      };

      game.hostCombatManager.handleAttackRequest(attackRequest, mockPlayersSnapshot);

      // Fist base damage: 15. Plated weakness to blunt: 1.5.
      // Expected damage: 15 * 1.5 = 22.5. New health: 100 - 22.5 = 77.5.
      expect(players.get('player-2').health).toBe(77.5);
    });
  });
});