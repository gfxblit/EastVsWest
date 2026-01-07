import { CONFIG } from './config.js';
import { getDirectionFromVelocity, getDirectionFromRotation, AnimationState } from './animationHelper.js';

export class LocalPlayerController {
  constructor(network, initialData) {
    this.network = network;
    this.player = this.#initializePlayer(initialData);
    this.lastPositionSendTime = 0;
    this.lastSentState = null;
    this.inputState = {
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      attack: false,
      specialAbility: false,
      interact: false,
    };
    this.wasInteracting = false;

    // Initialize lastSentState to prevent unnecessary initial send
    if (this.player) {
      this.lastSentState = {
        x: this.player.x,
        y: this.player.y,
        rotation: this.player.rotation,
        health: this.player.health,
        vx: this.player.velocity.x,
        vy: this.player.velocity.y,
      };
    }
  }

  #initializePlayer(data) {
    return {
      id: this.network ? this.network.playerId : 'player-1',
      name: data?.player_name || 'Player',
      x: data?.position_x !== undefined ? data.position_x : CONFIG.WORLD.WIDTH / 2,
      y: data?.position_y !== undefined ? data.position_y : CONFIG.WORLD.HEIGHT / 2,
      rotation: data?.rotation || 0,
      health: data?.health !== undefined ? data.health : 100,
      equipped_weapon: data?.equipped_weapon || 'fist',
      armor: data?.equipped_armor || null,
      lastAttackTime: 0,
      lastSpecialTime: 0,
      isAttacking: false,
      attackAnimTime: 0,
      velocity: {
        x: data?.velocity_x || 0,
        y: data?.velocity_y || 0
      },
      animationState: new AnimationState(),
    };
  }

  getPlayer() {
    return this.player;
  }

  isDead() {
    return this.player && this.player.health <= 0;
  }

  update(deltaTime, playersSnapshot, loot = []) {
    if (!this.player) return;

    // If dead, ensure velocity is zero and skip movement/animation updates
    if (this.isDead()) {
      this.player.velocity = { x: 0, y: 0 };
      this.player.isAttacking = false;
    } else {
      this.#updatePhysics(deltaTime);
      this.#updateAnimation(deltaTime);
      this.#handleLootInteraction(loot);
    }
    
    // Handle Attack/Special Ability continuously if button is held
    if (this.inputState.attack || this.inputState.specialAbility) {
      this.#handleAttack(this.inputState);
    }
    
    if (playersSnapshot) {
        this.#syncWithSnapshot(playersSnapshot);
        this.#broadcastPosition();
    }

    this.wasInteracting = this.inputState.interact;
  }

  #handleLootInteraction(loot) {
    if (!this.network || !loot || loot.length === 0) return;

    for (const item of loot) {
      const dx = this.player.x - item.x;
      const dy = this.player.y - item.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= CONFIG.LOOT.PICKUP_RADIUS) {
        const isUnarmed = this.player.equipped_weapon === 'fist' || !this.player.equipped_weapon;
        // Only swap on initial key press (rising edge) to avoid flickering/looping
        const wantsToSwap = this.inputState.interact && !this.wasInteracting;

        if (isUnarmed || wantsToSwap) {
          this.network.send('pickup_request', {
            loot_id: item.id
          });
          // Only process one pickup per frame to avoid spamming multiple items if stacked
          break;
        }
      }
    }
  }

  #updatePhysics(deltaTime) {
    // Update position based on velocity
    this.player.x += this.player.velocity.x * deltaTime;
    this.player.y += this.player.velocity.y * deltaTime;

    // Keep player within world bounds
    this.player.x = Math.max(0, Math.min(CONFIG.WORLD.WIDTH, this.player.x));
    this.player.y = Math.max(0, Math.min(CONFIG.WORLD.HEIGHT, this.player.y));
  }

  #updateAnimation(deltaTime) {
    // Calculate direction from velocity for animation
    const isMoving = this.player.velocity.x !== 0 || this.player.velocity.y !== 0;
    const direction = getDirectionFromVelocity(this.player.velocity.x, this.player.velocity.y);

    // Update animation state
    this.player.animationState.update(deltaTime, isMoving, direction);

    // Update rotation based on velocity (if moving)
    if (this.player.velocity.x !== 0 || this.player.velocity.y !== 0) {
        // Map 4-way direction index to rotation radians
        // North (4) -> 0
        // East (2) -> PI/2
        // South (0) -> PI
        // West (6) -> 3PI/2
        switch (direction) {
            case 4: this.player.rotation = 0; break;
            case 2: this.player.rotation = Math.PI / 2; break;
            case 0: this.player.rotation = Math.PI; break;
            case 6: this.player.rotation = 3 * Math.PI / 2; break;
        }
        this.#normalizeRotation();
    } else {
        // Snap to nearest 90 degrees (PI/2) when stopped
        const snapInterval = Math.PI / 2;
        this.player.rotation = Math.round(this.player.rotation / snapInterval) * snapInterval;
        this.#normalizeRotation();
        
        // Ensure sprite animation frame matches the snapped rotation
        this.player.animationState.lastDirection = getDirectionFromRotation(this.player.rotation);
    }

    // Update attack animation timer
    if (this.player.attackAnimTime > 0) {
      this.player.attackAnimTime -= deltaTime;
      if (this.player.attackAnimTime <= 0) {
        this.player.isAttacking = false;
        this.player.attackAnimTime = 0;
      }
    }
  }

  #syncWithSnapshot(playersSnapshot) {
    if (!this.network) return;
    
    const snapshotData = playersSnapshot.getPlayers().get(this.network.playerId);
    if (snapshotData) {
      if (snapshotData.health !== undefined) {
        this.player.health = snapshotData.health;
      }
      if (snapshotData.equipped_weapon !== undefined) {
        this.player.equipped_weapon = snapshotData.equipped_weapon;
      }
      if (snapshotData.equipped_armor !== undefined) {
        this.player.armor = snapshotData.equipped_armor;
      }
    }
  }

  #broadcastPosition() {
    if (!this.network) return;

    // Throttle to configured interval
    const now = Date.now();
    const minInterval = CONFIG.NETWORK.GAME_SIMULATION_INTERVAL_MS;
    if (now - this.lastPositionSendTime < minInterval) {
      return;
    }

    // Only send if position/rotation/health/velocity changed
    const currentState = {
      x: this.player.x,
      y: this.player.y,
      rotation: this.player.rotation,
      health: this.player.health,
      vx: this.player.velocity.x,
      vy: this.player.velocity.y,
    };

    if (this.lastSentState &&
        Math.abs(this.lastSentState.x - currentState.x) < Number.EPSILON &&
        Math.abs(this.lastSentState.y - currentState.y) < Number.EPSILON &&
        Math.abs(this.lastSentState.rotation - currentState.rotation) < Number.EPSILON &&
        Math.abs(this.lastSentState.health - currentState.health) < Number.EPSILON &&
        Math.abs(this.lastSentState.vx - currentState.vx) < Number.EPSILON &&
        Math.abs(this.lastSentState.vy - currentState.vy) < Number.EPSILON) {
      return; // No change, don't send
    }

    // Send player state update
    this.network.broadcastPlayerStateUpdate({
      position_x: this.player.x,
      position_y: this.player.y,
      rotation: this.player.rotation,
      velocity_x: this.player.velocity.x,
      velocity_y: this.player.velocity.y,
      health: this.player.health,
    });

    // Remember last sent state and time
    this.lastSentState = currentState;
    this.lastPositionSendTime = now;
  }

  handleInput(inputState) {
    if (!this.player) return;

    // Update stored input state
    this.inputState = { ...this.inputState, ...inputState };
    // Disable input if dead
    if (this.isDead()) {
      this.inputState.attack = false;
      this.inputState.specialAbility = false;
      return;
    }

    // Update player velocity based on input
    const speedModifier = this.player.equipped_weapon?.stance === 'double'
      ? CONFIG.PLAYER.DOUBLE_HANDED_SPEED_MODIFIER
      : 1.0;
    const speed = CONFIG.PLAYER.BASE_MOVEMENT_SPEED * speedModifier;

    let velocityX = (inputState.moveX || 0) * speed;
    let velocityY = (inputState.moveY || 0) * speed;

    // Normalize diagonal movement
    if ((inputState.moveX || 0) !== 0 && (inputState.moveY || 0) !== 0) {
      velocityX /= Math.SQRT2;
      velocityY /= Math.SQRT2;
    }

    this.player.velocity = {
      x: velocityX,
      y: velocityY,
    };

    // Update rotation immediately if moving, so attacks in the same frame use correct direction
    if (velocityX !== 0 || velocityY !== 0) {
      this.player.rotation = Math.atan2(velocityY, velocityX) + Math.PI / 2;
      this.#normalizeRotation();
    }
  }

  #handleAttack(inputState) {
    if (!this.player.equipped_weapon) return;

    const isSpecial = inputState.specialAbility;
    const now = Date.now();
    
    // Get weapon config
    const weaponId = this.player.equipped_weapon;
    const weaponConfig = Object.values(CONFIG.WEAPONS).find(w => w.id === weaponId) || CONFIG.WEAPONS.FIST;
    
    const cooldown = isSpecial ? CONFIG.COMBAT.SPECIAL_ABILITY_COOLDOWN_MS : (1000 / weaponConfig.attackSpeed);
    const lastTime = isSpecial ? this.player.lastSpecialTime : this.player.lastAttackTime;

    if (now - lastTime >= cooldown) {
      if (isSpecial) {
        this.player.lastSpecialTime = now;
      } else {
        this.player.lastAttackTime = now;
      }

      // Set local animation state
      this.player.isAttacking = true;
      this.player.attackAnimTime = CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS;

      if (this.network) {
        // Calculate aim position based on current rotation
        const attackAngle = this.player.rotation - Math.PI / 2;
        const aimDistance = CONFIG.COMBAT.ATTACK_AIM_DISTANCE; // Arbitrary distance for direction vector
        const aimX = this.player.x + Math.cos(attackAngle) * aimDistance;
        const aimY = this.player.y + Math.sin(attackAngle) * aimDistance;

        this.network.send('attack_request', {
          weapon_id: weaponConfig.id,
          aim_x: aimX,
          aim_y: aimY,
          is_special: isSpecial
        });
      }
    }
  }

  #normalizeRotation() {
    if (this.player.rotation < 0) {
      this.player.rotation += 2 * Math.PI;
    } else if (this.player.rotation >= 2 * Math.PI) {
      this.player.rotation -= 2 * Math.PI;
    }
  }

  getCooldownStatus() {
    if (!this.player) return { attackPct: 0, abilityPct: 0 };

    const now = Date.now();
    const weaponId = this.player.equipped_weapon;
    // Default to fist if weapon is null/invalid for cooldown calculation purposes, 
    // although UI might disable buttons if weapon is null.
    // However, if we do have a weapon (even fist), we want to show cooldowns.
    const weaponConfig = Object.values(CONFIG.WEAPONS).find(w => w.id === weaponId) || CONFIG.WEAPONS.FIST;

    const attackCooldown = 1000 / weaponConfig.attackSpeed;
    const specialCooldown = CONFIG.COMBAT.SPECIAL_ABILITY_COOLDOWN_MS;

    const attackElapsed = now - this.player.lastAttackTime;
    const specialElapsed = now - this.player.lastSpecialTime;

    let attackPct = 0;
    if (attackElapsed < attackCooldown) {
      attackPct = 1 - (attackElapsed / attackCooldown);
    }

    let abilityPct = 0;
    if (specialElapsed < specialCooldown) {
      abilityPct = 1 - (specialElapsed / specialCooldown);
    }

    return {
      attackPct: Math.max(0, Math.min(1, attackPct)),
      abilityPct: Math.max(0, Math.min(1, abilityPct))
    };
  }
}
