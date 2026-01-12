
import { BotController } from './BotController.js';

export class HostBotManager {
  constructor(network, playersSnapshot, game) {
    this.network = network;
    this.playersSnapshot = playersSnapshot;
    this.game = game;
    this.botControllers = new Map();
    
    this.#setupListeners();
  }

  #setupListeners() {
    this.network.on('postgres_changes', (payload) => {
      if (payload.table === 'session_players' && payload.eventType === 'INSERT') {
        const newPlayer = payload.new;
        if (newPlayer.is_bot) {
          this.addBot(newPlayer.player_id);
        }
      }
    });
  }

  initExistingBots() {
    if (!this.playersSnapshot) return;
    
    this.playersSnapshot.getPlayers().forEach(player => {
      if (player.is_bot) {
        this.addBot(player.player_id);
      }
    });
  }

  addBot(botId) {
    if (!this.botControllers.has(botId)) {
      console.log(`Initializing controller for bot ${botId}`);
      this.botControllers.set(
        botId, 
        new BotController(botId, this.network, this.playersSnapshot, this.game)
      );
    }
  }

  update(deltaTime) {
    if (this.botControllers.size === 0) return;

    this.botControllers.forEach((controller, botId) => {
      // Reconcile with snapshot
      if (!this.playersSnapshot.getPlayers().has(botId)) {
        this.botControllers.delete(botId);
        return;
      }
      controller.update(deltaTime);
    });
  }
}
