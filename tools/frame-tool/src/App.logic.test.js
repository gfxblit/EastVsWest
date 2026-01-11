import { jest } from '@jest/globals';
import { App } from './app.js';

describe('App Logic Integration', () => {
    let app;
    let mockContext;
    let getContextSpy;

    beforeEach(() => {
        // Setup minimal DOM required for App initialization
        document.body.innerHTML = `
            <input type="file" id="imageInput">
            <input type="number" id="startX" value="0">
            <input type="number" id="startY" value="0">
            <input type="number" id="frameWidth" value="32">
            <input type="number" id="frameHeight" value="32">
            <input type="number" id="frameCount" value="2">
            <input type="number" id="fps" value="10">
            <input type="number" id="globalWidth" value="64">
            <input type="number" id="globalHeight" value="64">
            <button id="exportBtn"></button>
            <canvas id="mainCanvas"></canvas>
            <canvas id="previewCanvas"></canvas>
            <textarea id="jsonOutput"></textarea>
            <div id="dropZone"></div>
            <div id="overlayLayer"></div>
            <button id="saveProjectBtn"></button>
            <input type="file" id="loadProjectInput">
            <input type="checkbox" id="bgRemoveEnabled">
            <div id="bgRemoveControls" style="display: none;">
                <input type="color" id="bgKeyColor" value="#00ff00">
                <input type="text" id="bgKeyColorText" value="#00ff00">
                <input type="range" id="bgThreshold" value="0">
                <span id="bgThresholdVal">0</span>
                <input type="range" id="bgErode" value="0">
                <span id="bgErodeVal">0</span>
            </div>
        `;

        // Mock canvas context
        mockContext = {
            clearRect: jest.fn(),
            drawImage: jest.fn(),
            strokeRect: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillRect: jest.fn(),
            fillText: jest.fn(),
        };

        // Use spyOn instead of direct assignment to avoid polluting global state
        getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockContext);

        app = new App();
    });

    afterEach(() => {
        // Cleanup
        getContextSpy.mockRestore();
        document.body.innerHTML = '';
    });

    describe('Overrides', () => {
        test('should apply frame position overrides', () => {
            // Initial state: frame 1 should be at x=32 (since frameWidth=32, startX=0)
            app.update();
            expect(app.frames[1].x).toBe(32);
            expect(app.frames[1].y).toBe(0);

            // Apply override
            app.frameOverrides[1] = { x: 50, y: 10 };
            app.update();

            // Check if override was applied
            expect(app.frames[1].x).toBe(50);
            expect(app.frames[1].y).toBe(10);

            // Frame 0 should remain untouched
            expect(app.frames[0].x).toBe(0);
        });

        test('should apply anchor overrides', () => {
            // Initial state: anchor at center (16, 16)
            app.update();
            expect(app.frames[0].anchor).toEqual({ x: 16, y: 16 });

            // Apply override
            app.anchorOverrides[0] = { x: 10, y: 5 };
            app.update();

            expect(app.frames[0].anchor).toEqual({ x: 10, y: 5 });

            // Frame 1 should have default anchor
            expect(app.frames[1].anchor).toEqual({ x: 16, y: 16 });
        });
    });

    describe('JSON Generation', () => {
        beforeEach(() => {
            // Mock an image loaded into the app
            app.image = { width: 128, height: 64 };
            app.sourceFilename = 'test_sheet.png';

            // Set inputs to match
            app.inputs.frameWidth.value = '32';
            app.inputs.frameHeight.value = '32';
            app.inputs.startX.value = '0';
            app.inputs.startY.value = '32'; // Second row
            app.inputs.frameCount.value = '4';
        });

        test('should generate correct JSON structure with image metrics', () => {
            app.update();

            const output = JSON.parse(app.jsonOutput.value);

            expect(output).toEqual(expect.objectContaining({
                sourceFilename: 'test_sheet.png',
                frameWidth: 32,
                frameHeight: 32,
                columns: 4, // 128 / 32
                rows: 2     // 64 / 32
            }));

            // Check animation row calculation
            // startY is 32, height is 32 -> row 1
            expect(output.animations).toBeDefined();
            expect(output.animations.sample_animation).toBeDefined();
            expect(output.animations.sample_animation).toEqual({
                row: 1,
                frames: 4
            });
        });

        test('should fallback to frames array if no image is loaded', () => {
            app.image = null;
            app.update();

            const output = JSON.parse(app.jsonOutput.value);

            // Should not have columns/rows/animations derived from image
            expect(output.columns).toBeUndefined();
            expect(output.animations).toBeUndefined();

            // Should contain raw frames list
            expect(output.frames).toBeDefined();
            expect(output.frames).toHaveLength(4);
            expect(output.frames[0]).toHaveProperty('x');
        });
    });
});
