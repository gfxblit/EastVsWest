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
    if (arg === '--output' && args[i + 1]) {
      config.output = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--width' && args[i + 1]) {
      config.width = parseInt(args[++i], 10);
    } else if (arg === '--height' && args[i + 1]) {
      config.height = parseInt(args[++i], 10);
    } else if (arg === '--frames' && args[i + 1]) {
      config.frames = parseInt(args[++i], 10);
    }
  }
  return config;
}

const config = parseArgs();
const FRAME_WIDTH = config.width;
const FRAME_HEIGHT = config.height;
const NUM_FRAMES = config.frames;

async function ensureDir(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Generates an SVG for a single frame of the spear thrust VFX.
 * @param {number} frameIndex - Current frame (0 to NUM_FRAMES-1)
 * @param {string} direction - 'right', 'left', 'up', 'down'
 */
function generateFrameSVG(frameIndex, direction) {
  const progress = frameIndex / (NUM_FRAMES - 1);
  const opacity = frameIndex === 0 ? 0.4 : (frameIndex === NUM_FRAMES - 1 ? 0.2 : 0.8);
  
  // Base coordinates for 'right' direction
  // Spear thrust is a horizontal line moving right
  let x1, x2, y1, y2, strokeWidth;
  
  const centerY = FRAME_HEIGHT / 2;
  const startX = FRAME_WIDTH * 0.2;
  const maxReach = FRAME_WIDTH * 0.8;
  
  if (frameIndex === 0) {
    x1 = startX;
    x2 = startX + 10;
    strokeWidth = 2;
  } else if (frameIndex === 1) {
    x1 = startX;
    x2 = startX + 25;
    strokeWidth = 4;
  } else if (frameIndex === 2) {
    x1 = startX + 10;
    x2 = maxReach;
    strokeWidth = 6;
  } else if (frameIndex === 3) {
    x1 = startX + 30;
    x2 = maxReach + 5;
    strokeWidth = 4;
  } else {
    x1 = startX + 45;
    x2 = maxReach + 10;
    strokeWidth = 2;
  }
  
  y1 = centerY;
  y2 = centerY;

  let transform = '';
  if (direction === 'left') {
    transform = `rotate(180, ${FRAME_WIDTH / 2}, ${FRAME_HEIGHT / 2})`;
  } else if (direction === 'up') {
    transform = `rotate(270, ${FRAME_WIDTH / 2}, ${FRAME_HEIGHT / 2})`;
  } else if (direction === 'down') {
    transform = `rotate(90, ${FRAME_WIDTH / 2}, ${FRAME_HEIGHT / 2})`;
  }

  return `
    <svg width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgba(200,230,255,0);stop-opacity:0" />
          <stop offset="50%" style="stop-color:rgba(255,255,255,${opacity});stop-opacity:${opacity}" />
          <stop offset="100%" style="stop-color:rgba(100,200,255,0);stop-opacity:0" />
        </linearGradient>
      </defs>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
            stroke="url(#grad)" stroke-width="${strokeWidth}" 
            stroke-linecap="round" transform="${transform}" />
    </svg>
  `;
}

async function generateSpriteSheet(direction) {
  const compositeOperations = [];
  
  for (let i = 0; i < NUM_FRAMES; i++) {
    const svg = generateFrameSVG(i, direction);
    const frameBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    
    compositeOperations.push({
      input: frameBuffer,
      left: i * FRAME_WIDTH,
      top: 0
    });
  }
  
  const spriteSheet = sharp({
    create: {
      width: FRAME_WIDTH * NUM_FRAMES,
      height: FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });
  
  return spriteSheet.composite(compositeOperations).png();
}

async function main() {
  await ensureDir(config.output);
  
  const directions = ['right', 'left', 'up', 'down'];
  
  for (const dir of directions) {
    console.log(`Generating spear VFX (${dir})...`);
    const sheet = await generateSpriteSheet(dir);
    await sheet.toFile(path.join(config.output, `spear-${dir}.png`));
  }
  
  console.log('Done! Assets saved to:', config.output);
}

main().catch(console.error);
