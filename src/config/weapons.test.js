/**
 * Tests for weapon configuration
 */

import { WEAPONS } from './weapons.js';

describe('WEAPONS Config', () => {
  test('should have western weapons defined', () => {
    expect(WEAPONS.SPEAR).toBeDefined();
    expect(WEAPONS.SPEAR.faction).toBe('west');
    expect(WEAPONS.SPEAR.damageType).toBe('piercing');

    expect(WEAPONS.BATTLE_AXE).toBeDefined();
    expect(WEAPONS.BATTLE_AXE.damageType).toBe('slashing');
  });

  test('should have eastern weapons defined', () => {
    expect(WEAPONS.BO).toBeDefined();
    expect(WEAPONS.BO.faction).toBe('east');

    expect(WEAPONS.FIST).toBeDefined();
    expect(WEAPONS.FIST.faction).toBe('east');
    expect(WEAPONS.FIST.vfxType).toBe('blunt');
  });

  test('double-handed weapons should have stance property set correctly', () => {
    const doubleHandedWeapons = [
      WEAPONS.GREAT_AXE,
      WEAPONS.GREAT_HAMMER,
      WEAPONS.BO,
    ];

    for (const weapon of doubleHandedWeapons) {
      expect(weapon.stance).toBe('double');
    }
  });

  test('should include all required weapon properties', () => {
    Object.values(WEAPONS).forEach(weapon => {
      expect(weapon.id).toBeDefined();
      expect(weapon.name).toBeDefined();
      expect(weapon.faction).toBeDefined();
      expect(weapon.range).toBeGreaterThan(0);
      expect(weapon.baseDamage).toBeGreaterThan(0);
      expect(weapon.attackSpeed).toBeGreaterThan(0);
    });
  });
});
