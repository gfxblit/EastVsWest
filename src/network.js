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
    this.players = new Map();
    this.channel = null;
    this.positionBuffer = new Map(); // Stores position updates by player_id
    this.playerPositions = new Map(); // Stores last known positions for validation
    this.broadcastInterval = null;
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
    if (session.current_player_count >= session.max_players) throw new Error('Session is full.');

    this.sessionId = session.id;
    this.isHost = false;
    this.joinCode = joinCode;

    // 2. Client-authoritative join: Self-insert into session_players FIRST
    // This ensures RLS policies allow us to read/listen to other players in this session
    const { data: playerRecord, error: insertError } = await this.supabase
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
        throw new Error('You are already in this session.');
      }
      throw insertError;
    }

    // 3. Subscribe to channel and postgres changes
    await this._subscribeToChannel(session.realtime_channel_name);

    // 4. Fetch initial snapshot of players
    const { data: allPlayers, error: playersError } = await this.supabase
      .from('session_players')
      .select('*')
      .eq('session_id', this.sessionId);
    
    if (playersError) throw playersError;

    // Initialize local players map
    this.players.clear();
    allPlayers.forEach(p => this.players.set(p.player_id, p));

    this.connected = true;

    return { 
      session, 
      player: playerRecord, 
      allPlayers: Array.from(this.players.values()) 
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
          filter: `session_id=eq.${this.sessionId}` 
        }, (payload) => {
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
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    if (eventType === 'INSERT') {
      this.players.set(newRecord.player_id, newRecord);
      this.emit('player_joined', {
        type: 'player_joined',
        data: {
          player: newRecord,
          allPlayers: Array.from(this.players.values())
        }
      });

      if (this.isHost) {
        this._enforceMaxPlayers();
      }
    } else if (eventType === 'DELETE') {
      const deletedPlayerId = oldRecord.player_id;
      this.players.delete(deletedPlayerId);
      
      this.emit('player_left', {
        type: 'player_left',
        data: {
          player_id: deletedPlayerId,
          allPlayers: Array.from(this.players.values())
        }
      });

      if (deletedPlayerId === this.playerId) {
        this.emit('evicted', { reason: 'Session full or host evicted you' });
        this.disconnect();
      }
    } else if (eventType === 'UPDATE') {
      this.players.set(newRecord.player_id, newRecord);
      this.emit('player_updated', {
        type: 'player_updated',
        data: {
          player: newRecord,
          allPlayers: Array.from(this.players.values())
        }
      });
    }
  }

  async _enforceMaxPlayers() {
    if (!this.isHost || !this.sessionId) return;

    // Get current players sorted by join time
    const players = Array.from(this.players.values()).sort((a, b) => 
      new Date(a.joined_at) - new Date(b.joined_at)
    );

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

  disconnect() {
    this.stopPositionBroadcasting();
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