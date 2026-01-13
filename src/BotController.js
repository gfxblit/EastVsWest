
import { CONFIG } from './config.js';

export class BotController {
  constructor(botId, network, playersSnapshot, game) {
    this.botId = botId;
    this.network = network;
    this.playersSnapshot = playersSnapshot;
    this.game = game; // Access to game state (e.g., conflict zone)
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderTimer = 0;
  }

  update(deltaTime) {
    const players = this.playersSnapshot.getPlayers();
    const bot = players.get(this.botId);

    if (!bot || bot.health <= 0) return;

    const target = this.findTarget();

    if (target) {
      this.moveTowards(bot, target, deltaTime);
      this.attemptAttack(bot, target);
    } else {
      this.wander(bot, deltaTime);
    }
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
        player.position_y - bot.position_y
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

    const moveX = Math.cos(angle) * speed * deltaTime;
    const moveY = Math.sin(angle) * speed * deltaTime;

    const newX = Math.max(0, Math.min(CONFIG.WORLD.WIDTH, bot.position_x + moveX));
    const newY = Math.max(0, Math.min(CONFIG.WORLD.HEIGHT, bot.position_y + moveY));

    // Broadcast movement (Host is authoritative for bots)
    // SessionPlayersSnapshot listens to these broadcasts and updates locally
    this.network.broadcastPlayerStateUpdate({
        player_id: this.botId,
        position_x: newX,
        position_y: newY,
        rotation: angle,
        velocity_x: Math.cos(angle), // Normalized velocity
        velocity_y: Math.sin(angle)
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

    const newX = Math.max(0, Math.min(CONFIG.WORLD.WIDTH, bot.position_x + moveX));
    const newY = Math.max(0, Math.min(CONFIG.WORLD.HEIGHT, bot.position_y + moveY));
    
    this.network.broadcastPlayerStateUpdate({
        player_id: this.botId,
        position_x: newX,
        position_y: newY,
        rotation: this.wanderAngle,
        velocity_x: Math.cos(this.wanderAngle) * 0.5,
        velocity_y: Math.sin(this.wanderAngle) * 0.5
    });
  }

  attemptAttack(bot, target) {
    const dist = Math.hypot(
        target.position_x - bot.position_x,
        target.position_y - bot.position_y
    );

    const weapon = CONFIG.WEAPONS[bot.equipped_weapon?.toUpperCase()] || CONFIG.WEAPONS.FIST;
    const range = weapon.range;

    if (dist <= range) {
        // Send attack request (simulating input)
        // We use sendFrom to ensure the attacker ID is the bot's ID, not the host's ID
        this.network.sendFrom(this.botId, 'attack_request', {
            aim_x: target.position_x,
            aim_y: target.position_y,
            is_special: false
        });
    }
  }
}
