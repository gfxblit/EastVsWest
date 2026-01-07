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

async function rotateFrames(inputPath, outputPath, degrees) {
  try {
    const angle = parseInt(degrees, 10);
    if (isNaN(angle)) {
      throw new Error('Degrees must be a number');
    }

    // Load input image
    const inputBuffer = await fs.readFile(inputPath);
    const metadata = await sharp(inputBuffer).metadata();

    // Check dimensions.
    // If input is not standard, we might warn, but let's try to process standard 320x64.
    // If it's 460x92 (as magick reported), we might have issues.
    console.log(`Input dimensions: ${metadata.width}x${metadata.height}`);

    const compositeOperations = [];

    // Extract and rotate each frame
    console.log(`Processing ${inputPath}...`);
    for (let i = 0; i < NUM_FRAMES; i++) {
      let framePipeline = sharp(inputBuffer)
          .extract({
              left: i * FRAME_WIDTH,
              top: 0,
              width: FRAME_WIDTH,
              height: FRAME_HEIGHT
          })
          .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } });

      const rotatedBuffer = await framePipeline.toBuffer();

      // Load rotated image to check dimensions and crop back to 64x64
      const rotatedImage = sharp(rotatedBuffer);
      const rotatedMeta = await rotatedImage.metadata();

      const left = Math.floor((rotatedMeta.width - FRAME_WIDTH) / 2);
      const top = Math.floor((rotatedMeta.height - FRAME_HEIGHT) / 2);

      const croppedBuffer = await rotatedImage
        .extract({
          left: Math.max(0, left),
          top: Math.max(0, top),
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT
        })
        .toBuffer();

      compositeOperations.push({
        input: croppedBuffer,
        left: i * FRAME_WIDTH,
        top: 0
      });
    }

    // Create new sprite sheet
    const spriteSheet = sharp({
      create: {
        width: FRAME_WIDTH * NUM_FRAMES,
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

    console.log(`✓ Rotated sprite sheet saved to: ${outputPath}`);

  } catch (error) {
    console.error('Error processing image:', error.message);
    process.exit(1);
  }
}

// CLI Argument Handling
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: node scripts/rotate_frames.js <input_path> <output_path> <degrees>');
    console.log('Example: node scripts/rotate_frames.js input.png output.png 90');
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), args[0]);
  const outputPath = path.resolve(process.cwd(), args[1]);
  const degrees = args[2];

  rotateFrames(inputPath, outputPath, degrees);
}
