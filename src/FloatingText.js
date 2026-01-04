export class FloatingText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.lifeTime = 1.0; // 1 second
    this.opacity = 1.0;
    // Randomize velocity to prevent stacking
    // Horizontal drift: -20 to +20 pixels/sec
    this.vx = (Math.random() - 0.5) * 40;
    // Vertical speed: 40 to 80 pixels/sec (varied speed helps separation)
    this.vy = 40 + Math.random() * 40;
  }

  update(deltaTime) {
    this.lifeTime -= deltaTime;
    this.x += this.vx * deltaTime;
    this.y -= this.vy * deltaTime;
    this.opacity = Math.max(0, this.lifeTime);
  }

  isExpired() {
    return this.lifeTime <= 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    
    // Draw text with black outline for readability
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'black';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillText(this.text, this.x, this.y);
    
    ctx.restore();
  }
}
