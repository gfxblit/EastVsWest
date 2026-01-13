import { CONFIG } from './config.js';

export class WorldRenderer {
    constructor(assetManager) {
        this.assetManager = assetManager;
        this.bgPattern = null;
        this.bgImage = null;
    }

    init(ctx) {
        this.bgImage = this.assetManager.createImage('game-background.png');
        
        const createPattern = () => {
            if (this.bgImage.naturalWidth > 0) {
                this.bgPattern = ctx.createPattern(this.bgImage, 'repeat');
            }
        };

        if (this.bgImage.complete) {
            createPattern();
        } else {
            this.bgImage.onload = createPattern;
        }
    }

    render(ctx, camera, conflictZone, debugMode = false) {
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

        // Render environmental props
        this.renderProps(ctx, debugMode);

        // Render conflict zone
        this.renderConflictZone(ctx, conflictZone);
    }

    renderProps(ctx, debugMode) {
        if (!CONFIG.PROPS || !CONFIG.PROPS.MAP) return;

        ctx.save();
        CONFIG.PROPS.MAP.forEach(prop => {
            const propType = CONFIG.PROPS.TYPES[prop.type.toUpperCase()];
            if (propType) {
                ctx.fillStyle = propType.color;
                // Draw centered at position
                const x = prop.x - propType.width / 2;
                const y = prop.y - propType.height / 2;
                
                ctx.fillRect(x, y, propType.width, propType.height);

                if (debugMode) {
                    ctx.strokeStyle = 'red';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, propType.width, propType.height);
                }
            }
        });
        ctx.restore();
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
