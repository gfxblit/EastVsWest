import { jest } from '@jest/globals';
import { AssetManager } from './AssetManager.js';
import { CONFIG } from './config.js';

describe('AssetManager', () => {
  let assetManager;
  let originalImage;
  let mockImageInstances = [];

  beforeEach(() => {
    assetManager = new AssetManager();
    mockImageInstances = [];
    
    // Setup test config
    CONFIG.ASSETS.BASE_URL = 'http://localhost/assets/';
    
    // Mock Image
    originalImage = global.Image;
    global.Image = class {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.src = '';
        mockImageInstances.push(this);
      }
    };
  });

  afterEach(() => {
    global.Image = originalImage;
  });

  // Helper to simulate image loading
  const loadAllImages = () => {
    mockImageInstances.forEach(img => {
      if (img.onload) img.onload();
    });
  };

  test('preloadAssets should load all images in the manifest', async () => {
    const manifest = [
      { key: 'img1.png', src: 'img1.png', type: 'image' },
      { key: 'img2.png', src: 'img2.png', type: 'image' },
    ];

    const loadPromise = assetManager.preloadAssets(manifest);
    
    // Simulate loading
    loadAllImages();
    
    await loadPromise;

    expect(assetManager.getImage('img1.png')).toBeDefined();
    expect(assetManager.getImage('img2.png')).toBeDefined();
  });

  test('preloadAssets should report progress', async () => {
    const manifest = [
      { key: 'img1.png', src: 'img1.png', type: 'image' },
      { key: 'img2.png', src: 'img2.png', type: 'image' },
    ];
    const onProgress = jest.fn();

    const loadPromise = assetManager.preloadAssets(manifest, onProgress);
    
    // Simulate loading one by one
    if (mockImageInstances[0]) mockImageInstances[0].onload();
    // Wait for microtasks
    await new Promise(resolve => setTimeout(resolve, 0));
    
    if (mockImageInstances[1]) mockImageInstances[1].onload();
    
    await loadPromise;

    expect(onProgress).toHaveBeenCalled();
    // Should have been called at least for the final 100%
    expect(onProgress).toHaveBeenLastCalledWith(1.0);
  });
  
  test('preloadAssets should handle image load errors', async () => {
    const manifest = [
      { key: 'bad.png', src: 'bad.png', type: 'image' },
    ];
      
    const loadPromise = assetManager.preloadAssets(manifest);
      
    // Simulate error
    if (mockImageInstances[0]) mockImageInstances[0].onerror(new Error('Failed'));
      
    await loadPromise;
      
    // It should still complete (maybe with a warning, but promise resolves)
    expect(assetManager.getImage('bad.png')).toBeDefined(); // It likely stores the broken image object
  });
});