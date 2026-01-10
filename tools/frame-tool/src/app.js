import { FrameCalculator } from './FrameCalculator.js';

class App {
    constructor() {
        this.calculator = new FrameCalculator();
        this.image = null;
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
        this.exportBtn = document.getElementById('exportBtn');
        this.mainCanvas = document.getElementById('mainCanvas');
        this.previewCanvas = document.getElementById('previewCanvas');
        this.jsonOutput = document.getElementById('jsonOutput');
        this.dropZone = document.getElementById('dropZone');

        this.ctx = this.mainCanvas.getContext('2d');
        this.previewCtx = this.previewCanvas.getContext('2d');
        
        this.anchorOverrides = {}; // Map frame index to {x, y}

        this.init();
    }

    init() {
        // Event Listeners
        this.imageInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
        
        Object.values(this.inputs).forEach(input => {
            input.addEventListener('input', () => this.update());
        });

        this.exportBtn.addEventListener('click', () => this.exportSpriteSheet());

        this.mainCanvas.addEventListener('mousedown', (e) => this.handleCanvasClick(e));

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

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.image = img;
                this.mainCanvas.width = img.width;
                this.mainCanvas.height = img.height;
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

    update() {
        const config = this.getConfig();
        this.frames = this.calculator.calculateFrames(config);
        
        // Apply overrides
        this.frames.forEach((frame, index) => {
            if (this.anchorOverrides[index]) {
                frame.anchor = { ...this.anchorOverrides[index] };
            }
        });

        this.renderMain();
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
            
            // Draw frame number
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
            this.ctx.fillRect(frame.x, frame.y, 20, 15);
            this.ctx.fillStyle = 'black';
            this.ctx.font = '10px sans-serif';
            this.ctx.fillText(index, frame.x + 2, frame.y + 11);

            // Draw anchor point
            const anchorX = frame.x + frame.anchor.x;
            const anchorY = frame.y + frame.anchor.y;

            this.ctx.strokeStyle = '#ff0000';
            this.ctx.beginPath();
            this.ctx.moveTo(anchorX - 5, anchorY);
            this.ctx.lineTo(anchorX + 5, anchorY);
            this.ctx.moveTo(anchorX, anchorY - 5);
            this.ctx.lineTo(anchorX, anchorY + 5);
            this.ctx.stroke();
        });
    }

    updateJSON(config) {
        // Construct a JSON object compatible with the project's spritesheet format
        let output = {
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

        // Download Image
        const link = document.createElement('a');
        link.download = 'aligned_spritesheet.png';
        link.href = exportCanvas.toDataURL('image/png');
        link.click();

        // Download JSON
        const exportJSON = {
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

        // Draw frame counter
        this.previewCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.previewCtx.fillRect(0, 0, 20, 15);
        this.previewCtx.fillStyle = 'white';
        this.previewCtx.font = '10px sans-serif';
        this.previewCtx.fillText(this.currentFrameIndex, 2, 11);
    }
}

new App();
