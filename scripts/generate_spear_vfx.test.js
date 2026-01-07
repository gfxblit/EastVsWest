import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('Spear VFX Generator', () => {
  const outputDir = path.join(PROJECT_ROOT, 'public/assets/vfx/test-spear');
  const scriptPath = path.join(PROJECT_ROOT, 'scripts/generate_spear_vfx.js');

  beforeEach(async () => {
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore
    }
  });

  test('WhenRunningScript_ShouldGenerateFourDirectionalFiles', async () => {
    // Run the script with the test output directory
    execSync(`node ${scriptPath} --output ${outputDir}`, { stdio: 'inherit' });

    const directions = ['right', 'left', 'up', 'down'];
    for (const dir of directions) {
      const filePath = path.join(outputDir, `spear-${dir}.png`);
      
      // Verify file exists
      const stats = await fs.stat(filePath);
      expect(stats.isFile()).toBe(true);

      // Verify dimensions
      const image = sharp(filePath);
      const metadata = await image.metadata();
      expect(metadata.width).toBe(320);
      expect(metadata.height).toBe(64);
    }
  });
});
