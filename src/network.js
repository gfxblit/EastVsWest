/**
 * Network Manager
 * Handles multiplayer communication via Supabase
 */
import { supabase } from './supabase.js';

export class Network {
  constructor() {
    this.isHost = false;
    this.joinCode = null;
    this.connected = false;
  }

  async hostGame() {
    this.isHost = true;
    const { data, error } = await supabase
      .from('games')
      .insert([{}])
      .select();

    if (error) {
      console.error('Error hosting game:', error);
      return null;
    }

    this.joinCode = data[0].join_code;
    return this.joinCode;
  }

  async joinGame(joinCode) {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('join_code', joinCode)
      .single();

    if (error || !data) {
      console.error('Error joining game:', error);
      return false;
    }

    this.isHost = false;
    this.joinCode = joinCode;
    this.connected = true;
    return true;
  }

  sendGameState(state) {
    // Will send game state to Supabase
    console.log('Network: Send game state (not yet implemented)');
  }

  onGameStateUpdate(callback) {
    // Will listen for game state updates from Supabase
    console.log('Network: Listen for game state updates (not yet implemented)');
  }

  disconnect() {
    // Will disconnect from Supabase
    console.log('Network: Disconnect (not yet implemented)');
    this.connected = false;
  }
}
