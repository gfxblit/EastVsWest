/**
 * Network Manager
 * Handles multiplayer communication via Supabase
 */

import { CONFIG } from './config.js';
import { SessionManager } from './SessionManager.js';

class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(eventName, listener) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(listener);
  }

  off(eventName, listenerToRemove) {
    if (!this.events[eventName]) return;

    this.events[eventName] = this.events[eventName].filter(
      listener => listener !== listenerToRemove,
    );
  }

  emit(eventName, ...args) {
    if (this.events[eventName]) {
      this.events[eventName].forEach(listener => listener(...args));
    }
  }
}

export class Network extends EventEmitter {
  constructor() {
    super();
    this.isHost = false;
    this.joinCode = null;
    this.connected = false;
    this.supabase = null;
    this.playerId = null;
    this.sessionId = null;
    this.hostId = null; // Track host ID for authorization checks
    this.channel = null;
    this.playerStateWriteInterval = null; // Interval for generic periodic DB writes
    this.sessionManager = null;
  }

  initialize(supabaseClient, playerId) {
    this.supabase = supabaseClient;
    this.playerId = playerId;
    this.sessionManager = new SessionManager(this.supabase, this);
  }

  async hostGame(playerName) {
    return this.sessionManager.hostGame(playerName);
  }

  async joinGame(joinCode, playerName) {
    return this.sessionManager.joinGame(joinCode, playerName);
  }

  async startGame() {
    if (!this.isHost) throw new Error('Only the host can start the game.');
    return this.sessionManager.startGame();
  }

  _subscribeToChannel(channelName) {
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
    }

    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: {
          ack: true,
        },
      },
    });

    return new Promise((resolve, reject) => {
      this.channel
        .on('broadcast', { event: 'message' }, ({ payload }) => {
          this._handleRealtimeMessage(payload);
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'session_players',
          // Don't use filter parameter - manually filter in handler to ensure DELETE events work
          // See SessionPlayersSnapshot.js for detailed explanation
        }, (payload) => {
          // Manually filter events by session_id to ensure DELETE events are received
          const sessionId = payload.new?.session_id || payload.old?.session_id;
          if (sessionId && sessionId !== this.sessionId) {
            return; // Ignore events for other sessions
          }
          this._handlePostgresChange(payload);
        })
        .subscribe((status, error) => {
          if (status === 'SUBSCRIBED') {
            this.connected = true;
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            reject(new Error(`Failed to subscribe to channel: ${status} ${error ? error.message : ''}`));
          }
        });
    });
  }

  _handleRealtimeMessage(payload) {
    // Emit all messages for listeners (like SessionPlayersSnapshot)
    this.emit(payload.type, payload);
  }

  _handlePostgresChange(payload) {
    // Emit generic postgres_changes event for any table
    // Higher-level components (like SessionPlayersSnapshot) will filter and handle these
    this.emit('postgres_changes', payload);
  }

  async _enforceMaxPlayers() {
    return this.sessionManager.enforceMaxPlayers();
  }

  // FUTURE: Host-authoritative health persistence (not yet implemented)
  send(type, data) {
    return this.sendFrom(this.playerId, type, data);
  }

  /**
   * Send a message as a specific player (host-only utility for bots)
   */
  sendFrom(fromId, type, data) {
    if (!this.channel || !this.connected) {
      console.warn('Cannot send message, channel not connected.');
      return;
    }
    const message = {
      type,
      from: fromId,
      timestamp: Date.now(),
      data,
    };
    this.channel.send({
      type: 'broadcast',
      event: 'message',
      payload: message,
    });

    // Emit locally since Supabase Realtime doesn't echo messages back to sender
    this.emit(type, message);
  }

  /**
   * Generic Player State Update System
   * Supports both client-authoritative (position, velocity) and host-authoritative (health, equipment) data
   */

  /**
   * Broadcast player state update(s) to all clients
   * @param {Object|Array} updates - Single update object or array of updates
   *   Each update can contain any combination of:
   *   - Client-auth: player_id, position_x, position_y, rotation, velocity_x, velocity_y
   *   - Host-auth: health, equipped_weapon, equipped_armor
   */
  broadcastPlayerStateUpdate(updates) {
    if (!this.channel || !this.connected) {
      console.warn('Cannot send message, channel not connected.');
      return;
    }

    const message = {
      type: 'player_state_update',
      from: this.playerId,
      timestamp: Date.now(),
      data: updates,
    };

    // Broadcast to all other clients
    this.channel.send({
      type: 'broadcast',
      event: 'message',
      payload: message,
    });

    // Emit locally since Supabase Realtime doesn't echo messages back to sender
    this.emit('player_state_update', message);
  }

  /**
   * Write player state to database
   * @param {string|Array} playerIdOrUpdates - Player ID (for single update) or array of updates (for batch)
   * @param {Object} stateData - State data to write (only used for single update)
   */
  async writePlayerStateToDB(playerIdOrUpdates, stateData) {
    if (!this.supabase || !this.sessionId) {
      console.error('Cannot write player state to DB: missing supabase or sessionId');
      return;
    }

    // Handle batch updates
    if (Array.isArray(playerIdOrUpdates)) {
      const batchUpdates = playerIdOrUpdates;
      // Process each update in the batch
      await Promise.all(
        batchUpdates.map(update => {
          const { player_id, ...updateData } = update;
          return this.writePlayerStateToDB(player_id, updateData);
        }),
      );
      return;
    }

    // Handle single update
    const playerId = playerIdOrUpdates;
    const { error } = await this.supabase
      .from('session_players')
      .update(stateData)
      .eq('session_id', this.sessionId)
      .eq('player_id', playerId);

    if (error) {
      console.error('Failed to write player state to DB:', error.message);
    }
  }

  /**
   * Start periodic player state writes to database
   * @param {Function|Object|Array} stateGetter - Function that returns state data, or state data itself
   *   Can return single update object or array of updates (for batching)
   * @param {number} intervalMs - Write interval in milliseconds (default: 60000 / 60 seconds)
   */
  startPeriodicPlayerStateWrite(stateGetter, intervalMs = 60000) {
    if (this.playerStateWriteInterval) return; // Already running

    const performWrite = () => {
      const stateData = typeof stateGetter === 'function' ? stateGetter() : stateGetter;

      // Handle batch updates (array)
      if (Array.isArray(stateData)) {
        this.writePlayerStateToDB(stateData).catch(err => {
          console.error('Failed to perform batched player state write:', err);
        });
      } else {
        // Handle single update
        const { player_id, ...updateData } = stateData;
        this.writePlayerStateToDB(player_id, updateData).catch(err => {
          console.error('Failed to perform player state write:', err);
        });
      }
    };

    // Write immediately
    performWrite();

    // Then write periodically
    this.playerStateWriteInterval = setInterval(performWrite, intervalMs);
  }

  /**
   * Stop periodic player state writes
   */
  stopPeriodicPlayerStateWrite() {
    if (this.playerStateWriteInterval) {
      clearInterval(this.playerStateWriteInterval);
      this.playerStateWriteInterval = null;
    }
  }

  /**
   * Leave the current game session and clean up database records
   */
  async leaveGame() {
    return this.sessionManager.leaveGame();
  }

  disconnect() {
    this.stopPeriodicPlayerStateWrite();
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.connected = false;
  }
}