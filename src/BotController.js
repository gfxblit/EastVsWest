
import { CONFIG } from './config.js';
import { resolveCollisionX, resolveCollisionY } from './physicsHelper.js';

export class BotController {
  constructor(botId, network, playersSnapshot, game) {
    this.botId = botId;
    this.network = network;
    this.playersSnapshot = playersSnapshot;
    this.game = game; // Access to game state (e.g., conflict zone)
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderTimer = 0;
    this.lastPickupTime = 0;
  }

  update(deltaTime) {
    const players = this.playersSnapshot.getPlayers();
    const bot = players.get(this.botId);

    if (!bot || bot.health <= 0) return;

    // Check if we need a weapon
    const needsWeapon = !bot.equipped_weapon || bot.equipped_weapon === 'fist';

    // Find nearest loot
    let nearestLoot = needsWeapon ? this.findNearestLoot(bot) : null;
    
    // If we have a target loot, check if it's still available in the game state
    if (this.targetLootId) {
      const lootExists = this.game?.state?.loot.some(l => l.id === this.targetLootId);
      if (!lootExists) {
        this.targetLootId = null;
        nearestLoot = needsWeapon ? this.findNearestLoot(bot) : null;
      } else if (needsWeapon) {
        // If it still exists and we still need it, stay focused on it
        nearestLoot = this.game.state.loot.find(l => l.id === this.targetLootId);
      }
    }

    const target = this.findTarget();

    if (nearestLoot) {
      this.targetLootId = nearestLoot.id;
      const lootPos = { position_x: nearestLoot.x, position_y: nearestLoot.y };
      this.moveTowards(bot, lootPos, deltaTime);
      this.attemptPickupLoot(bot, nearestLoot);
    } else {
      this.targetLootId = null;
      if (target) {
        this.moveTowards(bot, target, deltaTime);
        this.attemptAttack(bot, target);
      } else {
        this.wander(bot, deltaTime);
      }
    }
  }

  findNearestLoot(bot) {
    const loot = this.game?.state?.loot;
    if (!loot || loot.length === 0) return null;

    let nearestLoot = null;
    let minDistance = Infinity;

    for (const item of loot) {
      const dist = Math.hypot(
        item.x - bot.position_x,
        item.y - bot.position_y,
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearestLoot = item;
      }
    }

    return nearestLoot;
  }

  findTarget() {
    const players = this.playersSnapshot.getPlayers();
    const bot = players.get(this.botId);
    if (!bot) return null;

    let nearestTarget = null;
    let minDistance = Infinity;

    for (const [playerId, player] of players) {
      if (playerId === this.botId || player.health <= 0) continue;

      const dist = Math.hypot(
        player.position_x - bot.position_x,
        player.position_y - bot.position_y,
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearestTarget = player;
      }
    }

    return nearestTarget;
  }

  moveTowards(bot, target, deltaTime) {
    const dx = target.position_x - bot.position_x;
    const dy = target.position_y - bot.position_y;
    const angle = Math.atan2(dy, dx);

    const speed = CONFIG.BOT?.MOVEMENT_SPEED || CONFIG.PLAYER.BASE_MOVEMENT_SPEED;
    
    // Stop if very close to avoid jitter
    if (Math.hypot(dx, dy) < (CONFIG.BOT?.STOPPING_DISTANCE || 10)) return;

    const distance = Math.hypot(dx, dy);
    const moveDistance = Math.min(distance, speed * deltaTime);
    const moveX = Math.cos(angle) * moveDistance;
    const moveY = Math.sin(angle) * moveDistance;

    const hitboxRadius = CONFIG.PLAYER.HITBOX_RADIUS;

    // Apply X movement and collision
    let newX = bot.position_x + moveX;
    newX = resolveCollisionX(newX, bot.position_y, hitboxRadius);

    // Apply Y movement and collision
    let newY = bot.position_y + moveY;
    newY = resolveCollisionY(newX, newY, hitboxRadius);

    // Clamp to world bounds
    newX = Math.max(0, Math.min(CONFIG.WORLD.WIDTH, newX));
    newY = Math.max(0, Math.min(CONFIG.WORLD.HEIGHT, newY));

    // Broadcast movement (Host is authoritative for bots)
    // SessionPlayersSnapshot listens to these broadcasts and updates locally
    this.network.broadcastPlayerStateUpdate({
      player_id: this.botId,
      position_x: newX,
      position_y: newY,
      rotation: angle,
      velocity_x: Math.cos(angle), // Normalized velocity
      velocity_y: Math.sin(angle),
    });
  }

  wander(bot, deltaTime) {
    this.wanderTimer -= deltaTime;
    if (this.wanderTimer <= 0) {
      this.wanderAngle += (Math.random() - 0.5) * 2; // Change angle slightly
      this.wanderTimer = 2.0; // Change every 2 seconds
    }

    const speed = (CONFIG.BOT?.MOVEMENT_SPEED || CONFIG.PLAYER.BASE_MOVEMENT_SPEED) * 0.5; // Walk slower when wandering
    const moveX = Math.cos(this.wanderAngle) * speed * deltaTime;
    const moveY = Math.sin(this.wanderAngle) * speed * deltaTime;

    const hitboxRadius = CONFIG.PLAYER.HITBOX_RADIUS;

    // Apply X movement and collision
    let newX = bot.position_x + moveX;
    newX = resolveCollisionX(newX, bot.position_y, hitboxRadius);

    // Apply Y movement and collision
    let newY = bot.position_y + moveY;
    newY = resolveCollisionY(newX, newY, hitboxRadius);

    // Clamp to world bounds
    newX = Math.max(0, Math.min(CONFIG.WORLD.WIDTH, newX));
    newY = Math.max(0, Math.min(CONFIG.WORLD.HEIGHT, newY));
    
    this.network.broadcastPlayerStateUpdate({
      player_id: this.botId,
      position_x: newX,
      position_y: newY,
      rotation: this.wanderAngle,
      velocity_x: Math.cos(this.wanderAngle) * 0.5,
      velocity_y: Math.sin(this.wanderAngle) * 0.5,
    });
  }

  attemptAttack(bot, target) {
    const dist = Math.hypot(
      target.position_x - bot.position_x,
      target.position_y - bot.position_y,
    );

    const weapon = CONFIG.WEAPONS[bot.equipped_weapon?.toUpperCase()] || CONFIG.WEAPONS.FIST;
    const range = weapon.range;

    if (dist <= range) {
      // Send attack request (simulating input)
      // We use sendFrom to ensure the attacker ID is the bot's ID, not the host's ID
      this.network.sendFrom(this.botId, 'attack_request', {
        aim_x: target.position_x,
        aim_y: target.position_y,
        is_special: false,
      });
    }
  }

  attemptPickupLoot(bot, lootItem) {
    const now = Date.now();
    if (now - this.lastPickupTime < 500) return;

    const dist = Math.hypot(
      lootItem.x - bot.position_x,
      lootItem.y - bot.position_y,
    );

    if (dist <= (CONFIG.LOOT?.PICKUP_RADIUS || 50)) {
      this.network.sendFrom(this.botId, 'pickup_request', {
        loot_id: lootItem.id,
      });
      this.lastPickupTime = now;
    }
  }
}
