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

    const { data: playerRecord, error: playerError } = await this.supabase
      .from('session_players')
      .insert({
        session_id: sessionData.id,
        player_id: this.playerId,
        player_name: playerName,
        is_host: true,
      })
      .select()
      .single();
    
    if (playerError) throw playerError;

    this.isHost = true;
    this.joinCode = newJoinCode;
    await this._subscribeToChannel(channelName);

    return { session: sessionData, player: playerRecord };
  }

  async joinGame(joinCode, playerName) {
    if (!this.supabase) throw new Error('Supabase client not initialized.');
    if (!this.playerId) throw new Error('Player ID not set.');

    const { data: sessionData, error: sessionError } = await this.supabase
      .rpc('get_session_by_join_code', { p_join_code: joinCode });

    if (sessionError) throw sessionError;
    if (!sessionData || sessionData.length === 0) throw new Error('Session not found');

    const session = sessionData[0];
    if (session.status !== 'lobby') throw new Error('Session is not joinable.');
    if (session.current_player_count >= session.max_players) throw new Error('Session is full.');

    await this._subscribeToChannel(session.realtime_channel_name);

    const joinRequest = {
      type: 'player_join_request',
      from: this.playerId,
      timestamp: Date.now(),
      data: { playerName },
    };

    await this.channel.send({
      type: 'broadcast',
      event: 'message',
      payload: joinRequest,
    });

    return new Promise((resolve, reject) => {
      let timeout;

      const onPlayerJoined = (payload) => {
        if (payload.data.player.player_id === this.playerId) {
          clearTimeout(timeout);
          this.off('player_joined', onPlayerJoined); // Clean up listener
          this.isHost = false;
          this.joinCode = joinCode;
          this.connected = true;
          resolve(payload.data);
        }
      };

      timeout = setTimeout(() => {
        this.off('player_joined', onPlayerJoined); // Clean up listener on timeout
        reject(new Error('Join request timed out.'));
      }, 10000); // 10 second timeout

      this.on('player_joined', onPlayerJoined);
    });
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

    return new Promise((resolve) => {
      this.channel
        .on('broadcast', { event: 'message' }, ({ payload }) => {
          this._handleRealtimeMessage(payload);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.connected = true;
            resolve();
          }
        });
    });
  }

  _handleRealtimeMessage(payload) {
    this.emit(payload.type, payload);

    if (this.isHost && payload.type === 'player_join_request') {
      this._handlePlayerJoinRequest(payload);
    }

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

  async _handlePlayerJoinRequest(payload) {
    const { playerName } = payload.data;
    const joiningPlayerId = payload.from;

    // 1. Get session
    const { data: session } = await this.supabase
      .from('game_sessions')
      .select('*')
      .eq('join_code', this.joinCode)
      .single();
    
    // TODO: Add validation (session full, etc.)

    // 2. Add player to DB
    const { data: newPlayer, error } = await this.supabase
      .from('session_players')
      .insert({
        session_id: session.id,
        player_id: joiningPlayerId,
        player_name: playerName,
        is_host: false,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Host: Error adding player to DB:', error);
      // TODO: Send rejection message
      return;
    }

    // 3. Get all players in session
    const { data: players } = await this.supabase
      .from('session_players')
      .select('*')
      .eq('session_id', session.id);

    // 4. Broadcast `player_joined`
    const broadcastPayload = {
      type: 'player_joined',
      from: this.playerId,
      timestamp: Date.now(),
      data: {
        player: newPlayer,
        allPlayers: players,
        session: session,
      },
    };

    await this.channel.send({
      type: 'broadcast',
      event: 'message',
      payload: broadcastPayload,
    });
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