
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = 'public/assets/player';
const PNG_PATH = path.join(OUTPUT_DIR, 'player-death-spritesheet.png');
const JSON_PATH = path.join(OUTPUT_DIR, 'player-death-spritesheet.json');

const FRAME_SIZE = 256; // Matching walk sheet size for consistency
const FRAMES = 4;

async function generate() {
    // Create a composite image
    const composites = [];
    
    for (let i = 0; i < FRAMES; i++) {
        // Create a frame: Red square that fades out and shrinks
        const opacity = 1 - (i / FRAMES);
        const size = Math.floor(FRAME_SIZE * (1 - (i / (FRAMES * 2)))); // Shrink slightly
        
        // Using SVG for simple shape generation
        const svg = `
            <svg width="${FRAME_SIZE}" height="${FRAME_SIZE}">
                <rect x="${(FRAME_SIZE - size)/2}" y="${(FRAME_SIZE - size)/2}" width="${size}" height="${size}" fill="red" fill-opacity="${opacity}" />
                <text x="50%" y="50%" font-family="Arial" font-size="40" fill="white" text-anchor="middle" dominant-baseline="middle">DEAD ${i}</text>
            </svg>
        `;

        composites.push({
            input: Buffer.from(svg),
            left: i * FRAME_SIZE,
            top: 0
        });
    }

    await sharp({
        create: {
            width: FRAME_SIZE * FRAMES,
            height: FRAME_SIZE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
    .composite(composites)
    .toFile(PNG_PATH);

    console.log(`Generated ${PNG_PATH}`);

    const metadata = {
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
        columns: FRAMES,
        rows: 1,
        directions: ["all"]
    };

    fs.writeFileSync(JSON_PATH, JSON.stringify(metadata, null, 2));
    console.log(`Generated ${JSON_PATH}`);
}

generate().catch(console.error);
