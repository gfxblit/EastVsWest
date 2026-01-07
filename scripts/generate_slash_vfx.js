#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Default configuration
const DEFAULT_CONFIG = {
  source: path.join(PROJECT_ROOT, 'public/assets/vfx/slash-original.png'),
  output: path.join(PROJECT_ROOT, 'public/assets/vfx'),
  width: 64,
  height: 64,
  frames: 5
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--source' && args[i + 1]) {
      config.source = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--output' && args[i + 1]) {
      config.output = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--width' && args[i + 1]) {
      config.width = parseInt(args[++i], 10);
    } else if (arg === '--height' && args[i + 1]) {
      config.height = parseInt(args[++i], 10);
    } else if (arg === '--frames' && args[i + 1]) {
      config.frames = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node generate_slash_vfx.js [options]

Options:
  --source <path>   Path to source image (default: public/assets/vfx/slash-original.png)
  --output <path>   Output directory (default: public/assets/vfx)
  --width <px>      Frame width (default: 64)
  --height <px>     Frame height (default: 64)
  --frames <count>  Number of frames (default: 5)
  --help, -h        Show this help message
`);
      process.exit(0);
    }
  }
  return config;
}

const config = parseArgs();

const OUTPUT_DIR = config.output;
const SOURCE_FILE = config.source;
const FRAME_WIDTH = config.width;
const FRAME_HEIGHT = config.height;
const NUM_FRAMES = config.frames;
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
    const frameBuffer = await sharp(baseBuffer)
      .extract({ left: i * FRAME_WIDTH, top: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT })
      .toBuffer();
      
    const transformedFrame = await transformFn(sharp(frameBuffer)).toBuffer();
    
    compositeOperations.push({
      input: transformedFrame,
      left: i * FRAME_WIDTH,
      top: 0
    });
  }
  
  const spriteSheet = sharp({
    create: {
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
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
  
  console.log('Reading source file...');
  const baseBuffer = await fs.readFile(SOURCE_FILE);
  
  console.log('Generating slash (Right)...');
  // Right is the original
  await fs.copyFile(SOURCE_FILE, path.join(OUTPUT_DIR, 'slash-right.png'));
  
  console.log('Generating slash (Left)...');
  // Mirror horizontally (flop)
  const leftSheet = await generateVariant(baseBuffer, (s) => s.flop());
  await leftSheet.toFile(path.join(OUTPUT_DIR, 'slash-left.png'));
  
  console.log('Generating slash (Up)...');
  // Rotate -90 (270)
  const upSheet = await generateVariant(baseBuffer, (s) => s.rotate(270));
  await upSheet.toFile(path.join(OUTPUT_DIR, 'slash-up.png'));
  
  console.log('Generating slash (Down)...');
  // Rotate +90 (90)
  const downSheet = await generateVariant(baseBuffer, (s) => s.rotate(90));
  await downSheet.toFile(path.join(OUTPUT_DIR, 'slash-down.png'));
  
  console.log('Done! Assets saved to:', OUTPUT_DIR);
}

main().catch(console.error);
