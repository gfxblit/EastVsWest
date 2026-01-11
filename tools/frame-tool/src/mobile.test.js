import { jest } from '@jest/globals';
import { App } from './app.js';

describe('App Mobile Support', () => {
    let app;
    let getContextSpy;

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
                <input type="range" id="bgThreshold" value="0">
                <span id="bgThresholdVal">0</span>
                <input type="range" id="bgErode" value="0">
                <span id="bgErodeVal">0</span>
            </div>
            <!-- Added for mobile mode toggle -->
            <div id="interactionModeContainer">
                <select id="interactionMode">
                    <option value="frame">Move Frame</option>
                    <option value="anchor">Move Anchor</option>
                </select>
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
            getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
            putImageData: jest.fn(),
        };
        getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockContext);

        app = new App();
    });

    afterEach(() => {
        getContextSpy.mockRestore();
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    test('should handle touchstart on handles', () => {
        // Setup some frames
        app.frames = [{ x: 0, y: 0, w: 32, h: 32, anchor: { x: 16, y: 16 } }];
        app.renderOverlays();
        
        const handle = app.overlayLayer.firstChild;
        expect(handle).not.toBeNull();

        const touchStartEvent = new CustomEvent('touchstart', { bubbles: true });
        touchStartEvent.touches = [{ clientX: 100, clientY: 100 }];
        touchStartEvent.preventDefault = jest.fn();
        touchStartEvent.stopPropagation = jest.fn();
        
        handle.dispatchEvent(touchStartEvent);

        expect(app.draggingFrame).toBe(0);
        expect(app.dragStartMouse).toEqual({ x: 100, y: 100 });
    });

    test('should handle touchmove for frame dragging', () => {
        app.frames = [{ x: 0, y: 0, w: 32, h: 32, anchor: { x: 16, y: 16 } }];
        app.draggingFrame = 0;
        app.dragStartMouse = { x: 100, y: 100 };
        app.dragStartFramePos = { x: 0, y: 0 };
        app.dragStartAnchor = { x: 16, y: 16 };

        const touchMoveEvent = new CustomEvent('touchmove');
        touchMoveEvent.touches = [{ clientX: 110, clientY: 120 }];
        touchMoveEvent.preventDefault = jest.fn();
        
        window.dispatchEvent(touchMoveEvent);

        expect(app.frameOverrides[0]).toEqual({ x: 10, y: 20 });
    });

    test('should handle touchend', () => {
        app.draggingFrame = 0;
        
        const touchEndEvent = new CustomEvent('touchend');
        window.dispatchEvent(touchEndEvent);

        expect(app.draggingFrame).toBeNull();
    });

    test('should handle canvas tap for setting anchor', () => {
        app.image = { width: 100, height: 100 }; // Mock image
        app.frames = [{ x: 0, y: 0, w: 32, h: 32, anchor: { x: 16, y: 16 } }];
        
        // Mock getBoundingClientRect
        app.mainCanvas.getBoundingClientRect = jest.fn(() => ({
            left: 0, top: 0, width: 32, height: 32
        }));

        const touchStartEvent = new CustomEvent('touchstart');
        touchStartEvent.touches = [{ clientX: 5, clientY: 5 }];
        touchStartEvent.preventDefault = jest.fn();
        
        app.mainCanvas.dispatchEvent(touchStartEvent);

        expect(app.anchorOverrides[0]).toEqual({ x: 5, y: 5 });
    });
});
