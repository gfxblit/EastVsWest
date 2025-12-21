/**
 * Network Manager
 * Handles multiplayer communication via Supabase
 */

export class Network {
  constructor() {
    this.isHost = false;
    this.joinCode = null;
    this.connected = false;
    this.supabase = null;
    this.hostId = null;
  }

  initialize(supabaseClient, hostId) {
    this.supabase = supabaseClient;
    this.hostId = hostId;

  }

  async hostGame() {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized. Call initialize() first.');
    }
    if (!this.hostId) {
      throw new Error('Host ID not set. Call initialize() with a host ID.');
    }

    // Generate a new join code
    const newJoinCode = this.generateJoinCode();

    console.log('Network: Attempting to host game with code:', newJoinCode, 'by host:', this.hostId);

    try {
      const { data, error } = await this.supabase
        .from('game_sessions')
        .insert([{ join_code: newJoinCode, host_id: this.hostId }])
        .select()
        .single();

      if (error || !data) { // Added !data check here
        console.error('Error creating game session:', error?.message || 'No data returned.');
        throw error || new Error('Failed to create session: No data returned.'); // Throw appropriate error
      }

      console.log('Game session created:', data);
      this.isHost = true;
      this.joinCode = data.join_code; // Use the join_code returned from the DB
      return this.joinCode;

    } catch (err) {
      console.error('Failed to host game:', err.message);
      throw err;
    }
  }

  async joinGame(joinCode, playerName) {
    // Validate prerequisites
    if (!this.supabase) {
      throw new Error('Supabase client not initialized. Call initialize() first.');
    }
    if (!this.hostId) {
      throw new Error('Player ID not set. Call initialize() with a player ID.');
    }

    console.log('Network: Attempting to join game with code:', joinCode, 'player:', playerName);

    try {
      // Step 1: Look up the session by join code
      const { data: session, error: sessionError } = await this.supabase
        .from('game_sessions')
        .select('*')
        .eq('join_code', joinCode)
        .single();

      // Step 2: Validate session exists
      if (sessionError || !session) {
        console.error('Error finding session:', sessionError?.message || 'Session not found');
        throw sessionError || new Error('Session not found');
      }

      console.log('Found session:', session);

      // Step 3: Validate session is joinable
      if (session.status !== 'lobby') {
        throw new Error('Session is not joinable. Only sessions in lobby status can be joined.');
      }

      if (session.current_player_count >= session.max_players) {
        throw new Error('Session is full. Maximum players reached.');
      }

      // Step 4: Add player to session_players table
      const { data: playerRecord, error: playerError } = await this.supabase
        .from('session_players')
        .insert([{
          session_id: session.id,
          player_id: this.hostId, // Using hostId as playerId
          player_name: playerName,
          is_host: false,
          is_connected: true,
        }])
        .select()
        .single();

      if (playerError || !playerRecord) {
        console.error('Error adding player to session:', playerError?.message || 'No data returned');
        throw playerError || new Error('Failed to join session: Could not add player.');
      }

      console.log('Player added to session:', playerRecord);

      // Step 5: Update network state
      this.isHost = false;
      this.joinCode = joinCode;
      this.connected = true;

      return session;

    } catch (err) {
      console.error('Failed to join game:', err.message);
      throw err;
    }
  }

  sendGameState(state) {
    // Placeholder: Will send game state to Supabase
    console.log('Network: Send game state (not yet implemented)');
  }

  onGameStateUpdate(callback) {
    // Placeholder: Will listen for game state updates from Supabase
    console.log('Network: Listen for game state updates (not yet implemented)');
  }

  disconnect() {
    // Placeholder: Will disconnect from Supabase
    console.log('Network: Disconnect (not yet implemented)');
    this.connected = false;
  }

  generateJoinCode() {
    // Generate a random 6-character join code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
