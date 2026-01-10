import './style.css';
import { FrameCalculator } from './FrameCalculator.js';
import { BackgroundRemover } from './BackgroundRemover.js';

export class App {
    constructor() {
        this.calculator = new FrameCalculator();
        this.image = null;
        this.sourceFilename = null;
        this.frames = [];
        this.currentFrameIndex = 0;
        this.lastFrameTime = 0;
        this.animationId = null;

        // UI Elements
        this.imageInput = document.getElementById('imageInput');
        this.inputs = {
            startX: document.getElementById('startX'),
            startY: document.getElementById('startY'),
            frameWidth: document.getElementById('frameWidth'),
            frameHeight: document.getElementById('frameHeight'),
            frameCount: document.getElementById('frameCount'),
            fps: document.getElementById('fps'),
            globalWidth: document.getElementById('globalWidth'),
            globalHeight: document.getElementById('globalHeight'),
        };
        
        // Background Removal UI
        this.bgRemoveEnabled = document.getElementById('bgRemoveEnabled');
        this.bgRemoveControls = document.getElementById('bgRemoveControls');
        this.bgKeyColor = document.getElementById('bgKeyColor');
        this.bgKeyColorText = document.getElementById('bgKeyColorText');
        this.bgThreshold = document.getElementById('bgThreshold');
        this.bgThresholdVal = document.getElementById('bgThresholdVal');
        this.bgErode = document.getElementById('bgErode');
        this.bgErodeVal = document.getElementById('bgErodeVal');

        this.exportBtn = document.getElementById('exportBtn');
        this.saveProjectBtn = document.getElementById('saveProjectBtn');
        this.loadProjectInput = document.getElementById('loadProjectInput');
        this.mainCanvas = document.getElementById('mainCanvas');
        this.previewCanvas = document.getElementById('previewCanvas');
        this.jsonOutput = document.getElementById('jsonOutput');
        this.dropZone = document.getElementById('dropZone');
        this.overlayLayer = document.getElementById('overlayLayer');

        this.ctx = this.mainCanvas.getContext('2d');
        this.previewCtx = this.previewCanvas.getContext('2d');
        
        this.anchorOverrides = {}; // Map frame index to {x, y}
        this.frameOverrides = {}; // Map frame index to {x, y}
        
        this.draggingFrame = null;
        this.dragStartMouse = { x: 0, y: 0 };
        this.dragStartAnchor = { x: 0, y: 0 };
        this.dragStartFramePos = { x: 0, y: 0 };

        this.init();
    }

    init() {
        // Event Listeners
        this.imageInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
        
        Object.values(this.inputs).forEach(input => {
            input.addEventListener('input', () => this.update());
        });

        // Background Removal Events
        this.bgRemoveEnabled.addEventListener('change', () => {
            this.bgRemoveControls.style.display = this.bgRemoveEnabled.checked ? 'flex' : 'none';
            this.renderPreview();
        });

        this.bgKeyColor.addEventListener('input', (e) => {
            this.bgKeyColorText.value = e.target.value;
            this.renderPreview();
        });

        this.bgKeyColorText.addEventListener('input', (e) => {
            this.bgKeyColor.value = e.target.value;
            this.renderPreview();
        });

        this.bgThreshold.addEventListener('input', (e) => {
            this.bgThresholdVal.textContent = e.target.value;
            this.renderPreview();
        });

        this.bgErode.addEventListener('input', (e) => {
            this.bgErodeVal.textContent = e.target.value;
            this.renderPreview();
        });

        this.exportBtn.addEventListener('click', () => this.exportSpriteSheet());
        this.saveProjectBtn.addEventListener('click', () => this.saveProject());
        this.loadProjectInput.addEventListener('change', (e) => this.handleLoadProject(e));
        
        // Canvas click for setting anchor directly
        this.mainCanvas.addEventListener('mousedown', (e) => this.handleCanvasClick(e));

        // Global drag handlers
        window.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
        window.addEventListener('mouseup', () => this.handleGlobalMouseUp());

        // Drag and Drop
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.style.backgroundColor = '#333';
        });
        this.dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.dropZone.style.backgroundColor = '#222';
        });
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.style.backgroundColor = '#222';
            if (e.dataTransfer.files.length > 0) {
                this.handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        // Start animation loop
        this.animate(0);
    }

    handleFileSelect(file) {
        if (!file || !file.type.startsWith('image/')) return;

        this.sourceFilename = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.image = img;
                this.mainCanvas.width = img.width;
                this.mainCanvas.height = img.height;
                // Update overlay layer size to match canvas
                this.overlayLayer.style.width = img.width + 'px';
                this.overlayLayer.style.height = img.height + 'px';
                this.update();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    getConfig() {
        return {
            startX: parseInt(this.inputs.startX.value) || 0,
            startY: parseInt(this.inputs.startY.value) || 0,
            frameWidth: parseInt(this.inputs.frameWidth.value) || 32,
            frameHeight: parseInt(this.inputs.frameHeight.value) || 32,
            frameCount: parseInt(this.inputs.frameCount.value) || 1,
            fps: parseInt(this.inputs.fps.value) || 10,
            globalWidth: parseInt(this.inputs.globalWidth.value) || 64,
            globalHeight: parseInt(this.inputs.globalHeight.value) || 64
        };
    }

    getProjectState() {
        return {
            config: this.getConfig(),
            bgRemoval: {
                enabled: this.bgRemoveEnabled.checked,
                keyColor: this.bgKeyColor.value,
                threshold: this.bgThreshold.value,
                erode: this.bgErode.value
            },
            sourceFilename: this.sourceFilename,
            anchorOverrides: this.anchorOverrides,
            frameOverrides: this.frameOverrides
        };
    }

    loadProjectState(state) {
        if (state.config) {
            this.inputs.startX.value = state.config.startX;
            this.inputs.startY.value = state.config.startY;
            this.inputs.frameWidth.value = state.config.frameWidth;
            this.inputs.frameHeight.value = state.config.frameHeight;
            this.inputs.frameCount.value = state.config.frameCount;
            this.inputs.fps.value = state.config.fps;
            this.inputs.globalWidth.value = state.config.globalWidth;
            this.inputs.globalHeight.value = state.config.globalHeight;
        }

        if (state.bgRemoval) {
            this.bgRemoveEnabled.checked = state.bgRemoval.enabled;
            this.bgKeyColor.value = state.bgRemoval.keyColor;
            this.bgKeyColorText.value = state.bgRemoval.keyColor;
            this.bgThreshold.value = state.bgRemoval.threshold;
            this.bgThresholdVal.textContent = state.bgRemoval.threshold;
            this.bgErode.value = state.bgRemoval.erode || 0;
            this.bgErodeVal.textContent = state.bgRemoval.erode || 0;
            
            this.bgRemoveControls.style.display = this.bgRemoveEnabled.checked ? 'flex' : 'none';
        }

        if (state.sourceFilename) {
            this.sourceFilename = state.sourceFilename;
        }
        
        if (state.anchorOverrides) {
            this.anchorOverrides = state.anchorOverrides;
        }
        
        if (state.frameOverrides) {
            this.frameOverrides = state.frameOverrides;
        }

        this.update();
    }

    update() {
        const config = this.getConfig();
        this.frames = this.calculator.calculateFrames(config);
        
        // Apply overrides
        this.frames.forEach((frame, index) => {
            // Apply frame position overrides first
            if (this.frameOverrides[index]) {
                frame.x = this.frameOverrides[index].x;
                frame.y = this.frameOverrides[index].y;
            }

            // Apply anchor overrides
            if (this.anchorOverrides[index]) {
                frame.anchor = { ...this.anchorOverrides[index] };
            }
        });

        this.renderMain();
        this.renderOverlays();
        this.updateJSON(config);
        
        // Resize preview canvas
        this.previewCanvas.width = config.globalWidth;
        this.previewCanvas.height = config.globalHeight;
    }

    handleCanvasClick(e) {
        if (!this.image) return;

        const rect = this.mainCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Find which frame was clicked
        const frameIndex = this.frames.findIndex(f => 
            x >= f.x && x < f.x + f.w &&
            y >= f.y && y < f.y + f.h
        );

        if (frameIndex !== -1) {
            const frame = this.frames[frameIndex];
            // Anchor is relative to frame top-left
            this.anchorOverrides[frameIndex] = {
                x: x - frame.x,
                y: y - frame.y
            };
            this.update();
        }
    }

    handleHandleMouseDown(e, index) {
        e.stopPropagation(); // Prevent canvas click if any
        this.draggingFrame = index;
        this.dragStartMouse = { x: e.clientX, y: e.clientY };
        // Store original anchor and frame pos when drag started
        this.dragStartAnchor = { ...this.frames[index].anchor };
        this.dragStartFramePos = { x: this.frames[index].x, y: this.frames[index].y };
    }

    handleGlobalMouseMove(e) {
        if (this.draggingFrame !== null) {
            const dx = e.clientX - this.dragStartMouse.x;
            const dy = e.clientY - this.dragStartMouse.y;
            
            if (e.shiftKey) {
                // Shift + Drag: Move Anchor (relative to frame)
                this.anchorOverrides[this.draggingFrame] = {
                    x: this.dragStartAnchor.x + dx,
                    y: this.dragStartAnchor.y + dy
                };
            } else {
                // Drag: Move Frame (updates Green Rect)
                this.frameOverrides[this.draggingFrame] = {
                    x: this.dragStartFramePos.x + dx,
                    y: this.dragStartFramePos.y + dy
                };
            }
            
            this.update();
        }
    }

    handleGlobalMouseUp() {
        this.draggingFrame = null;
    }

    renderOverlays() {
        // Clear existing overlays if frame count changes or just sync
        // For simplicity, we'll clear and recreate. Efficiency is fine for <100 elements.
        this.overlayLayer.innerHTML = '';

        this.frames.forEach((frame, index) => {
            const handle = document.createElement('div');
            handle.textContent = index;
            handle.style.position = 'absolute';
            // Position at absolute coordinates (frame.x + anchor.x)
            handle.style.left = (frame.x + frame.anchor.x) + 'px';
            handle.style.top = (frame.y + frame.anchor.y) + 'px';
            handle.style.transform = 'translate(-50%, -50%)'; // Center on anchor
            handle.style.width = '20px';
            handle.style.height = '20px';
            handle.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
            handle.style.color = 'white';
            handle.style.display = 'flex';
            handle.style.alignItems = 'center';
            handle.style.justifyContent = 'center';
            handle.style.borderRadius = '50%';
            handle.style.fontSize = '10px';
            handle.style.cursor = 'move';
            handle.style.pointerEvents = 'auto'; // Re-enable pointer events for the handle
            handle.style.userSelect = 'none';

            // Visual feedback if dragging this one
            if (this.draggingFrame === index) {
                handle.style.backgroundColor = 'rgba(255, 255, 0, 0.9)';
                handle.style.color = 'black';
                handle.style.border = '2px solid white';
                handle.style.zIndex = '100';
            }

            handle.addEventListener('mousedown', (e) => this.handleHandleMouseDown(e, index));
            
            this.overlayLayer.appendChild(handle);
        });
    }

    renderMain() {
        this.ctx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        
        if (this.image) {
            this.ctx.drawImage(this.image, 0, 0);
        }

        // Draw overlays
        this.ctx.lineWidth = 1;
        
        this.frames.forEach((frame, index) => {
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
            
            // Draw anchor point crosshair (below the label)
            const anchorX = frame.x + frame.anchor.x;
            const anchorY = frame.y + frame.anchor.y;

            this.ctx.strokeStyle = '#ff0000';
            this.ctx.beginPath();
            this.ctx.moveTo(anchorX - 10, anchorY);
            this.ctx.lineTo(anchorX + 10, anchorY);
            this.ctx.moveTo(anchorX, anchorY - 10);
            this.ctx.lineTo(anchorX, anchorY + 10);
            this.ctx.stroke();
        });
    }

    updateJSON(config) {
        // Construct a JSON object compatible with the project's spritesheet format
        let output = {
            sourceFilename: this.sourceFilename,
            frameWidth: config.frameWidth,
            frameHeight: config.frameHeight
        };

        if (this.image) {
            output.columns = Math.floor(this.image.width / config.frameWidth);
            output.rows = Math.floor(this.image.height / config.frameHeight);
            
            // Try to guess the animation row
            const row = Math.floor(config.startY / config.frameHeight);
            
            output.animations = {
                "sample_animation": {
                    "row": row,
                    "frames": config.frameCount
                }
            };
        } else {
             // Fallback if no image loaded
            output.frames = this.frames;
        }

        this.jsonOutput.value = JSON.stringify(output, null, 2);
    }

    exportSpriteSheet() {
        if (!this.image || this.frames.length === 0) return;

        const config = this.getConfig();
        const exportCanvas = document.createElement('canvas');
        
        // Create a horizontal strip for simplicity
        exportCanvas.width = config.globalWidth * this.frames.length;
        exportCanvas.height = config.globalHeight;
        
        const ctx = exportCanvas.getContext('2d');

        this.frames.forEach((frame, i) => {
            const destX = (i * config.globalWidth) + (config.globalWidth / 2) - frame.anchor.x;
            const destY = (config.globalHeight / 2) - frame.anchor.y;

            ctx.drawImage(
                this.image,
                frame.x, frame.y, frame.w, frame.h,
                destX, destY, frame.w, frame.h
            );
        });

        if (this.bgRemoveEnabled.checked) {
            // Process the entire export canvas at once
            const imageData = ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
            BackgroundRemover.process(
                imageData, 
                this.bgKeyColor.value, 
                parseInt(this.bgThreshold.value)
            );
            BackgroundRemover.erode(
                imageData,
                parseInt(this.bgErode.value)
            );
            ctx.putImageData(imageData, 0, 0);
        }

        // Download Image
        const link = document.createElement('a');
        link.download = 'aligned_spritesheet.png';
        link.href = exportCanvas.toDataURL('image/png');
        link.click();

        // Download JSON
        const exportJSON = {
            sourceFilename: this.sourceFilename,
            frameWidth: config.globalWidth,
            frameHeight: config.globalHeight,
            columns: this.frames.length,
            rows: 1,
            animations: {
                "animation": {
                    "row": 0,
                    "frames": this.frames.length
                }
            }
        };

        const jsonLink = document.createElement('a');
        jsonLink.download = 'aligned_spritesheet.json';
        const blob = new Blob([JSON.stringify(exportJSON, null, 2)], {type: 'application/json'});
        jsonLink.href = URL.createObjectURL(blob);
        jsonLink.click();
    }

    saveProject() {
        const state = this.getProjectState();
        const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'});
        const link = document.createElement('a');
        link.download = 'frame-tool-project.json';
        link.href = URL.createObjectURL(blob);
        link.click();
    }

    handleLoadProject(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const state = JSON.parse(e.target.result);
                this.loadProjectState(state);
            } catch (err) {
                console.error('Failed to load project:', err);
                alert('Invalid project file');
            }
        };
        reader.readAsText(file);
    }

    animate(timestamp) {
        if (this.image && this.frames.length > 0) {
            const config = this.getConfig();
            const interval = 1000 / config.fps;

            if (timestamp - this.lastFrameTime > interval) {
                this.currentFrameIndex = (this.currentFrameIndex + 1) % this.frames.length;
                this.lastFrameTime = timestamp;
                
                this.renderPreview();
            }
        }

        requestAnimationFrame((t) => this.animate(t));
    }

    renderPreview() {
        const frame = this.frames[this.currentFrameIndex];
        if (!frame) return;

        const config = this.getConfig();

        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        
        // Calculate position to center the anchor point in the global frame
        const destX = (config.globalWidth / 2) - frame.anchor.x;
        const destY = (config.globalHeight / 2) - frame.anchor.y;

        // Draw helper lines (center of global frame)
        this.previewCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.previewCtx.beginPath();
        this.previewCtx.moveTo(config.globalWidth / 2, 0);
        this.previewCtx.lineTo(config.globalWidth / 2, config.globalHeight);
        this.previewCtx.moveTo(0, config.globalHeight / 2);
        this.previewCtx.lineTo(config.globalWidth, config.globalHeight / 2);
        this.previewCtx.stroke();
        
        // We need to draw from the original image using the frame coordinates
        this.previewCtx.drawImage(
            this.image,
            frame.x, frame.y, frame.w, frame.h,
            destX, destY, frame.w, frame.h
        );

        if (this.bgRemoveEnabled.checked) {
            // Get image data for the drawn frame
            // Note: We capture the whole canvas or just the region?
            // Capturing just the region is safer to avoid processing helper lines if they were under it,
            // but helper lines are drawn BEFORE image (actually they are drawn before, but since stroke() is called... wait)
            // The helper lines are drawn BEFORE drawImage. So drawImage is on top.
            // If we process background removal, transparency will reveal the helper lines underneath!
            // That is actually desirable for preview.
            
            const imageData = this.previewCtx.getImageData(destX, destY, frame.w, frame.h);
            BackgroundRemover.process(
                imageData, 
                this.bgKeyColor.value, 
                parseInt(this.bgThreshold.value)
            );
            BackgroundRemover.erode(
                imageData,
                parseInt(this.bgErode.value)
            );
            this.previewCtx.putImageData(imageData, destX, destY);
        }

        // Draw frame counter
        this.previewCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.previewCtx.fillRect(0, 0, 20, 15);
        this.previewCtx.fillStyle = 'white';
        this.previewCtx.font = '10px sans-serif';
        this.previewCtx.fillText(this.currentFrameIndex, 2, 11);
    }
}