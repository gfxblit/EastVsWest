import { CONFIG } from './config.js';

export class AssetManager {
  constructor() {
    this.images = new Map();
    this._spriteSheets = new Map();
    this._spriteSheetMetadata = new Map();
  }

  // Backward compatibility for walk sprite sheet
  get spriteSheet() {
    return this._spriteSheets.get('walk');
  }

  set spriteSheet(value) {
    this._spriteSheets.set('walk', value);
  }

  get spriteSheetMetadata() {
    return this._spriteSheetMetadata.get('walk');
  }

  set spriteSheetMetadata(value) {
    this._spriteSheetMetadata.set('walk', value);
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

  async loadSpriteSheet(name = 'walk', metadataPath = null, imagePath = null) {
    const baseUrl = CONFIG.ASSETS.BASE_URL;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    // Default paths if not provided
    const metaPath = metadataPath || CONFIG.ASSETS.SPRITE_SHEET.METADATA;
    const imgPath = imagePath || CONFIG.ASSETS.SPRITE_SHEET.PATH;

    try {
      // Load metadata
      const fullMetadataPath = `${normalizedBase}${metaPath}`;
      const response = await fetch(fullMetadataPath);

      if (!response.ok) {
        throw new Error(`Failed to load sprite sheet metadata: ${response.statusText}`);
      }

      const metadata = await response.json();
      this._spriteSheetMetadata.set(name, metadata);

      // Load sprite sheet image
      const spriteSheet = this.createImage(imgPath);
      this._spriteSheets.set(name, spriteSheet);

      // Wait for image to load
      await new Promise((resolve, reject) => {
        if (spriteSheet.complete) resolve();
        spriteSheet.onload = resolve;
        spriteSheet.onerror = reject;
      });

      return true;
    } catch (error) {
      console.warn(`Failed to load sprite sheet ${name}:`, error.message);
      return false;
    }
  }

  getSpriteSheet(name = 'walk') {
    return this._spriteSheets.get(name);
  }

  getSpriteSheetMetadata(name = 'walk') {
    return this._spriteSheetMetadata.get(name);
  }

  getImage(filename) {
      return this.images.get(filename);
  }
}