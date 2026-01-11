import { BackgroundRemover } from './BackgroundRemover.js';

describe('BackgroundRemover', () => {
    describe('hexToRgb', () => {
        test('should convert hex string to rgb object', () => {
            expect(BackgroundRemover.hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
            expect(BackgroundRemover.hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
            expect(BackgroundRemover.hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
            expect(BackgroundRemover.hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
            expect(BackgroundRemover.hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
        });
    });

    describe('process', () => {
        let imageData;
        const width = 2;
        const height = 2;

        beforeEach(() => {
            // Create a 2x2 ImageData mock
            // [Red, Green]
            // [Blue, White]
            const data = new Uint8ClampedArray([
                255, 0, 0, 255,   0, 255, 0, 255,
                0, 0, 255, 255,   255, 255, 255, 255
            ]);
            imageData = { width, height, data };
        });

        test('should remove exact color match', () => {
            const keyColor = '#00ff00'; // Green
            const threshold = 0;

            BackgroundRemover.process(imageData, keyColor, threshold);

            // Green pixel (index 4-7) should be transparent (alpha 0)
            expect(imageData.data[7]).toBe(0);

            // Red pixel (index 0-3) should be unchanged
            expect(imageData.data[3]).toBe(255);
            // Blue pixel (index 8-11) should be unchanged
            expect(imageData.data[11]).toBe(255);
        });

        test('should remove colors within threshold', () => {
            // Modify Green pixel to be slightly off-green
            // Original Green: 0, 255, 0
            // New pixel: 10, 245, 10
            imageData.data[4] = 10;
            imageData.data[5] = 245;
            imageData.data[6] = 10;

            const keyColor = '#00ff00';
            // Distance check:
            // dR = 10, dG = 10, dB = 10
            // Euclidean = sqrt(100 + 100 + 100) = sqrt(300) ≈ 17.32
            // Threshold needs to be cover this. Max distance is sqrt(3 * 255^2) ≈ 441.67
            // If threshold is 0-255 based on channel diff or euclidean?
            // Let's assume threshold is simple channel distance or Euclidean distance.
            // Let's verify implementation detail later, but for now let's assume strict thresholding.
            // If we use standard Euclidean distance in RGB:
            
            const threshold = 20; // Sufficient for ~17.32

            BackgroundRemover.process(imageData, keyColor, threshold);

            expect(imageData.data[7]).toBe(0);
        });

        test('should not remove colors outside threshold', () => {
             // Modify Green pixel to be very off-green
            imageData.data[4] = 50;
            imageData.data[5] = 200;
            imageData.data[6] = 50;

            const keyColor = '#00ff00';
            // Distance check:
            // dR = 50, dG = 55, dB = 50
            // Euclidean > 50
            
            const threshold = 20;

            BackgroundRemover.process(imageData, keyColor, threshold);

            expect(imageData.data[7]).toBe(255);
        });

        test('should respect exact threshold boundary', () => {
             // Key Color: (0, 0, 0)
             const keyColor = '#000000';

             // Pixel 1: (10, 0, 0). DistSq = 100.
             // Pixel 2: (11, 0, 0). DistSq = 121.

             // Create data: [R, G, B, A]
             const data = new Uint8ClampedArray([
                 10, 0, 0, 255,  // Pixel 1
                 11, 0, 0, 255   // Pixel 2
             ]);
             imageData = { width: 2, height: 1, data };

             // Threshold 10. ThreshSq = 100.
             // Pixel 1 distSq (100) <= 100 -> Should remove.
             // Pixel 2 distSq (121) > 100 -> Should keep.
             BackgroundRemover.process(imageData, keyColor, 10);

             expect(imageData.data[3]).toBe(0);   // Pixel 1 removed
             expect(imageData.data[7]).toBe(255); // Pixel 2 kept
        });

        test('should preserve existing transparency of non-matching pixels', () => {
            const keyColor = '#00ff00';

            // Pixel 1: Red, but already half transparent
            // Pixel 2: Red, fully transparent
            const data = new Uint8ClampedArray([
                255, 0, 0, 128,
                255, 0, 0, 0
            ]);
            imageData = { width: 2, height: 1, data };

            BackgroundRemover.process(imageData, keyColor, 0);

            // Neither matches green, so logic shouldn't touch them.
            // Alpha should remain as is.
            expect(imageData.data[3]).toBe(128);
            expect(imageData.data[7]).toBe(0);
        });
    });
});
