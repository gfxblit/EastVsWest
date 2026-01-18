import { jest } from '@jest/globals';
import { HostCombatManager } from './HostCombatManager.js';
import { CONFIG } from './config.js';

describe('HostCombatManager Special Abilities', () => {
  let manager;
  let mockNetwork;
  let mockSnapshot;
  let mockState;

  beforeEach(() => {
    mockNetwork = {
      isHost: true,
      broadcastPlayerStateUpdate: jest.fn(),
      send: jest.fn(),
    };
    mockSnapshot = {
      getPlayers: jest.fn(),
    };
    mockState = {
      conflictZone: {
        centerX: 0,
        centerY: 0,
        radius: 100,
      },
      phase: 0,
    };
    manager = new HostCombatManager(mockNetwork, mockState);
  });

  test('Spear Lunge should have extended range', () => {
    const attacker = {
      id: 'attacker',
      position_x: 0,
      position_y: 0,
      health: 100,
      equipped_weapon: 'spear'
    };
    // Spear range is 150. Victim at 220 is out of range for normal attack, but in range for Lunge (150+100=250)
    const victim = {
      id: 'victim',
      position_x: 220,
      position_y: 0,
      health: 100,
      equipped_armor: null
    };

    mockSnapshot.getPlayers.mockReturnValue(new Map([
      ['attacker', attacker],
      ['victim', victim]
    ]));

    const msg = {
      from: 'attacker',
      data: { weapon_id: 'spear', aim_x: 220, aim_y: 0, is_special: true }
    };

    manager.handleAttackRequest(msg, mockSnapshot);

    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    const updates = mockNetwork.broadcastPlayerStateUpdate.mock.calls[0][0];
    const victimUpdate = updates.find(u => u.player_id === 'victim');
    
    expect(victimUpdate).toBeDefined();
    // Spear base 25 * 1.5 special multiplier = 37.5
    expect(victimUpdate.health).toBe(62.5);
  });

  test('Hammer Smash should apply stun', () => {
    const attacker = {
      id: 'attacker',
      position_x: 0,
      position_y: 0,
      health: 100,
      equipped_weapon: 'greathammer'
    };
    const victim = {
      id: 'victim',
      position_x: 50,
      position_y: 0,
      health: 100,
      equipped_armor: null
    };

    mockSnapshot.getPlayers.mockReturnValue(new Map([
      ['attacker', attacker],
      ['victim', victim]
    ]));

    const now = 10000;
    const realDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const msg = {
      from: 'attacker',
      data: { weapon_id: 'greathammer', aim_x: 50, aim_y: 0, is_special: true }
    };

    manager.handleAttackRequest(msg, mockSnapshot);

    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    const updates = mockNetwork.broadcastPlayerStateUpdate.mock.calls[0][0];
    const victimUpdate = updates.find(u => u.player_id === 'victim');
    
    expect(victimUpdate).toBeDefined();
    expect(victimUpdate.stunned_until).toBe(now + 1000); // 1s stun
    
    Date.now = realDateNow;
  });

  test('Fist Grab should apply stun', () => {
    const attacker = {
      id: 'attacker',
      position_x: 0,
      position_y: 0,
      health: 100,
      equipped_weapon: 'fist'
    };
    const victim = {
      id: 'victim',
      position_x: 20,
      position_y: 0,
      health: 100,
      equipped_armor: null
    };

    mockSnapshot.getPlayers.mockReturnValue(new Map([
      ['attacker', attacker],
      ['victim', victim]
    ]));

    const now = 20000;
    const realDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const msg = {
      from: 'attacker',
      data: { weapon_id: 'fist', aim_x: 20, aim_y: 0, is_special: true }
    };

    manager.handleAttackRequest(msg, mockSnapshot);

    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    const updates = mockNetwork.broadcastPlayerStateUpdate.mock.calls[0][0];
    const victimUpdate = updates.find(u => u.player_id === 'victim');
    
    expect(victimUpdate).toBeDefined();
    expect(victimUpdate.stunned_until).toBe(now + 500); // 0.5s stun
    
    Date.now = realDateNow;
  });

  test('Bo Charged Smack should apply stun', () => {
    const attacker = {
      id: 'attacker',
      position_x: 0,
      position_y: 0,
      health: 100,
      equipped_weapon: 'bo'
    };
    const victim = {
      id: 'victim',
      position_x: 50,
      position_y: 0,
      health: 100,
      equipped_armor: null
    };

    mockSnapshot.getPlayers.mockReturnValue(new Map([
      ['attacker', attacker],
      ['victim', victim]
    ]));

    const now = 30000;
    const realDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const msg = {
      from: 'attacker',
      data: { weapon_id: 'bo', aim_x: 50, aim_y: 0, is_special: true }
    };

    manager.handleAttackRequest(msg, mockSnapshot);

    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    const updates = mockNetwork.broadcastPlayerStateUpdate.mock.calls[0][0];
    const victimUpdate = updates.find(u => u.player_id === 'victim');
    
    expect(victimUpdate).toBeDefined();
    expect(victimUpdate.stunned_until).toBe(now + 1000); // 1s stun
    
    Date.now = realDateNow;
  });
});
