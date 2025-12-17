/**
 * UI Manager Tests
 * Unit tests for ui.js following TDD workflow
 */

import { UI } from './ui.js';

describe('UI', () => {
  let ui;

  beforeEach(() => {
    // Set up DOM elements
    document.body.innerHTML = `
      <div id="lobby-screen" class="screen"></div>
      <div id="game-screen" class="screen"></div>
      <div id="game-over-screen" class="screen"></div>
      <div id="join-code-display" class="hidden">
        <span id="join-code"></span>
      </div>
      <div id="health-bar" style="width: 100%;"></div>
      <div id="equipment-display"></div>
      <div id="zone-warning" class="hidden"></div>
      <div id="game-result"></div>
      <div id="match-summary"></div>
    `;

    ui = new UI();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Constructor', () => {
    test('WhenConstructed_ShouldInitializeScreensObject', () => {
      expect(ui.screens).toBeDefined();
      expect(ui.screens.lobby).toBeNull();
      expect(ui.screens.game).toBeNull();
      expect(ui.screens.gameOver).toBeNull();
    });
  });

  describe('init', () => {
    test('WhenInitialized_ShouldFindAllScreenElements', () => {
      ui.init();

      expect(ui.screens.lobby).toBe(document.getElementById('lobby-screen'));
      expect(ui.screens.game).toBe(document.getElementById('game-screen'));
      expect(ui.screens.gameOver).toBe(document.getElementById('game-over-screen'));
    });
  });

  describe('showScreen', () => {
    beforeEach(() => {
      ui.init();
    });

    test('WhenShowingLobbyScreen_ShouldAddActiveClass', () => {
      ui.showScreen('lobby');
      expect(ui.screens.lobby.classList.contains('active')).toBe(true);
    });

    test('WhenShowingGameScreen_ShouldAddActiveClass', () => {
      ui.showScreen('game');
      expect(ui.screens.game.classList.contains('active')).toBe(true);
    });

    test('WhenShowingGameOverScreen_ShouldAddActiveClass', () => {
      ui.showScreen('gameOver');
      expect(ui.screens.gameOver.classList.contains('active')).toBe(true);
    });

    test('WhenShowingNewScreen_ShouldHideOtherScreens', () => {
      ui.screens.lobby.classList.add('active');
      ui.screens.game.classList.add('active');

      ui.showScreen('gameOver');

      expect(ui.screens.lobby.classList.contains('active')).toBe(false);
      expect(ui.screens.game.classList.contains('active')).toBe(false);
      expect(ui.screens.gameOver.classList.contains('active')).toBe(true);
    });

    test('WhenInvalidScreenName_ShouldNotThrowError', () => {
      expect(() => ui.showScreen('invalid')).not.toThrow();
    });
  });

  describe('showJoinCode', () => {
    test('WhenJoinCodeProvided_ShouldDisplayCode', () => {
      ui.showJoinCode('ABC123');

      const joinCodeElement = document.getElementById('join-code');
      expect(joinCodeElement.textContent).toBe('ABC123');
    });

    test('WhenJoinCodeProvided_ShouldRemoveHiddenClass', () => {
      ui.showJoinCode('ABC123');

      const joinCodeDisplay = document.getElementById('join-code-display');
      expect(joinCodeDisplay.classList.contains('hidden')).toBe(false);
    });

    test('WhenElementsNotFound_ShouldNotThrowError', () => {
      document.body.innerHTML = '';
      expect(() => ui.showJoinCode('ABC123')).not.toThrow();
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

    test('WhenArmorNameContainsHTML_ShouldNotExecuteScript', () => {
      const armor = { name: '<script>alert("XSS")</script>' };
      ui.updateEquipment(null, armor);

      const equipmentDisplay = document.getElementById('equipment-display');
      const slots = equipmentDisplay.querySelectorAll('.equipment-slot');

      // Should be text content, not executed HTML
      expect(slots[0].textContent).toContain('<script>');
      // Should not have actual script element
      expect(equipmentDisplay.querySelector('script')).toBeNull();
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

  describe('showGameOver', () => {
    beforeEach(() => {
      ui.init();
    });

    test('WhenCalled_ShouldSetGameResult', () => {
      ui.showGameOver('Victory!', 'You won the match');

      const gameResult = document.getElementById('game-result');
      expect(gameResult.textContent).toBe('Victory!');
    });

    test('WhenCalled_ShouldSetMatchSummary', () => {
      const summary = '<p>Kills: 5</p>';
      ui.showGameOver('Victory!', summary);

      const matchSummary = document.getElementById('match-summary');
      expect(matchSummary.children.length).toBeGreaterThan(0);
    });

    test('WhenCalled_ShouldShowGameOverScreen', () => {
      ui.showGameOver('Victory!', 'Summary');

      expect(ui.screens.gameOver.classList.contains('active')).toBe(true);
    });

    test('WhenResultElementNotFound_ShouldNotThrowError', () => {
      document.getElementById('game-result').remove();
      expect(() => ui.showGameOver('Victory!', 'Summary')).not.toThrow();
    });

    test('WhenSummaryElementNotFound_ShouldNotThrowError', () => {
      document.getElementById('match-summary').remove();
      expect(() => ui.showGameOver('Victory!', 'Summary')).not.toThrow();
    });

    test('WhenSummaryContainsHTML_ShouldRenderHTML', () => {
      const summary = '<p>Kills: <strong>5</strong></p>';
      ui.showGameOver('Victory!', summary);

      const matchSummary = document.getElementById('match-summary');
      expect(matchSummary.querySelector('strong')).not.toBeNull();
      expect(matchSummary.querySelector('strong').textContent).toBe('5');
    });
  });
});
