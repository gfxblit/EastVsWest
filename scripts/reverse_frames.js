#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRAME_WIDTH = 64;
const FRAME_HEIGHT = 64;
const NUM_FRAMES = 5;

async function reverseFrames(inputPath, outputPath) {
  try {
    // Load input image
    const inputBuffer = await fs.readFile(inputPath);
    const metadata = await sharp(inputBuffer).metadata();
    
    // Validate dimensions
    const expectedWidth = FRAME_WIDTH * NUM_FRAMES;
    if (metadata.width !== expectedWidth || metadata.height !== FRAME_HEIGHT) {
        console.error(`Error: Input image must be ${expectedWidth}x${FRAME_HEIGHT}. Got ${metadata.width}x${metadata.height}.`);
        process.exit(1);
    }

    const compositeOperations = [];

    // Extract frames and reorder
    console.log(`Processing ${inputPath}...`);
    for (let destIndex = 0; destIndex < NUM_FRAMES; destIndex++) {
      // We want destIndex 0 to take from the last frame
      const srcIndex = (NUM_FRAMES - 1) - destIndex;
      
      const frameBuffer = await sharp(inputBuffer)
          .extract({ 
              left: srcIndex * FRAME_WIDTH, 
              top: 0, 
              width: FRAME_WIDTH, 
              height: FRAME_HEIGHT 
          })
          .toBuffer();

      compositeOperations.push({
        input: frameBuffer,
        left: destIndex * FRAME_WIDTH,
        top: 0
      });
    }

    // Create new sprite sheet
    const spriteSheet = sharp({
      create: {
        width: expectedWidth,
        height: FRAME_HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });

    // Save output
    await spriteSheet
      .composite(compositeOperations)
      .png()
      .toFile(outputPath);
      
    console.log(`✓ Reversed sprite sheet saved to: ${outputPath}`);

  } catch (error) {
    console.error('Error processing image:', error.message);
    process.exit(1);
  }
}

// CLI Argument Handling
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node scripts/reverse_frames.js <input_path> <output_path>');
    console.log('Example: node scripts/reverse_frames.js public/assets/vfx/slash-right.png public/assets/vfx/slash-right-reversed.png');
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), args[0]);
  const outputPath = path.resolve(process.cwd(), args[1]);

  reverseFrames(inputPath, outputPath);
}
