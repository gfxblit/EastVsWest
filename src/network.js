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

  async joinGame(joinCode) {
    // Placeholder: Will implement Supabase integration in future phases
    console.log('Network: Join game with code', joinCode);
    this.isHost = false;
    this.joinCode = joinCode;
    this.connected = true;
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
