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
        };
        this.mainCanvas = document.getElementById('mainCanvas');
        this.previewCanvas = document.getElementById('previewCanvas');
        this.jsonOutput = document.getElementById('jsonOutput');
        this.dropZone = document.getElementById('dropZone');

        this.ctx = this.mainCanvas.getContext('2d');
        this.previewCtx = this.previewCanvas.getContext('2d');

        this.init();
    }

    init() {
        // Event Listeners
        this.imageInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
        
        Object.values(this.inputs).forEach(input => {
            input.addEventListener('input', () => this.update());
        });

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
            fps: parseInt(this.inputs.fps.value) || 10
        };
    }

    update() {
        const config = this.getConfig();
        this.frames = this.calculator.calculateFrames(config);
        
        this.renderMain();
        this.updateJSON(config);
        
        // Resize preview canvas
        this.previewCanvas.width = config.frameWidth;
        this.previewCanvas.height = config.frameHeight;
    }

    renderMain() {
        this.ctx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        
        if (this.image) {
            this.ctx.drawImage(this.image, 0, 0);
        }

        // Draw overlays
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1;
        
        this.frames.forEach((frame, index) => {
            this.ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
            
            // Draw frame number
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
            this.ctx.fillRect(frame.x, frame.y, 20, 15);
            this.ctx.fillStyle = 'black';
            this.ctx.font = '10px sans-serif';
            this.ctx.fillText(index, frame.x + 2, frame.y + 11);
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

        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        
        // We need to draw from the original image using the frame coordinates
        this.previewCtx.drawImage(
            this.image,
            frame.x, frame.y, frame.w, frame.h,
            0, 0, this.previewCanvas.width, this.previewCanvas.height
        );
    }
}

new App();
