import { CONFIG } from './config.js';
import { getDirectionFromRotation } from './animationHelper.js';

export class PlayerRenderer {
    constructor(assetManager) {
        this.assetManager = assetManager;
        this.shadowImage = null;
        this.slashImages = {
            up: null,
            down: null,
            left: null,
            right: null
        };
        this.thrustImages = {
            up: null,
            down: null,
            left: null,
            right: null
        };
        this.bluntImages = {
            up: null,
            down: null,
            left: null,
            right: null
        };
    }

    init() {
        this.shadowImage = this.assetManager.createImage('shadow.png');

        // Load slash VFX images
        this.slashImages.up = this.assetManager.createImage(CONFIG.ASSETS.VFX.SLASH.UP);
        this.slashImages.down = this.assetManager.createImage(CONFIG.ASSETS.VFX.SLASH.DOWN);
        this.slashImages.left = this.assetManager.createImage(CONFIG.ASSETS.VFX.SLASH.LEFT);
        this.slashImages.right = this.assetManager.createImage(CONFIG.ASSETS.VFX.SLASH.RIGHT);

        // Load thrust VFX images
        this.thrustImages.up = this.assetManager.createImage(CONFIG.ASSETS.VFX.THRUST.UP);
        this.thrustImages.down = this.assetManager.createImage(CONFIG.ASSETS.VFX.THRUST.DOWN);
        this.thrustImages.left = this.assetManager.createImage(CONFIG.ASSETS.VFX.THRUST.LEFT);
        this.thrustImages.right = this.assetManager.createImage(CONFIG.ASSETS.VFX.THRUST.RIGHT);

        // Load blunt VFX images
        this.bluntImages.up = this.assetManager.createImage(CONFIG.ASSETS.VFX.BLUNT.UP);
        this.bluntImages.down = this.assetManager.createImage(CONFIG.ASSETS.VFX.BLUNT.DOWN);
        this.bluntImages.left = this.assetManager.createImage(CONFIG.ASSETS.VFX.BLUNT.LEFT);
        this.bluntImages.right = this.assetManager.createImage(CONFIG.ASSETS.VFX.BLUNT.RIGHT);
    }

    render(ctx, player, isLocal = false) {
        const size = CONFIG.RENDER.PLAYER_RADIUS * 2;
        const spriteX = player.x - CONFIG.RENDER.PLAYER_RADIUS;
        const spriteY = player.y - CONFIG.RENDER.PLAYER_RADIUS;

        // Render shadow first (beneath player)
        if (this.shadowImage && this.shadowImage.complete && this.shadowImage.naturalWidth > 0) {
            ctx.drawImage(
                this.shadowImage,
                spriteX,
                spriteY,
                size,
                size
            );
        }

        const isAttacking = player.isAttacking;
        const spriteSheetName = isAttacking ? 'slash' : 'walk';
        const spriteSheet = this.assetManager.getSpriteSheet(spriteSheetName);
        const spriteSheetMetadata = this.assetManager.getSpriteSheetMetadata(spriteSheetName);

        // Check if sprite sheet is loaded
        if (!spriteSheet || !spriteSheet.complete || !spriteSheetMetadata) {
            // Fallback: render pink rectangle
            ctx.fillStyle = '#ff69b4'; // Pink
            ctx.fillRect(
                spriteX,
                spriteY,
                size,
                size
            );
        } else {
            let currentFrame, lastDirection;
            const { frameWidth, frameHeight } = spriteSheetMetadata;

            if (isAttacking) {
                // Calculate attack frame from attackAnimTime (countdown)
                const totalDuration = CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS;
                const elapsedTime = totalDuration - player.attackAnimTime;
                const frameCount = spriteSheetMetadata.columns;
                const frameDuration = totalDuration / frameCount;
                
                currentFrame = Math.floor(elapsedTime / frameDuration);
                if (currentFrame >= frameCount) currentFrame = frameCount - 1;
                if (currentFrame < 0) currentFrame = 0;
                
                // Use rotation-based direction for attacking
                lastDirection = getDirectionFromRotation(player.rotation);
            } else {
                currentFrame = player.animationState.currentFrame;
                lastDirection = player.animationState.lastDirection;
            }

            // Calculate source rectangle (which frame to draw from sprite sheet)
            const sourceX = currentFrame * frameWidth;
            const sourceY = lastDirection * frameHeight;

            // Draw frame from sprite sheet, centered on player position
            ctx.drawImage(
                spriteSheet,
                sourceX,
                sourceY,
                frameWidth,
                frameHeight,
                spriteX,
                spriteY,
                size,
                size
            );
        }

        // Add white outline for local player
        if (isLocal) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(player.x, player.y, CONFIG.RENDER.PLAYER_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Attack VFX
        if (player.isAttacking) {
            this.renderAttackVFX(ctx, player);
        }

        // Health bar above player
        this.renderHealthBar(ctx, player);
    }

    renderHealthBar(ctx, player) {
        const barWidth = CONFIG.RENDER.HEALTH_BAR_WIDTH;
        const barHeight = CONFIG.RENDER.HEALTH_BAR_HEIGHT;
        const barX = player.x - barWidth / 2;
        const barY = player.y - (CONFIG.RENDER.PLAYER_RADIUS + CONFIG.RENDER.HEALTH_BAR_OFFSET_FROM_PLAYER);

        // Background
        // TODO: Move health bar styles to config
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Health
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(barX, barY, (player.health / 100) * barWidth, barHeight);
    }

    renderAttackVFX(ctx, player) {
        // Total duration of attack animation
        const totalDuration = CONFIG.COMBAT.ATTACK_ANIMATION_DURATION_SECONDS;
        const remainingTime = player.attackAnimTime;
        const elapsedTime = totalDuration - remainingTime;

        // 5 frames total
        const frameCount = 5;
        const frameDuration = totalDuration / frameCount;

        let currentFrame = Math.floor(elapsedTime / frameDuration);
        if (currentFrame >= frameCount) currentFrame = frameCount - 1;
        if (currentFrame < 0) currentFrame = 0;

        // Determine direction based on rotation
        const directionIndex = getDirectionFromRotation(player.rotation);

        let vfxImage = null;
        let offsetX = 0;
        let offsetY = 0;

        // Determine which VFX images and settings to use based on weapon's vfxType
        // TODO: Optimize weapon lookup using a Map
        const weaponConfig = Object.values(CONFIG.WEAPONS).find(w => w.id === player.equipped_weapon);
        const vfxType = weaponConfig ? weaponConfig.vfxType : 'slash';
        
        let images, vfxOffset, vfxScale;
        if (vfxType === 'thrust') {
            images = this.thrustImages;
            vfxOffset = CONFIG.COMBAT.THRUST_VFX_OFFSET;
            vfxScale = CONFIG.COMBAT.THRUST_VFX_SCALE;
        } else if (vfxType === 'blunt') {
            images = this.bluntImages;
            vfxOffset = CONFIG.COMBAT.BLUNT_VFX_OFFSET;
            vfxScale = CONFIG.COMBAT.BLUNT_VFX_SCALE;
        } else {
            images = this.slashImages;
            vfxOffset = CONFIG.COMBAT.SLASH_VFX_OFFSET;
            vfxScale = CONFIG.COMBAT.SLASH_VFX_SCALE;
        }

        // Map direction to cardinal VFX sprites
        if (directionIndex === 2) { // North
            vfxImage = images.up;
            offsetX = vfxOffset.y;
            offsetY = -vfxOffset.x; // Shift up
        } else if (directionIndex === 0) { // South
            vfxImage = images.down;
            offsetX = -vfxOffset.y;
            offsetY = vfxOffset.x; // Shift down
        } else if (directionIndex === 1) { // East
            vfxImage = images.right;
            offsetX = vfxOffset.x; // Shift right
            offsetY = vfxOffset.y;
        } else if (directionIndex === 3) { // West
            vfxImage = images.left;
            offsetX = -vfxOffset.x; // Shift left
            offsetY = vfxOffset.y;
        }

        if (!vfxImage || !vfxImage.complete || vfxImage.naturalWidth === 0) return;

        // Calculate frame dimensions dynamically
        // Assumes horizontal sprite sheet with 'frameCount' frames
        const frameWidth = vfxImage.naturalWidth / frameCount;
        const frameHeight = vfxImage.naturalHeight;

        // Scale up the VFX slightly to look impactful
        const scale = vfxScale;
        const drawWidth = frameWidth * scale;
        const drawHeight = frameHeight * scale;

        const sourceX = currentFrame * frameWidth;

        // Draw centered on player + offset
        ctx.drawImage(
            vfxImage,
            sourceX, 0, frameWidth, frameHeight,
            player.x + offsetX - drawWidth / 2,
            player.y + offsetY - drawHeight / 2,
            drawWidth,
            drawHeight
        );
    }
}
