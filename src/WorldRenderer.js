import { CONFIG } from './config.js';

export class WorldRenderer {
    constructor(assetManager) {
        this.assetManager = assetManager;
        this.bgPattern = null;
        this.bgImage = null;
    }

    init(ctx) {
        this.bgImage = this.assetManager.createImage('game-background.png');
        this.bgImage.onload = () => {
            this.bgPattern = ctx.createPattern(this.bgImage, 'repeat');
        };
    }

    render(ctx, camera, conflictZone) {
        if (!ctx) return;

        // Draw background
        // Always draw background to clear previous frame, even if no camera (use canvas dims)
        if (camera) {
            if (this.bgPattern) {
                ctx.fillStyle = this.bgPattern;
                ctx.fillRect(0, 0, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT);
            } else {
                ctx.fillStyle = CONFIG.CANVAS.BACKGROUND_COLOR;
                ctx.fillRect(0, 0, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT);
            }
        } else {
             ctx.fillStyle = CONFIG.CANVAS.BACKGROUND_COLOR;
             ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }

        // Render conflict zone
        this.renderConflictZone(ctx, conflictZone);
    }

    renderConflictZone(ctx, zone) {
        // Draw danger area outside zone (in world coordinates) using a path with a hole
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Dark gray dimming

        ctx.beginPath();
        // Outer rectangle (entire world)
        ctx.rect(0, 0, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT);
        // Inner circle (safe zone) - drawn counter-clockwise to create a hole
        ctx.arc(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2, true);
        ctx.fill();
        ctx.restore();

        // Draw zone boundary stroke
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
}
