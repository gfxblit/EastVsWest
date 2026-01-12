/**
 * UI Manager
 * Handles UI updates and screen transitions
 */

import { CONFIG } from './config.js';

export class UI {
  constructor() {
    this.screens = {
      intro: null,
      lobby: null,
      game: null,
      gameOver: null,
    };
  }

  init() {
    this.screens.intro = document.getElementById('intro-screen');
    this.screens.lobby = document.getElementById('lobby-screen');
    this.screens.game = document.getElementById('game-screen');
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
    const joinCodeElement = document.getElementById('join-code');
    if (joinCodeElement) {
      joinCodeElement.textContent = code;
    }
  }

  updatePlayerList(players, isHost) {
    this.renderPlayerList(players);
    this.updateStartButton(players, isHost);
  }

  renderPlayerList(players) {
    const playerList = document.getElementById('player-list');
    if (!playerList) return;

    playerList.innerHTML = '';
    players.forEach(player => {
      const li = document.createElement('li');
      li.textContent = player.player_name + (player.is_host ? ' (Host)' : '');
      playerList.appendChild(li);
    });
  }

  updateStartButton(players, isHost) {
    const startBtn = document.getElementById('start-game-btn');
    const waitingMsg = document.getElementById('waiting-msg');
    const botFillMsg = document.getElementById('bot-fill-msg');

    if (!startBtn || !waitingMsg) return;

    if (isHost) {
      startBtn.classList.remove('hidden');
      waitingMsg.classList.add('hidden');
      
      // Update button text with bot count
      const minPlayers = CONFIG.GAME.MIN_PLAYERS || 4;
      if (players.length < minPlayers) {
        const botsNeeded = minPlayers - players.length;
        startBtn.textContent = `Start Game (+${botsNeeded} Bots)`;
        if (botFillMsg) botFillMsg.classList.remove('hidden');
      } else {
        startBtn.textContent = 'Start Game';
        if (botFillMsg) botFillMsg.classList.add('hidden');
      }
    } else {
      startBtn.classList.add('hidden');
      waitingMsg.classList.remove('hidden');
      if (botFillMsg) botFillMsg.classList.add('hidden');
    }
  }

  showLobby(title = 'Game Lobby', summary = null) {
    const titleElement = document.getElementById('lobby-title');
    const summaryContainer = document.getElementById('match-summary-container');
    const summaryContent = document.getElementById('match-summary');

    if (titleElement) titleElement.textContent = title;

    if (summaryContainer && summaryContent) {
      if (summary) {
        summaryContent.innerHTML = summary;
        summaryContainer.classList.remove('hidden');
      } else {
        summaryContainer.classList.add('hidden');
      }
    }

    this.showScreen('lobby');
  }

  showSpectatorControls(isSpectating, name = '') {
    const controls = document.getElementById('spectator-controls');
    const nameSpan = document.getElementById('spectating-name');

    if (controls) {
      if (isSpectating) {
        controls.classList.remove('hidden');
        if (nameSpan) nameSpan.textContent = name;
      } else {
        controls.classList.add('hidden');
      }
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

    // Clear existing content
    equipmentDisplay.innerHTML = '';

    // Add weapon slot if weapon exists
    if (weapon) {
      const weaponSlot = document.createElement('div');
      weaponSlot.className = 'equipment-slot weapon-slot';
      
      if (weapon.icon) {
        const icon = document.createElement('img');
        const baseUrl = CONFIG.ASSETS.BASE_URL;
        const weaponsBaseUrl = CONFIG.ASSETS.WEAPONS_BASE_URL;
        const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        icon.src = `${normalizedBase}${weaponsBaseUrl}${weapon.icon}`;
        icon.className = 'weapon-icon';
        icon.alt = weapon.name;
        weaponSlot.appendChild(icon);
      }

      const nameSpan = document.createElement('span');
      nameSpan.textContent = `Weapon: ${weapon.name}`;
      weaponSlot.appendChild(nameSpan);
      
      equipmentDisplay.appendChild(weaponSlot);
    }

    // Add armor slot if armor exists
    if (armor) {
      const armorSlot = document.createElement('div');
      armorSlot.className = 'equipment-slot';
      armorSlot.textContent = `Armor: ${armor.name}`;
      equipmentDisplay.appendChild(armorSlot);
    }
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

  updateActionButtons(weapon) {
    const attackBtn = document.getElementById('attack-button');
    const abilityBtn = document.getElementById('ability-button');
    
    // Disable if no weapon or if weapon is 'fist' (if that's the desired logic, 
    // but the issue says "if no weapon is equipped". 
    // Assuming 'fist' is the default "no weapon" state in some contexts, 
    // but typically "no weapon equipped" means null.
    // However, looking at CONFIG, 'FIST' is a weapon.
    // The issue says: "if no weapon is equipped the attack/special buttons should be disabled"
    // I will interpret this as weapon == null. 
    // Wait, LocalPlayerController initializes with null weapon if not provided?
    // Let's check LocalPlayerController again. 
    // It says: weapon: data?.equipped_weapon || null.
    // So null means no weapon.
    
    const disabled = !weapon;

    if (attackBtn) attackBtn.disabled = disabled;
    if (abilityBtn) abilityBtn.disabled = disabled;
  }

  updateCooldowns(attackPct, abilityPct) {
    const attackOverlay = document.querySelector('#attack-button .cooldown-overlay');
    const abilityOverlay = document.querySelector('#ability-button .cooldown-overlay');

    if (attackOverlay) {
      attackOverlay.style.height = `${attackPct * 100}%`;
    }
    
    if (abilityOverlay) {
      abilityOverlay.style.height = `${abilityPct * 100}%`;
    }
  }
}
