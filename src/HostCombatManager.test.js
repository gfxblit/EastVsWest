import { jest } from '@jest/globals';
import { HostCombatManager } from './HostCombatManager.js';
import { CONFIG } from './config.js';

describe('HostCombatManager', () => {
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

  test('WhenAttackKillsVictim_ShouldBroadcastDeathEvent', () => {
    const attacker = {
      id: 'attacker',
      position_x: 0,
      position_y: 0,
      health: 100,
      equipped_weapon: 'fist'
    };
    const victim = {
      id: 'victim',
      position_x: 10,
      position_y: 0,
      health: 10, // Low health, will die from 15 dmg fist
      equipped_armor: null
    };

    mockSnapshot.getPlayers.mockReturnValue(new Map([
      ['attacker', attacker],
      ['victim', victim]
    ]));

    const msg = {
      from: 'attacker',
      data: { weapon_id: 'fist', aim_x: 10, aim_y: 0, is_special: false }
    };

    manager.handleAttackRequest(msg, mockSnapshot);

    // Should update health
    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    const updates = mockNetwork.broadcastPlayerStateUpdate.mock.calls[0][0];
    const victimUpdate = updates.find(u => u.player_id === 'victim');
    expect(victimUpdate.health).toBe(0);

    // Should broadcast death event
    expect(mockNetwork.send).toHaveBeenCalledWith('player_death', expect.objectContaining({
      victim_id: 'victim',
      killer_id: 'attacker'
    }));
  });

  test('ShouldApplyZoneDamageToPlayersOutsideZone', () => {
    const playerOutside = {
        id: 'p1',
        position_x: 200,
        position_y: 200,
        health: 100
    };
    const playerInside = {
        id: 'p2',
        position_x: 0,
        position_y: 0,
        health: 100
    };

    mockSnapshot.getPlayers.mockReturnValue(new Map([
        ['p1', playerOutside],
        ['p2', playerInside]
    ]));

    // Accumulate enough time ( > ZONE.DAMAGE_INTERVAL_SECONDS)
    const deltaTime = 6.0; // 6 seconds
    manager.update(deltaTime, mockSnapshot);

    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    
    // Verify damage logic (10 dmg per sec base)
    const calls = mockNetwork.broadcastPlayerStateUpdate.mock.calls;
    const updates = calls[0][0];
    const updateP1 = updates.find(u => u.player_id === 'p1');
    
    expect(updateP1).toBeDefined();
    expect(updateP1.health).toBeLessThan(100);
    expect(playerOutside.health).toBeLessThan(100); // Should update snapshot object directly
    
    // Player inside should not be damaged
    expect(playerInside.health).toBe(100);
  });

  test('ShouldValidateAttackCooldown', () => {
    const attacker = {
        id: 'attacker',
        position_x: 0,
        position_y: 0,
        health: 100,
        equipped_weapon: 'fist'
    };
    mockSnapshot.getPlayers.mockReturnValue(new Map([['attacker', attacker]]));

    const msg = {
        from: 'attacker',
        data: { weapon_id: 'fist', aim_x: 10, aim_y: 0, is_special: false }
    };

    // Mock Date.now to control time
    const realDateNow = Date.now;
    let now = 1000;
    Date.now = jest.fn(() => now);

    // First attack - should pass
    manager.handleAttackRequest(msg, mockSnapshot);
    
    // Immediate second attack (same time) - should fail cooldown
    mockNetwork.broadcastPlayerStateUpdate.mockClear();
    manager.handleAttackRequest(msg, mockSnapshot);
    expect(mockNetwork.broadcastPlayerStateUpdate).not.toHaveBeenCalled();

    // Advance time past cooldown (Fist speed 2.0 = 500ms cooldown)
    now += 600;
    manager.handleAttackRequest(msg, mockSnapshot);
    // Should pass now, but check if we have a victim to verify broadcast
    // No victim in this test, so it checks logic flow up to valid attack
    
    Date.now = realDateNow;
  });

  test('ShouldCalculateDamageAndBroadcastUpdate', () => {
     const attacker = {
        id: 'attacker',
        position_x: 0,
        position_y: 0,
        health: 100,
        equipped_weapon: 'fist'
    };
    const victim = {
        id: 'victim',
        position_x: 10, // Close enough for fist
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
        data: { weapon_id: 'fist', aim_x: 10, aim_y: 0, is_special: false }
    };

    manager.handleAttackRequest(msg, mockSnapshot);

    expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
    const updates = mockNetwork.broadcastPlayerStateUpdate.mock.calls[0][0];
    const victimUpdate = updates.find(u => u.player_id === 'victim');
    
    expect(victimUpdate).toBeDefined();
    expect(victimUpdate.health).toBe(85); // 100 - 15 (fist base damage)
  });

  test('ShouldUseAuthoritativeWeaponFromSnapshotIgnoringMessageWeaponId', () => {
    const attacker = {
       id: 'attacker',
       position_x: 0,
       position_y: 0,
       health: 100,
       equipped_weapon: 'spear' // Authoritative weapon
   };
   const victim = {
       id: 'victim',
       position_x: 10,
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
       data: { weapon_id: 'fist', aim_x: 10, aim_y: 0, is_special: false } // Client tries to spoof fist
   };

   manager.handleAttackRequest(msg, mockSnapshot);

   expect(mockNetwork.broadcastPlayerStateUpdate).toHaveBeenCalled();
   const updates = mockNetwork.broadcastPlayerStateUpdate.mock.calls[0][0];
   const victimUpdate = updates.find(u => u.player_id === 'victim');
   
   expect(victimUpdate).toBeDefined();
   // Spear base damage is 25, Fist is 15.
   // If it uses authoritative spear, health should be 75.
   expect(victimUpdate.health).toBe(75); 
 });
});
