import { CONFIG } from './config.js';

export class HostCombatManager {
  constructor(network, state) {
    this.network = network;
    this.state = state; // Shared game state (conflict zone, etc.)
    this.healthUpdateAccumulator = 0;
    this.playerCooldowns = new Map(); // Track cooldowns independently of snapshot
    this.isEnding = false;
  }

  update(deltaTime, playersSnapshot) {
    if (!this.network?.isHost || !playersSnapshot || this.isEnding) return;

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
      this.checkForWinCondition(playersSnapshot);
    }

    // Reset accumulator after processing
    this.healthUpdateAccumulator = 0;
  }

  handleAttackRequest(message, playersSnapshot) {
    if (!this.network?.isHost || !playersSnapshot || this.isEnding) return;

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
    
    // Special Ability adjustments
    let effectiveRange = weaponConfig.range;
    if (is_special && weaponConfig.specialAbility === 'lunge') {
        effectiveRange += CONFIG.WEAPON_ABILITIES.LUNGE_RANGE_EXTENSION;
    }

    const updates = [];
    for (const [victimId, victim] of players) {
      if (victimId === attackerId || victim.health <= 0) continue;

      if (this.#isTargetInAttackArc(attacker, victim, aimAngle, arc, effectiveRange)) {
        const damage = this.#calculateDamage(attacker, victim, weaponConfig, is_special);
        const newHealth = Math.max(0, victim.health - damage);

        if (newHealth !== victim.health) {
          victim.health = newHealth;
          const update = {
            player_id: victimId,
            health: newHealth
          };

          // Apply Status Effects for Special Abilities
          if (is_special) {
              let stunDuration = 0;
              if (weaponConfig.specialAbility === 'smash') stunDuration = CONFIG.WEAPON_ABILITIES.SMASH_STUN_DURATION;
              if (weaponConfig.specialAbility === 'charged_smack') stunDuration = CONFIG.WEAPON_ABILITIES.CHARGED_SMACK_STUN_DURATION;
              if (weaponConfig.specialAbility === 'grab_throw') stunDuration = CONFIG.WEAPON_ABILITIES.GRAB_THROW_STUN_DURATION;

              if (stunDuration > 0) {
                  const stunUntil = Date.now() + stunDuration;
                  victim.stunned_until = stunUntil;
                  update.stunned_until = stunUntil;
              }
          }
          
          updates.push(update);

          // Handle Death and Kills
          if (newHealth <= 0) {
            this.network.send('player_death', {
              victim_id: victimId,
              killer_id: attackerId
            });

            attacker.kills = (attacker.kills || 0) + 1;
            updates.push({
              player_id: attackerId,
              kills: attacker.kills
            });
          }
        }
      }
    }

    if (updates.length > 0) {
      this.network.broadcastPlayerStateUpdate(updates);
      this.checkForWinCondition(playersSnapshot);
    }
  }

  checkForWinCondition(playersSnapshot) {
    if (!this.state.isRunning || this.isEnding) return;

    const players = playersSnapshot.getPlayers();
    
    // Filter out inactive players:
    // 1. Must not be explicitly disconnected
    // 2. Must have > 0 health (undefined defaults to 100, assuming fresh spawn)
    const activePlayers = Array.from(players.values()).filter(p => {
      if (p.is_connected === false) return false;
      return (p.health ?? 100) > 0;
    });

    if (CONFIG.DEBUG_COMBAT) {
      console.log(`[HostCombatManager] Active players: ${activePlayers.length}`, 
        activePlayers.map(p => `${p.player_name || p.name || 'Unknown'}(${p.health ?? 100}hp)`));
    }

    // If 1 or fewer players remain alive, end the match
    // (If 0, it's a draw or everyone died)
    if (activePlayers.length <= 1) {
      this.isEnding = true;
      const winner = activePlayers[0];
      
      const stats = Array.from(players.values()).map(p => ({
        player_id: p.player_id || p.id,
        name: p.player_name || p.name || 'Unknown',
        kills: p.kills || 0,
        is_bot: !!p.is_bot
      }));

      setTimeout(() => {
        this.network.send('game_over', {
          winner_id: winner ? (winner.player_id || winner.id) : null,
          stats: stats
        });
        
        this.state.isRunning = false;
      }, CONFIG.GAME.VICTORY_DELAY_MS || 3000);
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