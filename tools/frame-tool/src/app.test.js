import { jest } from '@jest/globals';
import { App } from './app.js';
import { FrameCalculator } from './FrameCalculator.js';

describe('App State Management', () => {
    let app;

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = `
            <input type="file" id="imageInput">
            <input type="number" id="startX" value="0">
            <input type="number" id="startY" value="0">
            <input type="number" id="frameWidth" value="32">
            <input type="number" id="frameHeight" value="32">
            <input type="number" id="frameCount" value="4">
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
                <input type="range" id="bgThreshold" min="0" max="255" value="0">
                <span id="bgThresholdVal">0</span>
            </div>
        `;

        // Mock canvas context
        const mockContext = {
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
        HTMLCanvasElement.prototype.getContext = jest.fn(() => mockContext);

        app = new App();
    });

    test('getProjectState returns current config and overrides', () => {
        // Set some values
        app.inputs.startX.value = '10';
        app.inputs.frameWidth.value = '64';
        app.anchorOverrides = { 0: { x: 5, y: 5 } };
        app.frameOverrides = { 1: { x: 20, y: 20 } };

        const state = app.getProjectState();

        expect(state).toEqual({
            config: {
                startX: 10,
                startY: 0,
                frameWidth: 64,
                frameHeight: 32,
                frameCount: 4,
                fps: 10,
                globalWidth: 64,
                globalHeight: 64
            },
            sourceFilename: null,
            anchorOverrides: { 0: { x: 5, y: 5 } },
            frameOverrides: { 1: { x: 20, y: 20 } },
            background: {
                color: '#00ff00',
                threshold: 0
            }
        });
    });

    test('loadProjectState restores config and overrides', () => {
        const state = {
            config: {
                startX: 50,
                startY: 10,
                frameWidth: 128,
                frameHeight: 128,
                frameCount: 8,
                fps: 30,
                globalWidth: 200,
                globalHeight: 200
            },
            anchorOverrides: { 2: { x: 15, y: 15 } },
            frameOverrides: { 3: { x: 40, y: 40 } }
        };

        app.loadProjectState(state);

        expect(app.inputs.startX.value).toBe('50');
        expect(app.inputs.startY.value).toBe('10');
        expect(app.inputs.frameWidth.value).toBe('128');
        expect(app.anchorOverrides).toEqual({ 2: { x: 15, y: 15 } });
        expect(app.frameOverrides).toEqual({ 3: { x: 40, y: 40 } });
        
        // Should trigger update (we can check if calculator was called or just assume)
        // Since we mocked FrameCalculator, we can check if calculateFrames was called if we wanted,
        // but checking the state is enough.
    });

    test('captures filename when image is selected and includes it in project state', () => {
        const file = new File([''], 'test-spritesheet.png', { type: 'image/png' });
        
        // Mock FileReader
        const mockFileReaderInstance = {
            readAsDataURL: jest.fn(function() {
                this.onload({ target: { result: 'data:image/png;base64,' } });
            }),
            onload: null
        };
        global.FileReader = jest.fn(() => mockFileReaderInstance);
        
        // Mock Image
        const mockImage = {};
        global.Image = jest.fn(() => mockImage);

        app.handleFileSelect(file);

        expect(app.sourceFilename).toBe('test-spritesheet.png');
        
        const state = app.getProjectState();
        expect(state.sourceFilename).toBe('test-spritesheet.png');

        // Simulate loading project with filename
        const newState = {
            config: {},
            sourceFilename: 'other-image.png',
            anchorOverrides: {},
            frameOverrides: {}
        };
        app.loadProjectState(newState);
        expect(app.sourceFilename).toBe('other-image.png');
    });

    test('getProjectState includes background removal settings', () => {
        app.bgKeyColor.value = '#ff00ff';
        app.bgThreshold.value = '150';

        const state = app.getProjectState();

        expect(state.background).toEqual({
            color: '#ff00ff',
            threshold: 150
        });
    });

    test('loadProjectState restores background removal settings', () => {
        const state = {
            config: {},
            background: {
                color: '#0000ff',
                threshold: 75
            }
        };

        app.loadProjectState(state);

        expect(app.bgKeyColor.value).toBe('#0000ff');
        expect(app.bgKeyColorText.value).toBe('#0000ff');
        expect(app.bgThreshold.value).toBe('75');
        expect(app.bgThresholdVal.textContent).toBe('75');
    });
});
