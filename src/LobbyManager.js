/**
 * Lobby Manager
 * Handles lobby UI updates and state management
 */
import { SessionPlayersSnapshot } from './SessionPlayersSnapshot.js';

export class LobbyManager {
  constructor(network, ui) {
    this.network = network;
    this.ui = ui;
    this.playersSnapshot = null;
    this.lobbyUpdateInterval = null;
  }

  async hostGame() {
    try {
        const playerName = `Host-${Math.random().toString(36).substr(2, 5)}`;
        await this._enterLobby(() => this.network.hostGame(playerName));
    } catch (error) {
        console.error('Failed to host game:', error);
        throw error;
    }
  }

  async joinGame(joinCode) {
    try {
        const playerName = `Player-${Math.random().toString(36).substr(2, 5)}`;
        await this._enterLobby(() => this.network.joinGame(joinCode, playerName));
    } catch (error) {
        console.error('Failed to join game:', error);
        throw error;
    }
  }

  async _enterLobby(networkAction) {
      const { session, player } = await networkAction();

      await this.initializeSnapshot(session.id);

      this.startPolling();
      this.ui.showJoinCode(session.join_code);
      this.ui.showLobby('Game Lobby');
      this.updateUI();
  }

  async initializeSnapshot(sessionId) {
    // Create SessionPlayersSnapshot for lobby synchronization
    this.playersSnapshot = new SessionPlayersSnapshot(this.network, sessionId);
    await this.playersSnapshot.ready();
    console.log('SessionPlayersSnapshot ready');
  }

  startPolling() {
    if (this.lobbyUpdateInterval) return; // Already polling

    this.lobbyUpdateInterval = setInterval(() => {
      this.updateUI();
    }, 1000); // Poll every 1s
    console.log('Lobby polling started');
  }

  stopPolling() {
    if (this.lobbyUpdateInterval) {
      clearInterval(this.lobbyUpdateInterval);
      this.lobbyUpdateInterval = null;
      console.log('Lobby polling stopped');
    }
  }

  updateUI() {
    if (!this.playersSnapshot) return;

    const players = Array.from(this.playersSnapshot.getPlayers().values());
    this.ui.updatePlayerList(players, this.network.isHost);
  }

  async leaveGame() {
    this.stopPolling();

    // Clean up SessionPlayersSnapshot
    if (this.playersSnapshot) {
      this.playersSnapshot.destroy();
      this.playersSnapshot = null;
    }

    if (this.network) {
      await this.network.leaveGame();
    }
  }

  handleHostLeft() {
    this.stopPolling();

    if (this.playersSnapshot) {
      this.playersSnapshot.destroy();
      this.playersSnapshot = null;
    }

    if (this.network) {
      this.network.disconnect();
    }
  }

  getPlayersSnapshot() {
    return this.playersSnapshot;
  }
}
