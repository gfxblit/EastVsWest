/**
 * Network Manager
 * Handles multiplayer communication via Supabase
 */

import { CONFIG } from './config.js';

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
      listener => listener !== listenerToRemove
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
  }

  initialize(supabaseClient, playerId) {
    this.supabase = supabaseClient;
    this.playerId = playerId;
  }

  async hostGame(playerName) {
    if (!this.supabase) throw new Error('Supabase client not initialized.');
    if (!this.playerId) throw new Error('Player ID not set.');

    const newJoinCode = this.generateJoinCode();
    const channelName = `game_session:${newJoinCode}`;

    const { data: sessionData, error: sessionError } = await this.supabase
      .from('game_sessions')
      .insert({
        join_code: newJoinCode,
        host_id: this.playerId,
        realtime_channel_name: channelName,
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    this.sessionId = sessionData.id;
    this.isHost = true;
    this.joinCode = newJoinCode;
    this.hostId = this.playerId; // Track host ID

    // Subscribe to channel and postgres changes
    await this._subscribeToChannel(channelName);

    const { data: playerRecord, error: playerError } = await this.supabase
      .from('session_players')
      .insert({
        session_id: this.sessionId,
        player_id: this.playerId,
        player_name: playerName,
        is_host: true,
      })
      .select()
      .single();
    
    if (playerError) throw playerError;

    // Local player list will be updated via postgres_changes event
    return { session: sessionData, player: playerRecord };
  }

  async joinGame(joinCode, playerName) {
    if (!this.supabase) throw new Error('Supabase client not initialized.');
    if (!this.playerId) throw new Error('Player ID not set.');

    // 1. Get session info via RPC
    const { data: sessionData, error: sessionError } = await this.supabase
      .rpc('get_session_by_join_code', { p_join_code: joinCode });

    if (sessionError) throw sessionError;
    if (!sessionData || sessionData.length === 0) throw new Error('Session not found');

    const session = sessionData[0];
    if (session.status !== 'lobby') throw new Error('Session is not joinable.');

    this.sessionId = session.id;
    this.isHost = false;
    this.joinCode = joinCode;
    this.hostId = session.host_id; // Track host ID for authorization

    // 2. Client-authoritative join: Self-insert into session_players FIRST
    // This ensures RLS policies allow us to read/listen to other players in this session
    let playerRecord;
    
    const { data: newPlayerRecord, error: insertError } = await this.supabase
      .from('session_players')
      .insert({
        session_id: this.sessionId,
        player_id: this.playerId,
        player_name: playerName,
        is_host: false,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') { // Unique constraint violation
        console.log('Player already in session. Reconnecting...');
        // Fetch the existing record
        const { data: existingPlayer, error: fetchError } = await this.supabase
          .from('session_players')
          .select('*')
          .eq('session_id', this.sessionId)
          .eq('player_id', this.playerId)
          .single();
          
        if (fetchError) throw fetchError;
        playerRecord = existingPlayer;
      } else {
        throw insertError;
      }
    } else {
      playerRecord = newPlayerRecord;
    }

    // 3. Subscribe to channel and postgres changes
    await this._subscribeToChannel(session.realtime_channel_name);

    this.connected = true;

    return {
      session,
      player: playerRecord
    };
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
    if (!this.isHost || !this.sessionId) return;

    // Get current players sorted by join time from database
    const { data: players, error: playersError } = await this.supabase
      .from('session_players')
      .select('*')
      .eq('session_id', this.sessionId)
      .order('joined_at', { ascending: true });

    if (playersError) {
      console.error(`Failed to fetch players for max enforcement: ${playersError.message}`);
      return;
    }

    const { data: session } = await this.supabase
      .from('game_sessions')
      .select('max_players')
      .eq('id', this.sessionId)
      .single();

    if (players.length > session.max_players) {
      console.log(`Host: Session full (${players.length}/${session.max_players}). Evicting latest joiners.`);
      const excessPlayers = players.slice(session.max_players);
      for (const p of excessPlayers) {
        await this.supabase
          .from('session_players')
          .delete()
          .eq('id', p.id);
      }
    }
  }

  // FUTURE: Host-authoritative health persistence (not yet implemented)
  send(type, data) {
    if (!this.channel || !this.connected) {
      console.warn('Cannot send message, channel not connected.');
      return;
    }
    const message = {
      type,
      from: this.playerId,
      timestamp: Date.now(),
      data,
    };
    this.channel.send({
      type: 'broadcast',
      event: 'message',
      payload: message,
    });
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
      data: updates, // Can be single object or array
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
        })
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

  disconnect() {
    this.stopPeriodicPlayerStateWrite();
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.connected = false;
  }

  generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}