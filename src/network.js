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
    this.channel = null;
    this.positionBuffer = new Map(); // Stores position updates by player_id
    this.playerPositions = new Map(); // Stores last known positions for validation
    this.broadcastInterval = null;
    this.positionWriteInterval = null; // Interval for periodic DB writes
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
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
             reject(new Error(`Failed to subscribe to channel: ${status} ${error ? error.message : ''}`));
          }
        });
    });
  }

  _handleRealtimeMessage(payload) {
    this.emit(payload.type, payload);

    if (this.isHost && payload.type === 'position_update') {
      if (this._isValidPositionUpdate(payload)) {
        // Store position update in buffer for batching
        this.positionBuffer.set(payload.from, payload.data);
        this.playerPositions.set(payload.from, payload.data.position);
      } else {
        console.warn(`Host: Received invalid position update from ${payload.from}`, payload.data);
      }
    }
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

  _isValidPositionUpdate(payload) {
    const { from, data } = payload;
    const { position, rotation, velocity } = data;

    // 1. Type and structure validation
    if (
      typeof position?.x !== 'number' ||
      typeof position?.y !== 'number' ||
      typeof rotation !== 'number' ||
      typeof velocity?.x !== 'number' ||
      typeof velocity?.y !== 'number'
    ) {
      return false;
    }

    // 2. Bounds checking
    if (
      position.x < 0 || position.x > CONFIG.CANVAS.WIDTH ||
      position.y < 0 || position.y > CONFIG.CANVAS.HEIGHT
    ) {
      return false;
    }

    // 3. Anti-teleport check
    const lastPosition = this.playerPositions.get(from);
    if (lastPosition) {
      const distance = Math.sqrt(
        Math.pow(position.x - lastPosition.x, 2) +
        Math.pow(position.y - lastPosition.y, 2)
      );

      // Allow for some buffer, e.g., 2x the normal movement distance in one interval
      const maxDistance = (CONFIG.PLAYER.BASE_MOVEMENT_SPEED / CONFIG.NETWORK.POSITION_UPDATE_RATE) * 2;
      if (distance > maxDistance) {
        console.warn(`Host: Received invalid position update from ${from}`, payload.data);
        return false; // Position changed too much
      }
    }

    return true;
  }

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

  sendPositionUpdate(positionData) {
    if (!this.channel || !this.connected) {
      console.warn('Cannot send message, channel not connected.');
      return;
    }
    const message = {
      type: 'position_update',
      from: this.playerId,
      timestamp: Date.now(),
      data: positionData,
    };

    // If host, add own position to buffer immediately since Supabase
    // Realtime doesn't echo messages back to the sender
    if (this.isHost) {
      this.positionBuffer.set(this.playerId, positionData);
    }

    this.channel.send({
      type: 'broadcast',
      event: 'message',
      payload: message,
    });
  }

  broadcastPositionUpdates() {
    if (!this.isHost) return;
    if (this.positionBuffer.size === 0) return;
    if (!this.channel || !this.connected) return;

    const updates = Array.from(this.positionBuffer.entries()).map(([player_id, data]) => ({
      player_id,
      ...data,
    }));

    const message = {
      type: 'position_broadcast',
      from: this.playerId,
      timestamp: Date.now(),
      data: { updates },
    };

    this.channel.send({
      type: 'broadcast',
      event: 'message',
      payload: message,
    });

    // Clear the buffer after broadcasting
    this.positionBuffer.clear();
  }

  startPositionBroadcasting() {
    if (!this.isHost || this.broadcastInterval) return;

    this.broadcastInterval = setInterval(() => {
      this.broadcastPositionUpdates();
    }, CONFIG.NETWORK.POSITION_UPDATE_INTERVAL_MS);
  }

  stopPositionBroadcasting() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  async writePositionToDB(position, rotation, health) {
    if (!this.supabase || !this.sessionId || !this.playerId) {
      console.error('Cannot write position to DB: missing supabase, sessionId, or playerId');
      return;
    }

    const { error } = await this.supabase
      .from('session_players')
      .update({
        position_x: position.x,
        position_y: position.y,
        rotation: rotation,
        health: health,
      })
      .eq('session_id', this.sessionId)
      .eq('player_id', this.playerId);

    if (error) {
      console.error('Failed to write position to DB:', error.message);
    }
  }

  startPeriodicPositionWrite(positionGetter, rotationGetter, healthGetter) {
    if (this.positionWriteInterval) return; // Already running

    // Write immediately
    const position = typeof positionGetter === 'function' ? positionGetter() : positionGetter;
    const rotation = typeof rotationGetter === 'function' ? rotationGetter() : rotationGetter;
    const health = typeof healthGetter === 'function' ? healthGetter() : healthGetter;
    this.writePositionToDB(position, rotation, health).catch(err => {
      console.error('Failed to perform immediate position write:', err);
    });

    // Then write periodically at the same rate as snapshot refresh (60 seconds)
    this.positionWriteInterval = setInterval(() => {
      const position = typeof positionGetter === 'function' ? positionGetter() : positionGetter;
      const rotation = typeof rotationGetter === 'function' ? rotationGetter() : rotationGetter;
      const health = typeof healthGetter === 'function' ? healthGetter() : healthGetter;
      this.writePositionToDB(position, rotation, health).catch(err => {
        console.error('Failed to perform periodic position write:', err);
      });
    }, 60000); // 60 seconds
  }

  stopPeriodicPositionWrite() {
    if (this.positionWriteInterval) {
      clearInterval(this.positionWriteInterval);
      this.positionWriteInterval = null;
    }
  }

  disconnect() {
    this.stopPositionBroadcasting();
    this.stopPeriodicPositionWrite();
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