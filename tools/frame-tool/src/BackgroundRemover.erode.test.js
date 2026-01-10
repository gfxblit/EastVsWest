import { BackgroundRemover } from './BackgroundRemover.js';

describe('BackgroundRemover Erode', () => {
    let imageData;
    const width = 5;
    const height = 5;

    beforeEach(() => {
        // Create a 5x5 ImageData mock, all opaque white initially
        const data = new Uint8ClampedArray(width * height * 4).fill(255);
        imageData = { width, height, data };
    });

    test('should do nothing when amount is 0', () => {
        const originalData = new Uint8ClampedArray(imageData.data);
        BackgroundRemover.erode(imageData, 0);
        expect(imageData.data).toEqual(originalData);
    });

    test('should erode 1 pixel from transparent edge', () => {
        // Set the first column to transparent
        for (let y = 0; y < height; y++) {
            imageData.data[(y * width + 0) * 4 + 3] = 0;
        }

        // Before erosion: col 0 is transparent, col 1-4 are opaque
        BackgroundRemover.erode(imageData, 1);

        // After erosion: col 0 and 1 should be transparent, col 2-4 opaque
        for (let y = 0; y < height; y++) {
            expect(imageData.data[(y * width + 0) * 4 + 3]).toBe(0); // Original
            expect(imageData.data[(y * width + 1) * 4 + 3]).toBe(0); // Eroded
            expect(imageData.data[(y * width + 2) * 4 + 3]).toBe(255); // Still opaque
        }
    });

    test('should erode diagonally', () => {
        // Set just the top-left pixel to transparent
        imageData.data[3] = 0;

        BackgroundRemover.erode(imageData, 1);

        // Pixels (0,0), (0,1), (1,0), (1,1) should be transparent
        expect(imageData.data[(0 * width + 0) * 4 + 3]).toBe(0);
        expect(imageData.data[(0 * width + 1) * 4 + 3]).toBe(0);
        expect(imageData.data[(1 * width + 0) * 4 + 3]).toBe(0);
        expect(imageData.data[(1 * width + 1) * 4 + 3]).toBe(0);
        
        // (2,2) should still be opaque
        expect(imageData.data[(2 * width + 2) * 4 + 3]).toBe(255);
    });

    test('should erode multiple pixels (amount=2)', () => {
         // Set the first column to transparent
        for (let y = 0; y < height; y++) {
            imageData.data[(y * width + 0) * 4 + 3] = 0;
        }

        BackgroundRemover.erode(imageData, 2);

        // After erosion: col 0, 1, 2 should be transparent
        for (let y = 0; y < height; y++) {
            expect(imageData.data[(y * width + 0) * 4 + 3]).toBe(0);
            expect(imageData.data[(y * width + 1) * 4 + 3]).toBe(0);
            expect(imageData.data[(y * width + 2) * 4 + 3]).toBe(0);
            expect(imageData.data[(y * width + 3) * 4 + 3]).toBe(255);
        }
    });

    test('should not erode from image boundaries', () => {
        // All pixels are opaque. No transparent pixels exist.
        // Even if we are at boundary, if no neighbor is transparent, nothing happens.
        const originalData = new Uint8ClampedArray(imageData.data);
        BackgroundRemover.erode(imageData, 1);
        expect(imageData.data).toEqual(originalData);
    });
});
