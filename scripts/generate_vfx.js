#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Default configuration (empty to force user input)
const DEFAULT_CONFIG = {
  source: null,
  output: null,
  prefix: null,
  width: 64,
  height: 64,
  frames: 5,
  inputLayout: 'h', // 'h' for horizontal, 'v' for vertical
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node generate_vfx.js [options]

Required Options:
  --source <path>        Path to source image (e.g., public/assets/vfx/my-effect.png)
  --output <path>        Output directory (e.g., public/assets/vfx)

Optional Options:
  --prefix <string>      Output filename prefix (defaults to source filename)
  --width <px>           Frame width (default: 64)
  --height <px>          Frame height (default: 64)
  --frames <count>       Number of frames (default: 5)
  --input-layout <h|v>   Input layout: h=horizontal, v=vertical (default: h)
  --help, -h             Show this help message

Example:
  node scripts/generate_vfx.js --source public/assets/raw/slash-right.png --output public/assets/vfx --prefix slash --width 64 --height 64 --frames 5
`);
    process.exit(0);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let key = arg;
    let value = null;

    if (arg.startsWith('--') && arg.includes('=')) {
      const parts = arg.split('=');
      key = parts[0];
      value = parts.slice(1).join('=');
    } else if (arg.startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) {
      value = args[++i];
    }

    if (key === '--source' && value) {
      config.source = path.resolve(process.cwd(), value);
    } else if (key === '--output' && value) {
      config.output = path.resolve(process.cwd(), value);
    } else if (key === '--prefix' && value) {
      config.prefix = value;
    } else if (key === '--width' && value) {
      config.width = parseInt(value, 10);
    } else if (key === '--height' && value) {
      config.height = parseInt(value, 10);
    } else if (key === '--frames' && value) {
      config.frames = parseInt(value, 10);
    } else if (key === '--input-layout' && value) {
      config.inputLayout = value.toLowerCase();
    }
  }

  // Validation
  if (!config.source) {
    console.error('Error: --source is required');
    process.exit(1);
  }
  if (!config.output) {
    console.error('Error: --output is required');
    process.exit(1);
  }

  return config;
}

const config = parseArgs();

const OUTPUT_DIR = config.output;
const SOURCE_FILE = config.source;
const FRAME_WIDTH = config.width;
const FRAME_HEIGHT = config.height;
const NUM_FRAMES = config.frames;
const INPUT_LAYOUT = config.inputLayout;
const PREFIX = config.prefix || path.basename(SOURCE_FILE, path.extname(SOURCE_FILE)).replace('-original', '');

// Output is always horizontal
const SHEET_WIDTH = FRAME_WIDTH * NUM_FRAMES;
const SHEET_HEIGHT = FRAME_HEIGHT;

async function ensureDir(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function generateVariant(baseBuffer, transformFn) {
  // Extract each frame, transform it, and rebuild the sheet
  const compositeOperations = [];
  
  for (let i = 0; i < NUM_FRAMES; i++) {
    const extractArea = INPUT_LAYOUT === 'v'
      ? { left: 0, top: i * FRAME_HEIGHT, width: FRAME_WIDTH, height: FRAME_HEIGHT }
      : { left: i * FRAME_WIDTH, top: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT };

    const frameBuffer = await sharp(baseBuffer)
      .extract(extractArea)
      .toBuffer();
      
    const transformedFrame = await transformFn(sharp(frameBuffer)).toBuffer();
    
    compositeOperations.push({
      input: transformedFrame,
      left: i * FRAME_WIDTH,
      top: 0,
    });
  }
  
  const spriteSheet = sharp({
    create: {
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  
  return spriteSheet.composite(compositeOperations).png();
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  try {
    await fs.access(SOURCE_FILE);
  } catch (error) {
    console.error(`Source file not found: ${SOURCE_FILE}`);
    process.exit(1);
  }
  
  console.log(`Reading source file: ${SOURCE_FILE} (prefix: ${PREFIX})`);
  const baseBuffer = await fs.readFile(SOURCE_FILE);
  
  console.log(`Generating ${PREFIX} (Right)... `);
  // If input is vertical, we need to convert it to horizontal for the "Right" version
  if (INPUT_LAYOUT === 'v') {
    const rightSheet = await generateVariant(baseBuffer, (s) => s);
    await rightSheet.toFile(path.join(OUTPUT_DIR, `${PREFIX}-right.png`));
  } else {
    // Already horizontal, just copy or rename if needed
    await fs.copyFile(SOURCE_FILE, path.join(OUTPUT_DIR, `${PREFIX}-right.png`));
  }
  
  console.log(`Generating ${PREFIX} (Left)... `);
  // Mirror horizontally (flop)
  const leftSheet = await generateVariant(baseBuffer, (s) => s.flop());
  await leftSheet.toFile(path.join(OUTPUT_DIR, `${PREFIX}-left.png`));
  
  console.log(`Generating ${PREFIX} (Up)... `);
  // Rotate -90 (270)
  const upSheet = await generateVariant(baseBuffer, (s) => s.rotate(270));
  await upSheet.toFile(path.join(OUTPUT_DIR, `${PREFIX}-up.png`));
  
  console.log(`Generating ${PREFIX} (Down)... `);
  // Rotate +90 (90)
  const downSheet = await generateVariant(baseBuffer, (s) => s.rotate(90));
  await downSheet.toFile(path.join(OUTPUT_DIR, `${PREFIX}-down.png`));
  
  console.log('Done! Assets saved to:', OUTPUT_DIR);
}

main().catch(console.error);
