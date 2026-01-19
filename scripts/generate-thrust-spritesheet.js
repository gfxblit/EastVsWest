#!/usr/bin/env node
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Default configuration
const DEFAULT_CONFIG = {
  inputDir: path.join(PROJECT_ROOT, 'public/assets/raw'),
  crop: '1024x1024+0+0',
  outputWidth: null,
  tolerance: 10,
  output: path.join(PROJECT_ROOT, 'public/assets/vfx/thrust-right.png'),
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input-dir' && args[i + 1]) {
      config.inputDir = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--crop' && args[i + 1]) {
      config.crop = args[++i];
    } else if (arg === '--output-width' && args[i + 1]) {
      config.outputWidth = parseInt(args[++i], 10);
    } else if (arg === '--tolerance' && args[i + 1]) {
      config.tolerance = parseInt(args[++i], 10);
    } else if (arg === '--output' && args[i + 1]) {
      config.output = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node generate-thrust-spritesheet.js [options]

Options:
  --input-dir <path>     Directory containing thrust-*.png (default: public/assets/raw)
  --crop <WxH+X+Y>       Crop area (default: 1024x1024+0+0)
  --output-width <px>    Width of each frame in output (default: matches crop width)
  --tolerance <number>   Color distance tolerance for alpha extraction (0-255) (default: 10)
  --output <path>        Output filename (default: public/assets/vfx/thrust-right.png)
  --help, -h             Show this help message
`);
      process.exit(0);
    }
  }
  return config;
}

const options = parseArgs();

async function createSpritesheet() {
  const numImages = 5;
  const filenames = Array.from({ length: numImages }, (_, i) => 
    path.join(options.inputDir, `thrust-${i + 1}.png`),
  );

  try {
    // Parse crop WxH+X+Y
    const cropMatch = options.crop.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/);
    if (!cropMatch) {
      throw new Error('Invalid crop format. Expected WxH+X+Y (e.g., 1024x1024+0+0)');
    }
    const [_, cropW, cropH, cropX, cropY] = cropMatch.map(Number);

    // Calculate output size. Height follows crop aspect ratio.
    const outW = options.outputWidth || cropW;
    const outH = Math.round(outW * (cropH / cropW));

    console.log(`Crop Area: ${cropW}x${cropH} at (${cropX}, ${cropY})`);
    console.log(`Output Frame: ${outW}x${outH} (Aspect Ratio: ${(cropH / cropW).toFixed(4)})`);

    const processedFrames = [];

    for (const file of filenames) {
      // 2. Sample background color at (512, 512)
      // We extract a 32x32 patch to find the dominant color
      const patch = await sharp(file)
        .extract({ left: 512, top: 512, width: 32, height: 32 })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Simple mode calculation for the patch
      const counts = {};
      let maxCount = 0;
      let bg = [0, 0, 0];

      for (let i = 0; i < patch.data.length; i += patch.info.channels) {
        const r = patch.data[i];
        const g = patch.data[i + 1];
        const b = patch.data[i + 2];
        const key = `${r},${g},${b}`;
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > maxCount) {
          maxCount = counts[key];
          bg = [r, g, b];
        }
      }

      console.log(`Processing ${path.basename(file)}: Detected BG Color [${bg}]`);

      // 3. Process frame: Alpha Extraction -> Crop -> Resize
      const frameBuffer = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { data, info } = frameBuffer;
      const tolSq = options.tolerance * options.tolerance;

      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const distSq = Math.pow(r - bg[0], 2) + Math.pow(g - bg[1], 2) + Math.pow(b - bg[2], 2);
        
        if (distSq <= tolSq) {
          data[i + 3] = 0; // Set alpha to 0
        }
      }

      const processedFrame = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .extract({
          left: cropX,
          top: cropY,
          width: cropW,
          height: cropH,
        })
        .resize(outW, outH)
        .png()
        .toBuffer();

      processedFrames.push(processedFrame);
    }

    // 4. Composite into vertical spritesheet
    const spritesheet = sharp({
      create: {
        width: outW,
        height: outH * numImages,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    });

    const compositeArr = processedFrames.map((buffer, i) => ({
      input: buffer,
      top: i * outH,
      left: 0,
    }));

    await spritesheet
      .composite(compositeArr)
      .toFile(options.output);

    console.log(`Spritesheet saved as ${options.output} (Total Size: ${outW}x${outH * numImages})`);

  } catch (err) {
    console.error('Error creating spritesheet:', err);
    process.exit(1);
  }
}

createSpritesheet();
