
import { jest } from '@jest/globals';
import { CONFIG } from './config.js';

// Mock clipboard API
const mockWriteText = jest.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

// Mock console.log
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

describe('DebugUI', () => {
  let DebugUI;
  let debugUI;
  let container;
  let CONFIG;

  beforeEach(async () => {
    jest.resetModules(); // Reset modules to ensure fresh CONFIG import if needed
    
    // Clear document body
    document.body.innerHTML = '';
    
    // Import CONFIG dynamically to match the context of DebugUI
    const configModule = await import('./config.js');
    CONFIG = configModule.CONFIG;

    // Import DebugUI dynamically to ensure clean state if it has static init
    const module = await import('./DebugUI.js');
    DebugUI = module.DebugUI;

    debugUI = new DebugUI();
    container = document.getElementById('debug-ui-overlay');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should not be visible on initialization', () => {
    expect(container).not.toBeNull();
    // Initially handled by CSS, so inline style should be empty
    expect(container.style.display).toBe('');
  });

  test('toggle() should show and hide the overlay', () => {
    debugUI.toggle();
    expect(container.style.display).toBe('block');
    
    debugUI.toggle();
    expect(container.style.display).toBe('none');
  });

  test('should populate weapon selector with CONFIG.WEAPONS', () => {
    const selector = container.querySelector('#debug-weapon-select');
    expect(selector).not.toBeNull();
    
    const options = Array.from(selector.options).map(opt => opt.value);
    const configWeapons = Object.keys(CONFIG.WEAPONS);
    
    expect(options).toEqual(expect.arrayContaining(configWeapons));
  });

  test('should update inputs when a weapon is selected', () => {
    const selector = container.querySelector('#debug-weapon-select');
    const weaponKey = Object.keys(CONFIG.WEAPONS)[0];
    const weaponData = CONFIG.WEAPONS[weaponKey];

    // Simulate selection
    selector.value = weaponKey;
    selector.dispatchEvent(new Event('change'));

    const damageInput = container.querySelector('#debug-baseDamage');
    const rangeInput = container.querySelector('#debug-range');
    
    expect(parseInt(damageInput.value)).toBe(weaponData.baseDamage);
    expect(parseInt(rangeInput.value)).toBe(weaponData.range);
  });

  test('should update CONFIG.WEAPONS when inputs change', () => {
    const selector = container.querySelector('#debug-weapon-select');
    const weaponKey = Object.keys(CONFIG.WEAPONS)[0];
    
    // Select first weapon
    selector.value = weaponKey;
    selector.dispatchEvent(new Event('change'));

    // Change damage
    const damageInput = container.querySelector('#debug-baseDamage');
    const newDamage = 999;
    damageInput.value = newDamage;
    damageInput.dispatchEvent(new Event('input'));

    expect(CONFIG.WEAPONS[weaponKey].baseDamage).toBe(newDamage);
  });

  test('export button should copy config to clipboard', async () => {
    const exportBtn = container.querySelector('#debug-export-btn');
    expect(exportBtn).not.toBeNull();
    
    await exportBtn.click();
    
    expect(mockWriteText).toHaveBeenCalled();
    const copiedText = mockWriteText.mock.calls[0][0];
    expect(copiedText).toContain('export const WEAPONS = {');
    expect(copiedText).toContain('baseDamage'); // Should contain some content
  });
});
