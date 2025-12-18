/**
 * Game Session API
 * Handles game session management using Supabase REST API
 */

export class GameSessionAPI {
  constructor(supabaseUrl, supabaseKey) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.tableName = 'game_sessions';
    this.baseUrl = `${supabaseUrl}/rest/v1/${this.tableName}`;
  }

  /**
   * Get common headers for Supabase REST API requests
   * @param {boolean} preferReturn - Whether to include Prefer: return=representation header
   * @returns {Object} Headers object
   * @private
   */
  _getHeaders(preferReturn = false) {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`
    };

    if (preferReturn) {
      headers['Prefer'] = 'return=representation';
    }

    return headers;
  }

  /**
   * Handle fetch response and errors
   * @param {Response} response - Fetch response object
   * @param {string} operation - Operation name for error messages
   * @returns {Promise<Array>} Parsed JSON response
   * @private
   */
  async _handleResponse(response, operation) {
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to ${operation}: ${JSON.stringify(error)}`);
    }
    return await response.json();
  }

  /**
   * Create a new game session
   * @param {string} hostId - UUID of the host player
   * @param {string} joinCode - 6-character join code
   * @returns {Promise<Object>} Created session object
   */
  async createGameSession(hostId, joinCode) {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this._getHeaders(true),
      body: JSON.stringify({
        host_id: hostId,
        join_code: joinCode
      })
    });

    const sessions = await this._handleResponse(response, 'create session');
    return sessions[0];
  }

  /**
   * Get a game session by join code
   * @param {string} joinCode - 6-character join code
   * @returns {Promise<Object|null>} Session object or null if not found
   */
  async getGameSession(joinCode) {
    const response = await fetch(`${this.baseUrl}?join_code=eq.${joinCode}`, {
      method: 'GET',
      headers: this._getHeaders()
    });

    const sessions = await this._handleResponse(response, 'get session');
    return sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Update a game session
   * @param {string} sessionId - UUID of the session
   * @param {Object} updates - Object with fields to update
   * @returns {Promise<Object>} Updated session object
   */
  async updateGameSession(sessionId, updates) {
    const response = await fetch(`${this.baseUrl}?id=eq.${sessionId}`, {
      method: 'PATCH',
      headers: this._getHeaders(true),
      body: JSON.stringify(updates)
    });

    const sessions = await this._handleResponse(response, 'update session');
    return sessions[0];
  }

  /**
   * Delete a game session
   * @param {string} sessionId - UUID of the session
   * @returns {Promise<void>}
   */
  async deleteGameSession(sessionId) {
    const response = await fetch(`${this.baseUrl}?id=eq.${sessionId}`, {
      method: 'DELETE',
      headers: this._getHeaders()
    });

    await this._handleResponse(response, 'delete session');
  }
}
