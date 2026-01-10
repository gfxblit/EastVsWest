import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_DIR = path.join(__dirname, '../public/assets/player/top-down');
const OUTPUT_DIR = path.join(__dirname, '../public/assets/player');
const OUTPUT_IMAGE = path.join(OUTPUT_DIR, 'player-walk-spritesheet.png');
const OUTPUT_METADATA = path.join(OUTPUT_DIR, 'player-walk-spritesheet.json');

// Order matching AnimationHelper directions (0-3)
// 0: South, 1: East, 2: North, 3: West
const FILES = [
  'Character_Down.png',      // 0: South
  'Character_Right.png',     // 1: East
  'Character_Up.png',        // 2: North
  'Character_Left.png'       // 3: West
];

const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 32;
const FRAMES_PER_ROW = 4; // 128px width
const ROWS = 4; // 4 cardinal directions

async function generate() {
  console.log('Generating top-down spritesheet...');

  // 1. Create composites array
  const composites = [];
  
  for (let i = 0; i < FILES.length; i++) {
    const filename = FILES[i];
    const filePath = path.join(INPUT_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      console.error(`Error: Input file not found: ${filePath}`);
      process.exit(1);
    }

    composites.push({
      input: filePath,
      top: i * FRAME_HEIGHT,
      left: 0,
    });
  }

  // 2. Create blank image and composite
  const width = FRAME_WIDTH * FRAMES_PER_ROW;
  const height = FRAME_HEIGHT * ROWS;

  try {
    await sharp({
      create: {
        width: width,
        height: height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite(composites)
    .toFile(OUTPUT_IMAGE);

    console.log(`Sprite sheet written to: ${OUTPUT_IMAGE}`);

    // 3. Generate JSON metadata
    const metadata = {
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
      columns: FRAMES_PER_ROW,
      rows: ROWS,
      // Optional: Add mapping info for reference
      animations: {
        south: { row: 0, frames: 4 },
        east: { row: 1, frames: 4 },
        north: { row: 2, frames: 4 },
        west: { row: 3, frames: 4 }
      }
    };

    fs.writeFileSync(OUTPUT_METADATA, JSON.stringify(metadata, null, 2));
    console.log(`Metadata written to: ${OUTPUT_METADATA}`);

  } catch (err) {
    console.error('Error generating sprite sheet:', err);
    process.exit(1);
  }
}

generate();
