/**
 * UI Manager
 * Handles UI updates and screen transitions
 */

export class UI {
  constructor() {
    this.screens = {
      lobby: null,
      game: null,
      gameOver: null,
    };
  }

  init() {
    this.screens.lobby = document.getElementById('lobby-screen');
    this.screens.game = document.getElementById('game-screen');
    this.screens.gameOver = document.getElementById('game-over-screen');

    console.log('UI initialized');
  }

  showScreen(screenName) {
    // Hide all screens
    for (const screen of Object.values(this.screens)) {
      if (screen) {
        screen.classList.remove('active');
      }
    }

    // Show requested screen
    const targetScreen = this.screens[screenName];
    if (targetScreen) {
      targetScreen.classList.add('active');
    }
  }

  showJoinCode(code) {
    const joinCodeDisplay = document.getElementById('join-code-display');
    const joinCodeElement = document.getElementById('join-code');

    if (joinCodeDisplay && joinCodeElement) {
      joinCodeElement.textContent = code;
      joinCodeDisplay.classList.remove('hidden');
    }
  }

  updateHealth(health) {
    const healthBar = document.getElementById('health-bar');
    if (healthBar) {
      healthBar.style.width = `${health}%`;
    }
  }

  updateEquipment(weapon, armor) {
    const equipmentDisplay = document.getElementById('equipment-display');
    if (!equipmentDisplay) return;

    let html = '';
    if (weapon) {
      html += `<div class="equipment-slot">Weapon: ${weapon.name}</div>`;
    }
    if (armor) {
      html += `<div class="equipment-slot">Armor: ${armor.name}</div>`;
    }

    equipmentDisplay.innerHTML = html;
  }

  showZoneWarning(show) {
    const zoneWarning = document.getElementById('zone-warning');
    if (zoneWarning) {
      if (show) {
        zoneWarning.classList.remove('hidden');
      } else {
        zoneWarning.classList.add('hidden');
      }
    }
  }

  showGameOver(result, summary) {
    const gameResult = document.getElementById('game-result');
    const matchSummary = document.getElementById('match-summary');

    if (gameResult) {
      gameResult.textContent = result;
    }

    if (matchSummary) {
      matchSummary.innerHTML = summary;
    }

    this.showScreen('gameOver');
  }
}
