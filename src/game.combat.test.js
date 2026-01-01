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
      isHost: false,
    };

    mockPlayersSnapshot = {
      getPlayers: jest.fn().mockReturnValue(new Map([
        ['player-1', {
          player_id: 'player-1',
          position_x: 100,
          position_y: 100,
          health: 100,
          equipped_weapon: 'spear'
        }],
        ['player-2', {
          player_id: 'player-2',
          position_x: 150,
          position_y: 100,
          health: 100,
          equipped_weapon: 'fist'
        }]
      ]))
    };

    game = new Game();
    game.init(mockPlayersSnapshot, mockNetwork);
  });

  describe('Player Combat State', () => {
    test('WhenInitialized_ShouldHaveCooldownTimers', () => {
      expect(game.localPlayer.lastAttackTime).toBe(0);
      expect(game.localPlayer.lastSpecialTime).toBe(0);
    });
  });

  describe('Input Handling & Attack Requests', () => {
    test('WhenAttackInputPressed_ShouldSendAttackRequest', () => {
      const inputState = { 
        attack: true, 
        specialAbility: false,
        aimX: 200,
        aimY: 100
      };

      game.handleInput(inputState);

      expect(mockNetwork.send).toHaveBeenCalledWith('attack_request', expect.objectContaining({
        weapon_id: 'spear',
        aim_x: 200,
        aim_y: 100,
        is_special: false
      }));
    });

    test('WhenSpecialAbilityInputPressed_ShouldSendSpecialAttackRequest', () => {
      const inputState = { 
        attack: false, 
        specialAbility: true,
        aimX: 200,
        aimY: 100
      };

      game.handleInput(inputState);

      expect(mockNetwork.send).toHaveBeenCalledWith('attack_request', expect.objectContaining({
        weapon_id: 'spear',
        aim_x: 200,
        aim_y: 100,
        is_special: true
      }));
    });

    test('WhenAttackingOnCooldown_ShouldNotSendRequest', () => {
      game.localPlayer.lastAttackTime = Date.now();
      
      const inputState = { attack: true, specialAbility: false };
      game.handleInput(inputState);

      expect(mockNetwork.send).not.toHaveBeenCalledWith('attack_request', expect.any(Object));
    });
  });

  describe('Host Attack Validation', () => {
    beforeEach(() => {
      game.network.isHost = true;
    });

    test('WhenHostReceivesValidAttack_ShouldUpdateVictimHealth', () => {
      const attackRequest = {
        type: 'attack_request',
        from: 'player-1',
        data: {
          weapon_id: 'spear',
          aim_x: 150,
          aim_y: 100,
          is_special: false
        }
      };

      // Manually trigger the handler (which we'll implement)
      game.handleAttackRequest(attackRequest);

      const players = mockPlayersSnapshot.getPlayers();
      const victim = players.get('player-2');
      
      // Spear damage is 25. player-2 starts at 100 health.
      // No armor on player-2 in this setup.
      expect(victim.health).toBe(75);
      expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          player_id: 'player-2',
          health: 75
        })
      ]));
    });

    test('WhenAttackerIsDead_ShouldIgnoreAttack', () => {
      const players = mockPlayersSnapshot.getPlayers();
      players.get('player-1').health = 0;

      const attackRequest = {
        type: 'attack_request',
        from: 'player-1',
        data: { weapon_id: 'spear', aim_x: 150, aim_y: 100, is_special: false }
      };

      game.handleAttackRequest(attackRequest);
      expect(players.get('player-2').health).toBe(100);
    });

    test('WhenTargetOutOfRange_ShouldIgnoreAttack', () => {
      const players = mockPlayersSnapshot.getPlayers();
      // Move player-2 far away
      players.get('player-2').position_x = 1000;

      const attackRequest = {
        type: 'attack_request',
        from: 'player-1',
        data: { weapon_id: 'spear', aim_x: 1000, aim_y: 100, is_special: false }
      };

      game.handleAttackRequest(attackRequest);
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
        data: { weapon_id: 'spear', aim_x: 150, aim_y: 100, is_special: false }
      };

      game.handleAttackRequest(attackRequest);

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
        data: { weapon_id: 'fist', aim_x: 150, aim_y: 100, is_special: false }
      };

      game.handleAttackRequest(attackRequest);

      // Fist base damage: 15. Plated weakness to blunt: 1.5.
      // Expected damage: 15 * 1.5 = 22.5. New health: 100 - 22.5 = 77.5.
      expect(players.get('player-2').health).toBe(77.5);
    });
  });
});
