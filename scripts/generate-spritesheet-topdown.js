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

// Order matching AnimationHelper directions (0-7)
// 0: South, 1: SE, 2: East, 3: NE, 4: North, 5: NW, 6: West, 7: SW
const FILES = [
  'Character_Down.png',      // 0: South
  'Character_DownRight.png', // 1: South-East
  'Character_Right.png',     // 2: East
  'Character_UpRight.png',   // 3: North-East
  'Character_Up.png',        // 4: North
  'Character_UpLeft.png',    // 5: North-West
  'Character_Left.png',      // 6: West
  'Character_DownLeft.png'   // 7: South-West
];

const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 32;
const FRAMES_PER_ROW = 4; // 128px width
const ROWS = 8; // 8 directions

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
        southEast: { row: 1, frames: 4 },
        east: { row: 2, frames: 4 },
        northEast: { row: 3, frames: 4 },
        north: { row: 4, frames: 4 },
        northWest: { row: 5, frames: 4 },
        west: { row: 6, frames: 4 },
        southWest: { row: 7, frames: 4 }
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
