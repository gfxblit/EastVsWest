/**
 * Tests for config.js
 */

import { CONFIG } from './config.js';

describe('CONFIG', () => {
  test('should have game settings defined', () => {
    expect(CONFIG.GAME).toBeDefined();
    expect(CONFIG.GAME.MAX_PLAYERS).toBe(12);
    expect(CONFIG.GAME.MATCH_DURATION_SECONDS).toBe(300);
  });

  test('should have canvas settings defined', () => {
    expect(CONFIG.CANVAS).toBeDefined();
    expect(CONFIG.CANVAS.WIDTH).toBe(1200);
    expect(CONFIG.CANVAS.HEIGHT).toBe(800);
  });

  test('should have player settings defined', () => {
    expect(CONFIG.PLAYER).toBeDefined();
    expect(CONFIG.PLAYER.BASE_MOVEMENT_SPEED).toBeGreaterThan(0);
    expect(CONFIG.PLAYER.DOUBLE_HANDED_SPEED_MODIFIER).toBe(0.85);
  });

  test('should have western weapons defined', () => {
    expect(CONFIG.WEAPONS.SPEAR).toBeDefined();
    expect(CONFIG.WEAPONS.SPEAR.faction).toBe('west');
    expect(CONFIG.WEAPONS.SPEAR.damageType).toBe('piercing');

    expect(CONFIG.WEAPONS.BATTLE_AXE).toBeDefined();
    expect(CONFIG.WEAPONS.BATTLE_AXE.damageType).toBe('slashing');
  });

  test('should have eastern weapons defined', () => {
    expect(CONFIG.WEAPONS.BO).toBeDefined();
    expect(CONFIG.WEAPONS.BO.faction).toBe('east');

    expect(CONFIG.WEAPONS.FIST).toBeDefined();
    expect(CONFIG.WEAPONS.FIST.faction).toBe('east');
  });

  test('should have armor types defined', () => {
    expect(CONFIG.ARMOR.PLATED).toBeDefined();
    expect(CONFIG.ARMOR.PLATED.resistances).toBeDefined();
    expect(CONFIG.ARMOR.PLATED.weaknesses).toBeDefined();
  });

  test('should have input settings defined', () => {
    expect(CONFIG.INPUT).toBeDefined();
    expect(CONFIG.INPUT.KEYBOARD_MOVE_KEYS).toBeDefined();
    expect(CONFIG.INPUT.SPECIAL_ABILITY_KEY).toBe('q');
    expect(CONFIG.INPUT.INTERACT_KEY).toBe('f');
  });

  test('double-handed weapons should have stance property set correctly', () => {
    const doubleHandedWeapons = [
      CONFIG.WEAPONS.GREAT_AXE,
      CONFIG.WEAPONS.GREAT_HAMMER,
      CONFIG.WEAPONS.BO,
    ];

    for (const weapon of doubleHandedWeapons) {
      expect(weapon.stance).toBe('double');
    }
  });

  test('armor resistances should be damage reduction multipliers', () => {
    // Resistances should be less than 1.0 (reduce damage)
    expect(CONFIG.ARMOR.PLATED.resistances.slashing).toBeLessThan(1.0);
    expect(CONFIG.ARMOR.PLATED.resistances.piercing).toBeLessThan(1.0);

    // Weaknesses should be greater than 1.0 (increase damage)
    expect(CONFIG.ARMOR.PLATED.weaknesses.blunt).toBeGreaterThan(1.0);
  });
});
