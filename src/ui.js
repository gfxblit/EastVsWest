/**
 * UI manager for SnakeClaude
 * Handles updating UI elements like score
 */

export class UI {
  constructor() {
    this.scoreElement = document.getElementById('score');
  }

  updateScore(score) {
    if (this.scoreElement) {
      this.scoreElement.textContent = `Score: ${score}`;
    }
  }
}
