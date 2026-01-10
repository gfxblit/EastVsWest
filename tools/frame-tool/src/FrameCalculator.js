export class FrameCalculator {
    calculateFrames(config) {
        const startX = parseInt(config.startX, 10);
        const startY = parseInt(config.startY, 10);
        const frameWidth = parseInt(config.frameWidth, 10);
        const frameHeight = parseInt(config.frameHeight, 10);
        const frameCount = parseInt(config.frameCount, 10);

        const frames = [];
        
        for (let i = 0; i < frameCount; i++) {
            frames.push({
                x: startX + (i * frameWidth),
                y: startY,
                w: frameWidth,
                h: frameHeight,
                anchor: { x: frameWidth / 2, y: frameHeight / 2 }
            });
        }
        
        return frames;
    }
}
