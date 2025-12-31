#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sprite sheet configuration
const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 96;
const COLUMNS = 6;
const ROWS = 8;

// Direction order for sprite sheet rows (top to bottom)
const DIRECTION_ORDER = [
  'south',
  'south-east',
  'east',
  'north-east',
  'north',
  'north-west',
  'west',
  'south-west'
];

/**
 * Validates that all animation frames exist and have correct dimensions
 * @param {Object} metadata - The metadata object from metadata.json
 * @param {string} pixelLabDir - Path to PixelLab character directory (containing metadata.json and animations/)
 * @returns {Promise<{valid: boolean, errors: string[], framePaths: Array}>}
 */
export async function validateFrames(metadata, pixelLabDir) {
  const errors = [];
  const framePaths = [];
  const expectedWidth = metadata.character.size.width;
  const expectedHeight = metadata.character.size.height;
  const assetsDir = pixelLabDir;

  const walkingAnimations = metadata.frames.animations.walking;

  // Process each direction in the specified order
  for (const direction of DIRECTION_ORDER) {
    const frames = walkingAnimations[direction];
    if (!frames) {
      errors.push(`Missing animation frames for direction: ${direction}`);
      continue;
    }

    const directionFrames = {
      direction,
      frames: []
    };

    // Validate each frame
    for (const framePath of frames) {
      const fullPath = path.join(assetsDir, framePath);

      try {
        // Check if file exists
        await fs.access(fullPath);

        // Check dimensions
        const image = sharp(fullPath);
        const imageMetadata = await image.metadata();

        if (imageMetadata.width !== expectedWidth || imageMetadata.height !== expectedHeight) {
          errors.push(
            `Frame ${framePath} has incorrect dimensions (${imageMetadata.width}x${imageMetadata.height}), expected ${expectedWidth}x${expectedHeight}`
          );
        } else {
          directionFrames.frames.push(fullPath);
        }
      } catch (err) {
        errors.push(`Frame not found or unreadable: ${framePath}`);
      }
    }

    if (directionFrames.frames.length > 0) {
      framePaths.push(directionFrames);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    framePaths
  };
}

/**
 * Generates a sprite sheet from individual frames
 * @param {Array} framePaths - Array of {direction, frames[]} objects
 * @param {string} outputPath - Path to output sprite sheet
 * @param {string} projectRoot - Path to project root (unused but kept for API consistency)
 * @returns {Promise<void>}
 */
export async function generateSpriteSheet(framePaths, outputPath, projectRoot) {
  const sheetWidth = FRAME_WIDTH * COLUMNS;
  const sheetHeight = FRAME_HEIGHT * ROWS;

  // Create a blank sprite sheet
  const spriteSheet = sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });

  // Composite all frames onto the sprite sheet
  const compositeOperations = [];

  for (let rowIndex = 0; rowIndex < framePaths.length; rowIndex++) {
    const { frames } = framePaths[rowIndex];

    for (let colIndex = 0; colIndex < frames.length; colIndex++) {
      const framePath = frames[colIndex];
      const left = colIndex * FRAME_WIDTH;
      const top = rowIndex * FRAME_HEIGHT;

      compositeOperations.push({
        input: framePath,
        left,
        top
      });
    }
  }

  await spriteSheet
    .composite(compositeOperations)
    .png()
    .toFile(outputPath);
}

/**
 * Generates metadata JSON for the sprite sheet
 * @param {string} outputPath - Path to output metadata file
 * @param {Array<string>} directions - Array of direction names in row order
 * @returns {Promise<void>}
 */
export async function generateMetadata(outputPath, directions) {
  const metadata = {
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    columns: COLUMNS,
    rows: ROWS,
    directions
  };

  await fs.writeFile(outputPath, JSON.stringify(metadata, null, 2));
}

/**
 * Main sprite sheet generator class
 */
export class SpriteSheetGenerator {
  constructor(projectRoot, pixelLabDir) {
    this.projectRoot = projectRoot;
    this.pixelLabDir = pixelLabDir;
    this.metadataPath = path.join(pixelLabDir, 'metadata.json');
    this.outputSpritePath = path.join(projectRoot, 'public/assets/player/player-walk-spritesheet.png');
    this.outputMetadataPath = path.join(projectRoot, 'public/assets/player/player-walk-spritesheet.json');
  }

  async generate() {
    console.log(`Reading metadata from ${this.metadataPath}...`);
    const metadata = JSON.parse(await fs.readFile(this.metadataPath, 'utf-8'));

    console.log('Validating frames...');
    const validation = await validateFrames(metadata, this.pixelLabDir);

    if (!validation.valid) {
      const errorMessage = `Frame validation failed:\n${validation.errors.join('\n')}`;
      throw new Error(errorMessage);
    }

    console.log(`Validated ${validation.framePaths.length} directions with ${validation.framePaths[0].frames.length} frames each.`);

    console.log('Generating sprite sheet...');
    await generateSpriteSheet(validation.framePaths, this.outputSpritePath, this.projectRoot);

    console.log('Generating metadata...');
    const directions = validation.framePaths.map(fp => fp.direction);
    await generateMetadata(this.outputMetadataPath, directions);

    console.log(`✓ Sprite sheet generated: ${this.outputSpritePath}`);
    console.log(`✓ Metadata generated: ${this.outputMetadataPath}`);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const pixelLabDir = process.argv[2];

  if (!pixelLabDir) {
    console.error('Error: PixelLab directory path is required\n');
    console.error('Usage: node scripts/generate-spritesheet.js <pixellab-directory>');
    console.error('\nExample:');
    console.error('  node scripts/generate-spritesheet.js /tmp/pixellab_character');
    console.error('  npm run generate-spritesheet /tmp/pixellab_character');
    process.exit(1);
  }

  const projectRoot = path.resolve(__dirname, '..');

  console.log(`Project root: ${projectRoot}`);
  console.log(`PixelLab directory: ${pixelLabDir}\n`);

  const generator = new SpriteSheetGenerator(projectRoot, pixelLabDir);

  generator.generate()
    .then(() => {
      console.log('\n✓ Sprite sheet generation complete!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n✗ Error generating sprite sheet:');
      console.error(err.message);
      process.exit(1);
    });
}
