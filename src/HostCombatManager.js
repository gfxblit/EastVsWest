import { CONFIG } from './config.js';

export class HostCombatManager {
  constructor(network, state) {
    this.network = network;
    this.state = state; // Shared game state (conflict zone, etc.)
    this.healthUpdateAccumulator = 0;
    this.playerCooldowns = new Map(); // Track cooldowns independently of snapshot
  }

  update(deltaTime, playersSnapshot) {
    if (!this.network?.isHost || !playersSnapshot) return;

    // Accumulate time since last update
    this.healthUpdateAccumulator += deltaTime;

    // Throttle updates to match zone damage interval
    const updateIntervalSeconds = CONFIG.ZONE.DAMAGE_INTERVAL_SECONDS;
    if (this.healthUpdateAccumulator < updateIntervalSeconds) {
      return;
    }

    const updates = [];
    const players = playersSnapshot.getPlayers();

    // Calculate damage per second based on phase
    const damagePerSecond = CONFIG.ZONE.DAMAGE_PER_SECOND +
      (CONFIG.ZONE.DAMAGE_INCREASE_PER_PHASE * this.state.phase);
    
    // Apply damage for the accumulated time
    const damageAmount = damagePerSecond * this.healthUpdateAccumulator;

    for (const [playerId, player] of players) {
      // Check if player is outside conflict zone
      const distanceFromCenter = Math.sqrt(
        Math.pow(player.position_x - this.state.conflictZone.centerX, 2) +
        Math.pow(player.position_y - this.state.conflictZone.centerY, 2)
      );

      if (distanceFromCenter > this.state.conflictZone.radius) {
        // Apply damage
        const currentHealth = player.health !== undefined ? player.health : 100;
        const newHealth = Math.max(0, currentHealth - damageAmount);

        if (newHealth !== currentHealth) {
          // Update snapshot directly so subsequent ticks use new value
          player.health = newHealth;

          updates.push({
            player_id: playerId,
            health: newHealth
          });
        }
      }
    }

    if (updates.length > 0) {
      this.network.broadcastPlayerStateUpdate(updates);
    }

    // Reset accumulator after processing
    this.healthUpdateAccumulator = 0;
  }

  handleAttackRequest(message, playersSnapshot) {
    if (!this.network?.isHost || !playersSnapshot) return;

    const attackerId = message.from;
    const { aim_x, aim_y, is_special } = message.data;
    const players = playersSnapshot.getPlayers();
    const attacker = players.get(attackerId);

    if (!attacker || attacker.health <= 0) return;

    // Server-side cooldown validation
    const now = Date.now();
    const weaponId = attacker.equipped_weapon;
    const weaponConfig = Object.values(CONFIG.WEAPONS).find(w => w.id === weaponId) || CONFIG.WEAPONS.FIST;
    const cooldown = is_special ? CONFIG.COMBAT.SPECIAL_ABILITY_COOLDOWN_MS : (1000 / weaponConfig.attackSpeed);
    
    // Use independent cooldown tracking
    if (!this.playerCooldowns.has(attackerId)) {
      this.playerCooldowns.set(attackerId, { lastAttackTime: 0, lastSpecialTime: 0 });
    }
    const cooldowns = this.playerCooldowns.get(attackerId);
    const lastTimeKey = is_special ? 'lastSpecialTime' : 'lastAttackTime';
    const lastTime = cooldowns[lastTimeKey] || 0;

    if (now - lastTime < cooldown - 50) { // 50ms buffer for network jitter
      return;
    }
    
    cooldowns[lastTimeKey] = now;

    const aimAngle = Math.atan2(aim_y - attacker.position_y, aim_x - attacker.position_x);
    const arc = this.#calculateAttackArc(weaponConfig, is_special);
    
    const updates = [];
    for (const [victimId, victim] of players) {
      if (victimId === attackerId || victim.health <= 0) continue;

      if (this.#isTargetInAttackArc(attacker, victim, aimAngle, arc, weaponConfig.range)) {
        const damage = this.#calculateDamage(attacker, victim, weaponConfig, is_special);
        const newHealth = Math.max(0, victim.health - damage);

        if (newHealth !== victim.health) {
          victim.health = newHealth;
          updates.push({
            player_id: victimId,
            health: newHealth
          });

          // Check for death
          if (newHealth <= 0) {
            this.network.send('player_death', {
              victim_id: victimId,
              killer_id: attackerId
            });
          }
        }
      }
    }

    if (updates.length > 0) {
      this.network.broadcastPlayerStateUpdate(updates);
    }
  }

  #calculateAttackArc(weaponConfig, isSpecial) {
    if (isSpecial && (weaponConfig.id === 'greataxe' || weaponConfig.id === 'battleaxe')) {
      return CONFIG.COMBAT.DEFAULT_SPIN_ARC;
    }
    if (weaponConfig.targetType === 'multi') {
      return CONFIG.COMBAT.DEFAULT_SWING_ARC;
    }
    return CONFIG.COMBAT.DEFAULT_THRUST_ARC;
  }

  #isTargetInAttackArc(attacker, victim, aimAngle, arc, range) {
    const dx = victim.position_x - attacker.position_x;
    const dy = victim.position_y - attacker.position_y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > range + CONFIG.COMBAT.PLAYER_HITBOX_RADIUS) {
      return false;
    }

    if (arc >= Math.PI * 2) return true;

    const angleToVictim = Math.atan2(dy, dx);
    let angleDiff = Math.abs(angleToVictim - aimAngle);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

    return angleDiff <= arc / 2;
  }

  #calculateDamage(attacker, victim, weaponConfig, isSpecial) {
    let damage = weaponConfig.baseDamage;
    if (isSpecial) damage *= CONFIG.COMBAT.SPECIAL_DAMAGE_MULTIPLIER;

    const victimArmorId = victim.equipped_armor;
    if (victimArmorId) {
      const armorConfig = Object.values(CONFIG.ARMOR).find(a => a.id === victimArmorId);
      if (armorConfig) {
        const resistance = armorConfig.resistances?.[weaponConfig.damageType] || 1.0;
        const weakness = armorConfig.weaknesses?.[weaponConfig.damageType] || 1.0;
        damage = damage * resistance * weakness;
      }
    }

    return damage;
  }
}