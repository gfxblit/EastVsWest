/**
 * UI Manager Tests
 * Unit tests for ui.js following TDD workflow
 */

import { jest } from '@jest/globals';
import { UI } from './ui.js';

describe('UI', () => {
  let ui;

  beforeEach(() => {
    // Set up DOM elements
    document.body.innerHTML = `
      <div id="intro-screen" class="screen"></div>
      <div id="lobby-screen" class="screen"></div>
      <div id="game-screen" class="screen"></div>
      <div id="lobby-title"></div>
      <div id="match-summary-container" class="hidden">
        <div id="match-summary"></div>
      </div>
      <div id="join-code"></div>
      <ul id="player-list"></ul>
      <button id="start-game-btn" class="hidden"></button>
      <p id="waiting-msg"></p>
      <div id="health-bar" style="width: 100%;"></div>
      <div id="equipment-display"></div>
      <div id="zone-warning" class="hidden"></div>
      <div id="spectator-controls" class="hidden">
        <span id="spectating-name"></span>
      </div>
      <button id="attack-button" class="touch-btn attack-btn">
        <div class="cooldown-overlay"></div>
      </button>
      <button id="ability-button" class="touch-btn ability-btn">
        <div class="cooldown-overlay"></div>
      </button>
    `;

    ui = new UI();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Constructor', () => {
    test('WhenConstructed_ShouldInitializeScreensObject', () => {
      expect(ui.screens).toBeDefined();
      expect(ui.screens.intro).toBeNull();
      expect(ui.screens.lobby).toBeNull();
      expect(ui.screens.game).toBeNull();
    });
  });

  describe('init', () => {
    test('WhenInitialized_ShouldFindAllScreenElements', () => {
      ui.init();

      expect(ui.screens.intro).toBe(document.getElementById('intro-screen'));
      expect(ui.screens.lobby).toBe(document.getElementById('lobby-screen'));
      expect(ui.screens.game).toBe(document.getElementById('game-screen'));
    });
  });

  describe('showScreen', () => {
    beforeEach(() => {
      ui.init();
    });

    test('WhenShowingIntroScreen_ShouldAddActiveClass', () => {
      ui.showScreen('intro');
      expect(ui.screens.intro.classList.contains('active')).toBe(true);
    });

    test('WhenShowingLobbyScreen_ShouldAddActiveClass', () => {
      ui.showScreen('lobby');
      expect(ui.screens.lobby.classList.contains('active')).toBe(true);
    });

    test('WhenShowingGameScreen_ShouldAddActiveClass', () => {
      ui.showScreen('game');
      expect(ui.screens.game.classList.contains('active')).toBe(true);
    });

    test('WhenShowingNewScreen_ShouldHideOtherScreens', () => {
      ui.screens.intro.classList.add('active');
      ui.screens.game.classList.add('active');

      ui.showScreen('lobby');

      expect(ui.screens.intro.classList.contains('active')).toBe(false);
      expect(ui.screens.game.classList.contains('active')).toBe(false);
      expect(ui.screens.lobby.classList.contains('active')).toBe(true);
    });
  });

  describe('showJoinCode', () => {
    test('WhenJoinCodeProvided_ShouldDisplayCode', () => {
      ui.showJoinCode('ABC123');

      const joinCodeElement = document.getElementById('join-code');
      expect(joinCodeElement.textContent).toBe('ABC123');
    });
  });

  describe('updatePlayerList', () => {
    test('WhenPlayersProvided_ShouldUpdateList', () => {
      const players = [
        { player_name: 'Player 1', is_host: true },
        { player_name: 'Player 2', is_host: false }
      ];
      ui.updatePlayerList(players, true);

      const playerList = document.getElementById('player-list');
      expect(playerList.children.length).toBe(2);
      expect(playerList.children[0].textContent).toContain('Player 1 (Host)');
    });

    test('WhenIsHost_ShouldShowStartButton', () => {
      ui.updatePlayerList([], true);

      const startBtn = document.getElementById('start-game-btn');
      const waitingMsg = document.getElementById('waiting-msg');
      expect(startBtn.classList.contains('hidden')).toBe(false);
      expect(waitingMsg.classList.contains('hidden')).toBe(true);
    });

    test('WhenIsNotHost_ShouldShowWaitingMessage', () => {
      ui.updatePlayerList([], false);

      const startBtn = document.getElementById('start-game-btn');
      const waitingMsg = document.getElementById('waiting-msg');
      expect(startBtn.classList.contains('hidden')).toBe(true);
      expect(waitingMsg.classList.contains('hidden')).toBe(false);
    });
  });

  describe('showLobby', () => {
    beforeEach(() => {
      ui.init();
    });

    test('WhenCalled_ShouldSetTitle', () => {
      ui.showLobby('New Title');
      expect(document.getElementById('lobby-title').textContent).toBe('New Title');
    });

    test('WhenSummaryProvided_ShouldShowSummary', () => {
      ui.showLobby('Lobby', 'Match summary');
      expect(document.getElementById('match-summary-container').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('match-summary').textContent).toBe('Match summary');
    });

    test('WhenNoSummary_ShouldHideSummary', () => {
      document.getElementById('match-summary-container').classList.remove('hidden');
      ui.showLobby('Lobby', null);
      expect(document.getElementById('match-summary-container').classList.contains('hidden')).toBe(true);
    });
  });

  describe('showSpectatorControls', () => {
    test('WhenSpectating_ShouldShowControlsAndName', () => {
      ui.showSpectatorControls(true, 'TestPlayer');
      expect(document.getElementById('spectator-controls').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('spectating-name').textContent).toBe('TestPlayer');
    });

    test('WhenNotSpectating_ShouldHideControls', () => {
      document.getElementById('spectator-controls').classList.remove('hidden');
      ui.showSpectatorControls(false);
      expect(document.getElementById('spectator-controls').classList.contains('hidden')).toBe(true);
    });
  });

  describe('updateHealth', () => {
    test('WhenHealthIs100_ShouldSetWidthTo100Percent', () => {
      ui.updateHealth(100);

      const healthBar = document.getElementById('health-bar');
      expect(healthBar.style.width).toBe('100%');
    });

    test('WhenHealthIs50_ShouldSetWidthTo50Percent', () => {
      ui.updateHealth(50);

      const healthBar = document.getElementById('health-bar');
      expect(healthBar.style.width).toBe('50%');
    });

    test('WhenHealthIs0_ShouldSetWidthTo0Percent', () => {
      ui.updateHealth(0);

      const healthBar = document.getElementById('health-bar');
      expect(healthBar.style.width).toBe('0%');
    });

    test('WhenHealthBarNotFound_ShouldNotThrowError', () => {
      document.body.innerHTML = '';
      expect(() => ui.updateHealth(50)).not.toThrow();
    });
  });

  describe('updateEquipment', () => {
    test('WhenWeaponProvided_ShouldDisplayWeaponName', () => {
      const weapon = { name: 'Spear' };
      ui.updateEquipment(weapon, null);

      const equipmentDisplay = document.getElementById('equipment-display');
      const slots = equipmentDisplay.querySelectorAll('.equipment-slot');

      expect(slots.length).toBe(1);
      expect(slots[0].textContent).toBe('Weapon: Spear');
    });

    test('WhenArmorProvided_ShouldDisplayArmorName', () => {
      const armor = { name: 'Plated Armor' };
      ui.updateEquipment(null, armor);

      const equipmentDisplay = document.getElementById('equipment-display');
      const slots = equipmentDisplay.querySelectorAll('.equipment-slot');

      expect(slots.length).toBe(1);
      expect(slots[0].textContent).toBe('Armor: Plated Armor');
    });

    test('WhenBothProvided_ShouldDisplayBoth', () => {
      const weapon = { name: 'Spear' };
      const armor = { name: 'Plated Armor' };
      ui.updateEquipment(weapon, armor);

      const equipmentDisplay = document.getElementById('equipment-display');
      const slots = equipmentDisplay.querySelectorAll('.equipment-slot');

      expect(slots.length).toBe(2);
    });

    test('WhenNeitherProvided_ShouldDisplayEmpty', () => {
      ui.updateEquipment(null, null);

      const equipmentDisplay = document.getElementById('equipment-display');
      expect(equipmentDisplay.children.length).toBe(0);
    });

    test('WhenEquipmentDisplayNotFound_ShouldNotThrowError', () => {
      document.body.innerHTML = '';
      const weapon = { name: 'Spear' };
      expect(() => ui.updateEquipment(weapon, null)).not.toThrow();
    });

    test('WhenWeaponNameContainsHTML_ShouldNotExecuteScript', () => {
      const weapon = { name: '<img src=x onerror=alert(1)>' };
      ui.updateEquipment(weapon, null);

      const equipmentDisplay = document.getElementById('equipment-display');
      const slots = equipmentDisplay.querySelectorAll('.equipment-slot');

      // Should be text content, not executed HTML
      expect(slots[0].textContent).toContain('<img');
      // Should not have actual img element
      expect(equipmentDisplay.querySelector('img')).toBeNull();
    });

    test('should update equipment display with weapon name', () => {
      const weapon = { name: 'Super Sword' };
      ui.updateEquipment(weapon, null);
      
      const equipmentDisplay = document.getElementById('equipment-display');
      expect(equipmentDisplay.innerHTML).toContain('Weapon: Super Sword');
    });

    test('WhenWeaponHasIcon_ShouldUseConfigToBuildUrl', () => {
      const weapon = { name: 'Spear', icon: 'spear.png' };
      ui.updateEquipment(weapon, null);

      const equipmentDisplay = document.getElementById('equipment-display');
      const img = equipmentDisplay.querySelector('.weapon-icon');
      expect(img).not.toBeNull();
      expect(img.src).toContain('assets/weapons/spear.png');
    });
  });

  describe('showZoneWarning', () => {
    test('WhenShowIsTrue_ShouldRemoveHiddenClass', () => {
      ui.showZoneWarning(true);

      const zoneWarning = document.getElementById('zone-warning');
      expect(zoneWarning.classList.contains('hidden')).toBe(false);
    });

    test('WhenShowIsFalse_ShouldAddHiddenClass', () => {
      const zoneWarning = document.getElementById('zone-warning');
      zoneWarning.classList.remove('hidden');

      ui.showZoneWarning(false);

      expect(zoneWarning.classList.contains('hidden')).toBe(true);
    });

    test('WhenZoneWarningNotFound_ShouldNotThrowError', () => {
      document.body.innerHTML = '';
      expect(() => ui.showZoneWarning(true)).not.toThrow();
    });
  });

  describe('updateActionButtons', () => {
    let attackBtn, abilityBtn;

    beforeEach(() => {
      attackBtn = document.getElementById('attack-button');
      abilityBtn = document.getElementById('ability-button');
    });

    test('WhenWeaponProvided_ShouldEnableButtons', () => {
      ui.updateActionButtons({ id: 'spear' });
      expect(attackBtn.disabled).toBe(false);
      expect(abilityBtn.disabled).toBe(false);
    });

    test('WhenNoWeaponProvided_ShouldDisableButtons', () => {
      ui.updateActionButtons(null);
      expect(attackBtn.disabled).toBe(true);
      expect(abilityBtn.disabled).toBe(true);
    });
  });

  describe('updateCooldowns', () => {
    let attackOverlay, abilityOverlay;

    beforeEach(() => {
        // Need to manually add overlay elements to DOM mock for this test
        const attackBtn = document.getElementById('attack-button');
        const abilityBtn = document.getElementById('ability-button');
        
        // Ensure overlays exist
        if (!attackBtn.querySelector('.cooldown-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'cooldown-overlay';
            attackBtn.appendChild(overlay);
        }
        if (!abilityBtn.querySelector('.cooldown-overlay')) {
             const overlay = document.createElement('div');
             overlay.className = 'cooldown-overlay';
             abilityBtn.appendChild(overlay);
        }

        attackOverlay = document.querySelector('#attack-button .cooldown-overlay');
        abilityOverlay = document.querySelector('#ability-button .cooldown-overlay');
    });

    test('WhenCooldownActive_ShouldUpdateOverlayHeight', () => {
      ui.updateCooldowns(0.5, 0.2);
      expect(attackOverlay.style.height).toBe('50%');
      expect(abilityOverlay.style.height).toBe('20%');
    });

    test('WhenCooldownComplete_ShouldResetOverlay', () => {
      ui.updateCooldowns(0, 0);
      expect(attackOverlay.style.height).toBe('0%');
      expect(abilityOverlay.style.height).toBe('0%');
    });
  });
});