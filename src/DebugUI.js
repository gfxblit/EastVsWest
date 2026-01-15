import { CONFIG } from './config.js';

export class DebugUI {
  constructor() {
    this.container = null;
    this.weaponSelect = null;
    this.selectedWeaponKey = null;
    this.isMinimized = false;
    this.contentContainer = null;
    this.minimizeBtn = null;
    
    this.init();
  }

  init() {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'debug-ui-overlay';
    this.container.classList.add('hidden');

    // Create Header
    const header = document.createElement('div');
    header.id = 'debug-header';

    // Create Title
    const title = document.createElement('h3');
    title.innerText = 'Weapon Config Debugger';
    header.appendChild(title);

    // Create Minimize Button
    this.minimizeBtn = document.createElement('button');
    this.minimizeBtn.id = 'debug-minimize-btn';
    this.minimizeBtn.innerText = '-';
    this.minimizeBtn.addEventListener('click', () => this.toggleMinimize());
    header.appendChild(this.minimizeBtn);

    this.container.appendChild(header);

    // Create Content Container (collapsible part)
    this.contentContainer = document.createElement('div');
    this.contentContainer.id = 'debug-content';
    this.container.appendChild(this.contentContainer);

    // Create Weapon Selector
    const selectLabel = document.createElement('label');
    selectLabel.innerText = 'Select Weapon: ';
    this.contentContainer.appendChild(selectLabel);

    this.weaponSelect = document.createElement('select');
    this.weaponSelect.id = 'debug-weapon-select';
    
    // Populate select
    Object.keys(CONFIG.WEAPONS).forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.innerText = CONFIG.WEAPONS[key].name || key;
      this.weaponSelect.appendChild(option);
    });

    this.weaponSelect.addEventListener('change', (e) => this.handleWeaponSelect(e.target.value));
    this.contentContainer.appendChild(this.weaponSelect);

    // Create Form Container
    this.formContainer = document.createElement('div');
    this.contentContainer.appendChild(this.formContainer);

    // Create Export Button
    const exportBtn = document.createElement('button');
    exportBtn.id = 'debug-export-btn';
    exportBtn.innerText = 'Export to Clipboard';
    exportBtn.addEventListener('click', () => this.exportConfig());
    this.contentContainer.appendChild(exportBtn);

    document.body.appendChild(this.container);
    
    // Select first weapon by default if available
    const firstKey = Object.keys(CONFIG.WEAPONS)[0];
    if (firstKey) {
        this.handleWeaponSelect(firstKey);
    }
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    if (this.isMinimized) {
        this.contentContainer.classList.add('hidden');
        this.minimizeBtn.innerText = '+';
    } else {
        this.contentContainer.classList.remove('hidden');
        this.minimizeBtn.innerText = '-';
    }
  }

  toggle() {
    this.container.classList.toggle('hidden');
  }

  handleWeaponSelect(key) {
    this.selectedWeaponKey = key;
    this.renderForm();
  }

  renderForm() {
    this.formContainer.innerHTML = '';
    if (!this.selectedWeaponKey) return;

    const weapon = CONFIG.WEAPONS[this.selectedWeaponKey];
    
    // Fields to edit
    const fields = [
        { key: 'baseDamage', type: 'number' },
        { key: 'range', type: 'number' },
        { key: 'attackSpeed', type: 'number', step: 0.1 },
        { key: 'vfxType', type: 'select', options: ['slash', 'thrust', 'blunt'] },
        { key: 'damageType', type: 'select', options: ['slashing', 'piercing', 'blunt'] }
    ];

    fields.forEach(field => {
        const wrapper = document.createElement('div');
        wrapper.className = 'debug-field';
        
        const label = document.createElement('label');
        label.innerText = field.key + ': ';
        wrapper.appendChild(label);

        let input;
        if (field.type === 'select') {
            input = document.createElement('select');
            field.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.innerText = opt;
                input.appendChild(option);
            });
            input.value = weapon[field.key];
        } else {
            input = document.createElement('input');
            input.type = field.type;
            input.id = `debug-${field.key}`;
            input.value = weapon[field.key];
            if (field.step) input.step = field.step;
        }

        input.addEventListener('input', (e) => {
            const val = field.type === 'number' ? parseFloat(e.target.value) : e.target.value;
            this.updateConfig(field.key, val);
        });
        // Also listen for change for selects
        if (field.type === 'select') {
             input.addEventListener('change', (e) => {
                this.updateConfig(field.key, e.target.value);
            });
        }

        wrapper.appendChild(input);
        this.formContainer.appendChild(wrapper);
    });
  }

  updateConfig(field, value) {
    if (this.selectedWeaponKey && CONFIG.WEAPONS[this.selectedWeaponKey]) {
        CONFIG.WEAPONS[this.selectedWeaponKey][field] = value;
    }
  }

  exportConfig() {
    const exportString = `export const WEAPONS = ${JSON.stringify(CONFIG.WEAPONS, null, 2)};`;
    
    // Attempt to write to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(exportString)
            .then(() => console.log('Config exported to clipboard!'))
            .catch(err => console.error('Failed to export config:', err));
    } else {
        console.log(exportString);
    }
  }
}