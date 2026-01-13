import { CONFIG } from './config.js';

export class WorldRenderer {
    constructor(assetManager) {
        this.assetManager = assetManager;
        this.bgPattern = null;
        this.bgImage = null;
        this.propImages = {};
        this.propDimensions = new Map();
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

        // Load prop images
        if (CONFIG.PROPS && CONFIG.PROPS.TYPES) {
            Object.entries(CONFIG.PROPS.TYPES).forEach(([key, typeConfig]) => {
                // Initialize with config defaults
                const dimensions = { ...typeConfig };
                this.propDimensions.set(key, dimensions);

                if (typeConfig.src) {
                    const img = this.assetManager.createImage(typeConfig.src);
                    this.propImages[key] = img;
                    
                    const updateDimensions = () => {
                        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                            // Only set default dimensions if not explicitly configured
                            if (!typeConfig.renderWidth) dimensions.renderWidth = img.naturalWidth;
                            if (!typeConfig.renderHeight) dimensions.renderHeight = img.naturalHeight;
                        }
                    };

                    if (img.complete) {
                        updateDimensions();
                    } else {
                        img.onload = updateDimensions;
                    }
                }
            });
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
            const typeKey = prop.type.toUpperCase();
            const propType = CONFIG.PROPS.TYPES[typeKey];
            const dimensions = this.propDimensions.get(typeKey) || propType;

            if (propType && dimensions) {
                const renderWidth = dimensions.renderWidth;
                const renderHeight = dimensions.renderHeight;
                const renderX = prop.x - renderWidth / 2;
                const renderY = prop.y - renderHeight / 2;
                
                const img = this.propImages ? this.propImages[typeKey] : null;

                if (img && img.complete && img.naturalWidth > 0) {
                    ctx.drawImage(img, renderX, renderY, renderWidth, renderHeight);
                } else {
                    ctx.fillStyle = propType.color;
                    ctx.fillRect(renderX, renderY, renderWidth, renderHeight);
                }

                if (debugMode) {
                    const hitboxWidth = dimensions.hitboxWidth;
                    const hitboxHeight = dimensions.hitboxHeight;
                    const hitboxX = prop.x - hitboxWidth / 2;
                    const hitboxY = prop.y - hitboxHeight / 2;

                    ctx.strokeStyle = 'red';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(hitboxX, hitboxY, hitboxWidth, hitboxHeight);
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
