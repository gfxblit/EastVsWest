import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Import the module we're testing
import {
  validateFrames,
  generateSpriteSheet,
  generateMetadata,
  SpriteSheetGenerator
} from './generate-spritesheet.js';

describe('Sprite Sheet Generator', () => {
  // Use /tmp/pixellab_character as the test directory
  const pixelLabDir = '/tmp/pixellab_character';
  const metadataPath = path.join(pixelLabDir, 'metadata.json');
  const outputSpritePath = path.join(projectRoot, 'public/assets/player/player-walk-spritesheet.png');
  const outputMetadataPath = path.join(projectRoot, 'public/assets/player/player-walk-spritesheet.json');

  afterEach(async () => {
    // Clean up generated files after tests
    try {
      await fs.unlink(outputSpritePath);
    } catch (err) {
      // File might not exist, that's ok
    }
    try {
      await fs.unlink(outputMetadataPath);
    } catch (err) {
      // File might not exist, that's ok
    }
  });

  describe('validateFrames', () => {
    test('WhenAllFramesExist_ShouldReturnTrue', async () => {
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      const result = await validateFrames(metadata, pixelLabDir);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('WhenFrameIsMissing_ShouldReturnError', async () => {
      const fakeMetadata = {
        character: { size: { width: 96, height: 96 } },
        frames: {
          animations: {
            walking: {
              south: ['animations/walking/south/missing.png']
            }
          }
        }
      };

      const result = await validateFrames(fakeMetadata, pixelLabDir);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('missing.png');
    });

    test('WhenFrameHasWrongDimensions_ShouldReturnError', async () => {
      // Create a test frame with wrong dimensions in /tmp
      const testDir = path.join('/tmp', 'test-frames');
      await fs.mkdir(testDir, { recursive: true });
      const wrongSizeFrame = path.join(testDir, 'wrong-size.png');

      // Create a 50x50 image instead of 96x96
      await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 }
        }
      }).png().toFile(wrongSizeFrame);

      const fakeMetadata = {
        character: { size: { width: 96, height: 96 } },
        frames: {
          animations: {
            walking: {
              south: ['test-frames/wrong-size.png']
            }
          }
        }
      };

      const result = await validateFrames(fakeMetadata, '/tmp');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('wrong-size.png');
      expect(result.errors[0]).toContain('96x96');

      // Cleanup
      await fs.rm(testDir, { recursive: true });
    });

    test('WhenAllFramesValid_ShouldReturnFramePaths', async () => {
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      const result = await validateFrames(metadata, pixelLabDir);

      expect(result.framePaths).toBeDefined();
      expect(result.framePaths.length).toBe(8); // 8 directions
      expect(result.framePaths[0].direction).toBe('south');
      expect(result.framePaths[0].frames).toHaveLength(6); // 6 frames per direction
    });
  });

  describe('generateSpriteSheet', () => {
    test('WhenValidFrames_ShouldCreateSpriteSheet', async () => {
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      const validation = await validateFrames(metadata, pixelLabDir);

      await generateSpriteSheet(validation.framePaths, outputSpritePath, projectRoot);

      // Verify file exists
      const stats = await fs.stat(outputSpritePath);
      expect(stats.isFile()).toBe(true);

      // Verify dimensions
      const image = sharp(outputSpritePath);
      const imageMetadata = await image.metadata();
      expect(imageMetadata.width).toBe(576); // 6 columns * 96px
      expect(imageMetadata.height).toBe(768); // 8 rows * 96px
    });

    test('WhenGeneratingSheet_ShouldPlaceFramesInCorrectGrid', async () => {
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      const validation = await validateFrames(metadata, pixelLabDir);

      await generateSpriteSheet(validation.framePaths, outputSpritePath, projectRoot);

      // Extract a specific frame and verify it's not blank
      const image = sharp(outputSpritePath);

      // Extract first frame (south direction, frame 0 - top-left corner)
      const firstFrame = await image
        .extract({ left: 0, top: 0, width: 96, height: 96 })
        .raw()
        .toBuffer();

      // Verify it's not just transparent/blank pixels
      // At least some pixels should have non-zero values
      let hasContent = false;
      for (let i = 0; i < firstFrame.length; i += 4) {
        if (firstFrame[i] !== 0 || firstFrame[i+1] !== 0 || firstFrame[i+2] !== 0) {
          hasContent = true;
          break;
        }
      }
      expect(hasContent).toBe(true);
    });
  });

  describe('generateMetadata', () => {
    test('WhenCalled_ShouldCreateMetadataFile', async () => {
      const expectedDirections = [
        'south',
        'south-east',
        'east',
        'north-east',
        'north',
        'north-west',
        'west',
        'south-west'
      ];

      await generateMetadata(outputMetadataPath, expectedDirections);

      // Verify file exists
      const stats = await fs.stat(outputMetadataPath);
      expect(stats.isFile()).toBe(true);

      // Verify content
      const content = JSON.parse(await fs.readFile(outputMetadataPath, 'utf-8'));
      expect(content.frameWidth).toBe(96);
      expect(content.frameHeight).toBe(96);
      expect(content.columns).toBe(6);
      expect(content.rows).toBe(8);
      expect(content.directions).toEqual(expectedDirections);
    });
  });

  describe('SpriteSheetGenerator (Integration)', () => {
    test('WhenRunningFullGeneration_ShouldCreateBothFiles', async () => {
      const generator = new SpriteSheetGenerator(projectRoot, pixelLabDir);
      await generator.generate();

      // Verify both files exist
      const spriteStats = await fs.stat(outputSpritePath);
      expect(spriteStats.isFile()).toBe(true);

      const metadataStats = await fs.stat(outputMetadataPath);
      expect(metadataStats.isFile()).toBe(true);

      // Verify sprite sheet dimensions
      const image = sharp(outputSpritePath);
      const imageMetadata = await image.metadata();
      expect(imageMetadata.width).toBe(576);
      expect(imageMetadata.height).toBe(768);

      // Verify metadata content
      const metadataContent = JSON.parse(await fs.readFile(outputMetadataPath, 'utf-8'));
      expect(metadataContent.directions).toHaveLength(8);
    });

    test('WhenMetadataFileMissing_ShouldThrowError', async () => {
      const generator = new SpriteSheetGenerator(projectRoot, '/fake/path');

      await expect(generator.generate()).rejects.toThrow();
    });
  });
});
