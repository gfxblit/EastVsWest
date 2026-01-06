import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
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
  // Use a temporary directory for the source assets
  let pixelLabDir;
  let metadataPath;
  
  // Use a temporary output directory for tests
  const testOutputDirName = 'test-output';
  const testOutputDir = path.join(projectRoot, testOutputDirName);
  const outputSpritePath = path.join(testOutputDir, 'player-walk-spritesheet.png');
  const outputMetadataPath = path.join(testOutputDir, 'player-walk-spritesheet.json');

  // Helper to generate assets
  async function setupTestAssets(baseDir, metaPath) {
    const directions = [
      'south', 'south-east', 'east', 'north-east', 
      'north', 'north-west', 'west', 'south-west'
    ];
    
    const animations = {};
    const framesPerDir = 6;

    // Create directory structure
    for (const dir of directions) {
      const dirPath = path.join(baseDir, 'animations', 'walking', dir);
      await fs.mkdir(dirPath, { recursive: true });
      
      const framePaths = [];
      for (let i = 0; i < framesPerDir; i++) {
        const fileName = `frame_${i}.png`;
        const filePath = path.join(dirPath, fileName);
        
        // Create a simple colored square
        await sharp({
          create: {
            width: 96,
            height: 96,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 255 }
          }
        }).png().toFile(filePath);
        
        // Store relative path as expected in metadata
        framePaths.push(path.join('animations', 'walking', dir, fileName));
      }
      animations[dir] = framePaths;
    }

    const metadata = {
      character: { size: { width: 96, height: 96 } },
      frames: {
        animations: {
          walking: animations
        }
      }
    };

    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  }

  beforeAll(async () => {
    // Create a temporary directory for the source assets
    pixelLabDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixellab-test-'));
    metadataPath = path.join(pixelLabDir, 'metadata.json');

    // Generate dummy assets
    await setupTestAssets(pixelLabDir, metadataPath);
  });

  afterAll(async () => {
    // Cleanup source assets
    try {
      await fs.rm(pixelLabDir, { recursive: true, force: true });
    } catch (e) { 
      console.error('Failed to cleanup temp dir', e); 
    }
  });

  beforeEach(async () => {
    // Ensure test output directory exists
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up generated files and directory after tests
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
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
      // Create a test frame with wrong dimensions in a temp subdir
      const testDir = path.join(pixelLabDir, 'test-frames-wrong-size');
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
              south: [path.relative(pixelLabDir, wrongSizeFrame)]
            }
          }
        }
      };

      const result = await validateFrames(fakeMetadata, pixelLabDir);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('wrong-size.png');
      expect(result.errors[0]).toContain('96x96');
      
      // Cleanup is handled by afterAll (parent dir removal), but we can be nice
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

      await generateSpriteSheet(validation.framePaths, outputSpritePath, 96, 96, 6);

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

      await generateSpriteSheet(validation.framePaths, outputSpritePath, 96, 96, 6);

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

      await generateMetadata(outputMetadataPath, expectedDirections, 96, 96, 6);

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
      const generator = new SpriteSheetGenerator(projectRoot, pixelLabDir, testOutputDirName);
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
      const generator = new SpriteSheetGenerator(projectRoot, '/fake/path', testOutputDirName);

      await expect(generator.generate()).rejects.toThrow();
    });
  });
});