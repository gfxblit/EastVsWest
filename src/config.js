/**
 * Game Configuration
 * Based on the game design for Conflict Zone: East vs West
 * 
 * NOTE: This is a THIRD test comment for the Gemini PR reviewer workflow.
 */

import { WEAPONS } from './config/weapons.js';

export const CONFIG = {
  // Game Settings
  GAME: {
    MAX_PLAYERS: 12,
    MIN_PLAYERS: 4,
    MATCH_DURATION_SECONDS: 300, // 5 minutes
    INITIAL_ZONE_SHRINK_DELAY_SECONDS: 60, // 1 minute before shrinking starts
    INITIAL_LOOT_COUNT: 20,
    VICTORY_DELAY_MS: 3000,
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
    MAX_HEALTH: 100,
    HITBOX_RADIUS: 40, // Collision half-width/height
    SPAWN_RADIUS: 200, // Distance from center for distributed spawns
  },

  // Conflict Zone Settings
  ZONE: {
    INITIAL_RADIUS: 600,
    MIN_RADIUS: 50, // Minimum zone size
    BASE_SHRINK_RATE: 10, // Base shrink rate in pixels per second
    SHRINK_RATE_MULTIPLIER: 1.5, // Increases each phase
    DAMAGE_PER_SECOND: 10, // Effective DPS (applied in intervals)
    DAMAGE_INCREASE_PER_PHASE: 1,
    DAMAGE_INTERVAL_SECONDS: 2.5, // Apply damage every 2.5 seconds
  },

  // Rendering Settings
  RENDER: {
    PLAYER_RADIUS: 60,
    HEALTH_BAR_WIDTH: 40,
    HEALTH_BAR_HEIGHT: 5,
    HEALTH_BAR_OFFSET_FROM_PLAYER: 10, // Distance above player sprite (added to PLAYER_RADIUS)
  },

  // Weapon Types
  WEAPONS,

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
      KeyW: { x: 0, y: -1 },
      KeyA: { x: -1, y: 0 },
      KeyS: { x: 0, y: 1 },
      KeyD: { x: 1, y: 0 },
      // Arrow keys for compatibility
      ArrowUp: { x: 0, y: -1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowDown: { x: 0, y: 1 },
      ArrowRight: { x: 1, y: 0 },
    },
    SPECIAL_ABILITY_KEY: 'KeyQ',
    INTERACT_KEY: 'KeyF',
    DEBUG_CYCLE_WEAPON_KEY: 'KeyT',
    DEBUG_TOGGLE_KEY: 'KeyO',
    MAX_JOYSTICK_DISTANCE: 45, // Maximum distance for virtual joystick movement
  },

  // Network Settings
  NETWORK: {
    GAME_SIMULATION_INTERVAL_MS: 50, // interval between position updates (20 Hz = 50ms)
    INTERPOLATION_DELAY_MS: 100,
    INTERPOLATION_BUFFER_SIZE: 3,
    CLIENT_AUTHORITATIVE_FIELDS: ['position_x', 'position_y', 'rotation', 'velocity_x', 'velocity_y', 'is_connected'],
  },

  // Asset Settings
  ASSETS: {
    BASE_URL: import.meta.env?.BASE_URL || '/',
    SPRITE_SHEET: {
      PATH: 'assets/player/player-walk-spritesheet.png',
      METADATA: 'assets/player/player-walk-spritesheet.json',
    },
    PLAYER_SLASH: {
      PATH: 'assets/player/player-slash-spritesheet.png',
      METADATA: 'assets/player/player-slash-spritesheet.json',
    },
    PLAYER_DEATH: {
      PATH: 'assets/player/player-death-spritesheet.png',
    },
    VFX: {
      SLASH: {
        UP: 'assets/vfx/slash-up.png',
        DOWN: 'assets/vfx/slash-down.png',
        LEFT: 'assets/vfx/slash-left.png',
        RIGHT: 'assets/vfx/slash-right.png',
      },
      THRUST: {
        UP: 'assets/vfx/thrust-up.png',
        DOWN: 'assets/vfx/thrust-down.png',
        LEFT: 'assets/vfx/thrust-left.png',
        RIGHT: 'assets/vfx/thrust-right.png',
      },
      BLUNT: {
        UP: 'assets/vfx/blunt-up.png',
        DOWN: 'assets/vfx/blunt-down.png',
        LEFT: 'assets/vfx/blunt-left.png',
        RIGHT: 'assets/vfx/blunt-right.png',
      },
    },
    WEAPONS_BASE_URL: 'assets/weapons/',
  },

  // Animation Settings
  ANIMATION: {
    FPS: 15,
    FRAMES_PER_DIRECTION: 4,
    DEATH_FPS: 10,
    DEATH_FRAME_COUNT: 5,
    VFX_FPS: 25, // 5 frames over 0.2s
  },

  
  // Combat Settings
  COMBAT: {
    ATTACK_AIM_DISTANCE: 100,
    SPECIAL_ABILITY_COOLDOWN_MS: 3000,
    SPECIAL_DAMAGE_MULTIPLIER: 1.5,
    ATTACK_ANIMATION_DURATION_SECONDS: 0.2, // 200ms animation
    // Offsets are defined for the RIGHT facing direction (x = forward, y = lateral/down)
    // Other directions will rotate these offsets accordingly.
    SLASH_VFX_OFFSET: { x: 10, y: 10 },
    SLASH_VFX_SCALE: 3.0,
    THRUST_VFX_OFFSET: { x: 120, y: 20 },
    THRUST_VFX_SCALE: 2.0,
    BLUNT_VFX_OFFSET: { x: 75, y: 0 },
    BLUNT_VFX_SCALE: 1.0,
    PLAYER_HITBOX_RADIUS: 60,
    DEFAULT_THRUST_ARC: Math.PI / 4, // 45 degrees
    DEFAULT_SWING_ARC: (120 * Math.PI) / 180, // 120 degrees
    DEFAULT_SPIN_ARC: Math.PI * 2, // 360 degrees
  },

  // Loot Settings
  LOOT: {
    PICKUP_RADIUS: 80,
  },

  // Bot Settings
  BOT: {
    STOPPING_DISTANCE: 40,
    MOVEMENT_SPEED: 50,
  },

  // Environmental Props
  PROPS: {
    TYPES: {
      TREE: { 
        renderWidth: 70, renderHeight: 150, 
        hitboxWidth: 60, hitboxHeight: 140, 
        color: '#2d5a27', type: 'tree', src: 'assets/props/tree.png' 
      },
      ROCK: { 
        renderWidth: 128, renderHeight: 100, 
        hitboxWidth: 70, hitboxHeight: 50, 
        color: '#7a7a7a', type: 'rock', src: 'assets/props/rock.png' 
      },
    },
    // Static map definition
    MAP: [
      { id: 'tree_1', type: 'tree', x: 400, y: 400 },
      { id: 'tree_2', type: 'tree', x: 450, y: 550 },
      { id: 'rock_1', type: 'rock', x: 600, y: 300 },
      { id: 'rock_2', type: 'rock', x: 1000, y: 600 },
      { id: 'tree_3', type: 'tree', x: 1600, y: 1200 },
    ]
  },
};
