#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 0: South, 1: East, 2: North, 3: West
const DIRECTION_ORDER = [
  'south', // 0
  'east',  // 1
  'north', // 2
  'west',   // 3
];

const FLIP_MAP = {
  'west': 'east',
};

async function assemble(action) {
  const artSrcDir = path.join('art-src', action);
  const outputDir = 'public/assets/player';
  const actionName = action === 'walking' ? 'walk' : action;
  
  const outputSpritePath = path.join(outputDir, `player-${actionName}-spritesheet.png`);
  const outputMetadataPath = path.join(outputDir, `player-${actionName}-spritesheet.json`);

  console.log(`Assembling normalized cardinal spritesheet for action: ${action}`);

  // 1. Determine Global Dimensions (The Target Grid)
  let globalWidth = 0;
  let globalHeight = 0;
  let frameCount = 0;

  try {
    const configPath = path.join(artSrcDir, 'config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    globalWidth = config.config.globalWidth;
    globalHeight = config.config.globalHeight;
    frameCount = config.config.frameCount;
    console.log(`Using config.json: ${globalWidth}x${globalHeight}, Frames: ${frameCount}`);
  } catch (e) {
    // Fallback to searching first strip.json
    const files = await fs.readdir(artSrcDir);
    const firstMeta = files.find(f => f.endsWith('.strip.json'));
    if (firstMeta) {
      const meta = JSON.parse(await fs.readFile(path.join(artSrcDir, firstMeta), 'utf-8'));
      globalWidth = meta.frameWidth;
      globalHeight = meta.frameHeight;
      frameCount = meta.animations.animation.frames;
      console.log(`Fallback to ${firstMeta}: ${globalWidth}x${globalHeight}`);
    }
  }

  if (!globalWidth || !globalHeight) {
    throw new Error('Could not determine global dimensions. Ensure config.json or .strip.json exists.');
  }

  const sheetWidth = globalWidth * frameCount;
  const sheetHeight = globalHeight * DIRECTION_ORDER.length;
  const compositeOperations = [];
  const promptsUsed = {};

  // 2. Process each direction
  for (let i = 0; i < DIRECTION_ORDER.length; i++) {
    const direction = DIRECTION_ORDER[i];
    let stripPath = path.join(artSrcDir, `${direction}.strip.png`);
    let metaPath = path.join(artSrcDir, `${direction}.strip.json`);
    let promptPath = path.join(artSrcDir, `${direction}.prompt.md`);
    let shouldFlip = false;
    let finalDirectionSource = direction;

    // Check availability
    try {
      await fs.access(stripPath);
    } catch (e) {
      if (FLIP_MAP[direction]) {
        const sourceDir = FLIP_MAP[direction];
        stripPath = path.join(artSrcDir, `${sourceDir}.strip.png`);
        metaPath = path.join(artSrcDir, `${sourceDir}.strip.json`);
        promptPath = path.join(artSrcDir, `${sourceDir}.prompt.md`);
        try {
          await fs.access(stripPath);
          shouldFlip = true;
          finalDirectionSource = sourceDir;
        } catch (e2) { stripPath = null; }
      } else { stripPath = null; }
    }

    if (stripPath) {
      console.log(`  Row ${i} (${direction}): Processing ${finalDirectionSource}${shouldFlip ? ' (Flipped)' : ''}`);
      
      const stripMeta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
      const localWidth = stripMeta.frameWidth;
      const localHeight = stripMeta.frameHeight;
      const stripBuffer = await fs.readFile(stripPath);
      const stripImgMetadata = await sharp(stripBuffer).metadata();

      // We process frame-by-frame to handle centering, flipping, and dimension normalization
      for (let j = 0; j < frameCount; j++) {
        const left = j * localWidth;
        
        // Ensure we don't extract outside the source image bounds
        if (left + localWidth > stripImgMetadata.width) {
          console.warn(`    Warning: Frame ${j} out of bounds for ${stripPath}. Skipping.`);
          continue;
        }

        const extractArea = {
          left: left,
          top: 0,
          width: localWidth,
          height: Math.min(localHeight, stripImgMetadata.height),
        };

        let frameProcessor = sharp(stripBuffer).extract(extractArea);
        
        if (shouldFlip) {
          frameProcessor = frameProcessor.flop();
        }

        // Normalize frame to global dimensions: 
        // Resize while preserving aspect ratio, then extend with transparent padding to fill global cell
        const frameBuffer = await frameProcessor
          .resize(globalWidth, globalHeight, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toBuffer();

        compositeOperations.push({
          input: frameBuffer,
          left: j * globalWidth,
          top: i * globalHeight,
        });
      }

      // Capture prompt
      try {
        const prompt = await fs.readFile(promptPath, 'utf-8');
        promptsUsed[direction] = {
          source: finalDirectionSource,
          flipped: shouldFlip,
          text: prompt.trim(),
        };
      } catch (e) {
        // Prompt file may not exist, which is fine
      }
    } else {
      console.log(`  Row ${i} (${direction}): [EMPTY]`);
    }
  }

  // 3. Output the final composite
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compositeOperations)
    .png()
    .toFile(outputSpritePath);

  const metadata = {
    frameWidth: globalWidth,
    frameHeight: globalHeight,
    columns: frameCount,
    rows: DIRECTION_ORDER.length,
    directions: DIRECTION_ORDER,
    prompts: promptsUsed,
  };

  await fs.writeFile(outputMetadataPath, JSON.stringify(metadata, null, 2));

  console.log(`
✓ Spritesheet: ${outputSpritePath} (${sheetWidth}x${sheetHeight})`);
  console.log(`✓ Metadata: ${outputMetadataPath}`);
}

const action = process.argv[2];
if (!action) {
  console.error('Usage: node scripts/assemble-sheets.js <action>');
  process.exit(1);
}

assemble(action).catch(err => {
  console.error(err);
  process.exit(1);
});