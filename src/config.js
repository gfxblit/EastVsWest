/**
 * Game Configuration
 * Based on the game design for Conflict Zone: East vs West
 */

export const CONFIG = {
  // Game Settings
  GAME: {
    MAX_PLAYERS: 12,
    MATCH_DURATION_SECONDS: 300, // 5 minutes
    INITIAL_ZONE_SHRINK_DELAY_SECONDS: 60, // 1 minute before shrinking starts
  },

  // Canvas Settings
  // Note: These are default/reference dimensions. Canvas will resize to fill viewport.
  CANVAS: {
    WIDTH: 1920,
    HEIGHT: 1080,
    BACKGROUND_COLOR: '#2a2a2a',
  },

  // World Settings
  WORLD: {
    WIDTH: 2400,
    HEIGHT: 1600,
  },

  // Camera Settings
  CAMERA: {
    LERP_FACTOR: 0.15, // Smooth interpolation
  },

  // Player Settings
  PLAYER: {
    BASE_MOVEMENT_SPEED: 200, // pixels per second
    DOUBLE_HANDED_SPEED_MODIFIER: 0.85, // -15% speed for double-handed weapons
    SPAWN_INVULNERABILITY_MS: 3000, // 3 seconds of invulnerability after spawn
  },

  // Conflict Zone Settings
  ZONE: {
    INITIAL_RADIUS: 600,
    MIN_RADIUS: 50, // Minimum zone size
    BASE_SHRINK_RATE: 10, // Base shrink rate in pixels per second
    SHRINK_RATE_MULTIPLIER: 1.5, // Increases each phase
    DAMAGE_PER_SECOND: 10,
    DAMAGE_INCREASE_PER_PHASE: 5,
  },

  // Rendering Settings
  RENDER: {
    PLAYER_RADIUS: 60,
    HEALTH_BAR_WIDTH: 40,
    HEALTH_BAR_HEIGHT: 5,
    HEALTH_BAR_OFFSET_FROM_PLAYER: 10, // Distance above player sprite (added to PLAYER_RADIUS)
  },

  // Weapon Types
  WEAPONS: {
    // Western Melee Weapons
    SPEAR: {
      id: 'spear',
      name: 'Spear',
      faction: 'west',
      stance: 'single',
      targetType: 'single',
      damageType: 'piercing',
      range: 150,
      baseDamage: 25,
      attackSpeed: 1.0, // attacks per second
      specialAbility: 'lunge',
    },
    BATTLE_AXE: {
      id: 'battleaxe',
      name: 'Battle Axe',
      faction: 'west',
      stance: 'single',
      targetType: 'multi',
      damageType: 'slashing',
      range: 100,
      baseDamage: 30,
      attackSpeed: 1.0,
      specialAbility: 'spin',
    },
    GREAT_AXE: {
      id: 'greataxe',
      name: 'Great Axe',
      faction: 'west',
      stance: 'double',
      targetType: 'multi',
      damageType: 'slashing',
      range: 100,
      baseDamage: 45,
      attackSpeed: 0.7,
      specialAbility: 'whirlwind',
    },
    GREAT_HAMMER: {
      id: 'greathammer',
      name: 'Great Hammer',
      faction: 'west',
      stance: 'double',
      targetType: 'single',
      damageType: 'blunt',
      range: 80,
      baseDamage: 50,
      attackSpeed: 0.6,
      specialAbility: 'smash',
    },

    // Eastern Melee Weapons
    BO: {
      id: 'bo',
      name: 'Bo',
      faction: 'east',
      stance: 'double',
      targetType: 'single',
      damageType: 'blunt',
      range: 120,
      baseDamage: 20,
      attackSpeed: 1.5,
      specialAbility: 'charged_smack',
    },
    FIST: {
      id: 'fist',
      name: 'Fist',
      faction: 'east',
      stance: 'single',
      targetType: 'single',
      damageType: 'blunt',
      range: 50,
      baseDamage: 15,
      attackSpeed: 2.0,
      specialAbility: 'grab_throw',
    },
  },

  // Armor Types
  ARMOR: {
    PLATED: {
      id: 'plated',
      name: 'Plated Armor',
      resistances: { slashing: 0.5, piercing: 0.5 },
      weaknesses: { blunt: 1.5 },
    },
    CHAINMAIL: {
      id: 'chainmail',
      name: 'Chainmail',
      resistances: { slashing: 0.6 },
      weaknesses: { blunt: 1.3, piercing: 1.2 },
    },
    PADDED: {
      id: 'padded',
      name: 'Padded Armor',
      resistances: { slashing: 0.9, piercing: 0.9, blunt: 0.9 },
      weaknesses: {},
    },
    WOVEN: {
      id: 'woven',
      name: 'Woven Robes',
      resistances: { blunt: 0.6 },
      weaknesses: { slashing: 1.4, piercing: 1.4 },
    },
  },

  // Input Settings
  INPUT: {
    KEYBOARD_MOVE_KEYS: {
      w: { x: 0, y: -1 },
      a: { x: -1, y: 0 },
      s: { x: 0, y: 1 },
      d: { x: 1, y: 0 },
    },
    SPECIAL_ABILITY_KEY: 'q',
    INTERACT_KEY: 'f',
    MAX_JOYSTICK_DISTANCE: 45, // Maximum distance for virtual joystick movement
  },

  // Network Settings
  NETWORK: {
    POSITION_UPDATE_RATE: 20, // position updates per second (20 Hz as per NETWORK_DESIGN.md)
    POSITION_UPDATE_INTERVAL_MS: 50, // interval between position updates (1000ms / 20Hz = 50ms)
    INTERPOLATION_DELAY_MS: 100,
  },

  // Asset Settings
  ASSETS: {
    BASE_URL: import.meta.env?.BASE_URL || '/',
  },
};
