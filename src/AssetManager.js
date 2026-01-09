import { CONFIG } from './config.js';

export class AssetManager {
  constructor() {
    this.images = new Map();
    this.spriteSheet = null;
    this.spriteSheetMetadata = null;
  }

  createImage(filename) {
    if (this.images.has(filename)) {
        return this.images.get(filename);
    }

    const img = new Image();
    const baseUrl = CONFIG.ASSETS.BASE_URL;
    // Ensure baseUrl ends with /
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    img.onerror = (e) => {
      console.error(`Failed to load image: ${filename}`, img.src, e);
    };
    img.src = `${normalizedBase}${filename}`;

    this.images.set(filename, img);
    return img;
  }

  async loadSpriteSheet() {
    const baseUrl = CONFIG.ASSETS.BASE_URL;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    try {
      // Load metadata
      const metadataPath = `${normalizedBase}${CONFIG.ASSETS.SPRITE_SHEET.METADATA}`;
      const response = await fetch(metadataPath);

      if (!response.ok) {
        throw new Error(`Failed to load sprite sheet metadata: ${response.statusText}`);
      }

      this.spriteSheetMetadata = await response.json();

      // Load sprite sheet image
      this.spriteSheet = this.createImage(CONFIG.ASSETS.SPRITE_SHEET.PATH);

      // Wait for image to load
      await new Promise((resolve, reject) => {
        if (this.spriteSheet.complete) resolve();
        this.spriteSheet.onload = resolve;
        this.spriteSheet.onerror = reject;
      });

      return true;
    } catch (error) {
      console.warn('Failed to load sprite sheet:', error.message);
      this.spriteSheet = null;
      this.spriteSheetMetadata = null;
      return false;
    }
  }

  getSpriteSheet() {
    return this.spriteSheet;
  }

  getSpriteSheetMetadata() {
    return this.spriteSheetMetadata;
  }

  getImage(filename) {
      return this.images.get(filename);
  }
}
