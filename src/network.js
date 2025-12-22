/**
 * Network Manager
 * Handles multiplayer communication via Supabase
 */

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

    console.log('Network: Attempting to host game with code:', newJoinCode);

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
    this._subscribeToChannel(channelName);

    console.log('Game session created and subscribed to channel:', channelName);
    return { session: sessionData, player: playerRecord };
  }

  async joinGame(joinCode, playerName) {
    if (!this.supabase) throw new Error('Supabase client not initialized.');
    if (!this.playerId) throw new Error('Player ID not set.');

    console.log('Network: Attempting to join game with code:', joinCode);

    const { data: sessionData, error: sessionError } = await this.supabase
      .rpc('get_session_by_join_code', { p_join_code: joinCode });

    if (sessionError) throw sessionError;
    if (!sessionData || sessionData.length === 0) throw new Error('Session not found');

    const session = sessionData[0];
    if (session.status !== 'lobby') throw new Error('Session is not joinable.');
    if (session.current_player_count >= session.max_players) throw new Error('Session is full.');

    this._subscribeToChannel(session.realtime_channel_name);

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
      const timeout = setTimeout(() => {
        reject(new Error('Join request timed out.'));
      }, 10000); // 10 second timeout

      this.on('player_joined', (payload) => {
        if (payload.data.player.player_id === this.playerId) {
          clearTimeout(timeout);
          this.isHost = false;
          this.joinCode = joinCode;
          this.connected = true;
          console.log('Successfully joined game:', payload.data);
          resolve(payload.data);
        }
      });
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

    this.channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        this._handleRealtimeMessage(payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to channel:', channelName);
          this.connected = true;
        }
      });
  }

  _handleRealtimeMessage(payload) {
    console.log('Received message:', payload);
    this.emit(payload.type, payload);

    if (this.isHost && payload.type === 'player_join_request') {
      this._handlePlayerJoinRequest(payload);
    }
  }

  async _handlePlayerJoinRequest(payload) {
    const { playerName } = payload.data;
    const joiningPlayerId = payload.from;

    console.log(`Host: Received join request from ${playerName} (${joiningPlayerId})`);

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

    console.log('Host: Broadcasted player_joined event');
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

  disconnect() {
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.connected = false;
    console.log('Network: Disconnected');
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