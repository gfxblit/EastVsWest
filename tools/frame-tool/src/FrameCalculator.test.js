import { FrameCalculator } from './FrameCalculator.js';

describe('FrameCalculator', () => {
    let calculator;

    beforeEach(() => {
        calculator = new FrameCalculator();
    });

    test('should calculate frames correctly for a horizontal strip', () => {
        const config = {
            startX: 10,
            startY: 20,
            frameWidth: 32,
            frameHeight: 32,
            frameCount: 3
        };

        const frames = calculator.calculateFrames(config);

        expect(frames).toHaveLength(3);
        expect(frames[0]).toEqual(expect.objectContaining({ x: 10, y: 20, w: 32, h: 32 }));
        expect(frames[1]).toEqual(expect.objectContaining({ x: 42, y: 20, w: 32, h: 32 }));
        expect(frames[2]).toEqual(expect.objectContaining({ x: 74, y: 20, w: 32, h: 32 }));
    });

    test('should handle zero frame count', () => {
         const config = {
            startX: 0,
            startY: 0,
            frameWidth: 32,
            frameHeight: 32,
            frameCount: 0
        };
        const frames = calculator.calculateFrames(config);
        expect(frames).toHaveLength(0);
    });

    test('should handle string inputs', () => {
        const config = {
            startX: '10',
            startY: '20',
            frameWidth: '32',
            frameHeight: '32',
            frameCount: '3'
        };

        const frames = calculator.calculateFrames(config);

        expect(frames).toHaveLength(3);
        expect(frames[0]).toEqual(expect.objectContaining({ x: 10, y: 20, w: 32, h: 32 }));
    });

    test('should include default anchor point in frames', () => {
        const config = {
            startX: 0,
            startY: 0,
            frameWidth: 32,
            frameHeight: 64,
            frameCount: 1
        };

        const frames = calculator.calculateFrames(config);

        expect(frames[0]).toHaveProperty('anchor');
        expect(frames[0].anchor).toEqual({ x: 16, y: 32 }); // Center of 32x64
    });
});