/**
 * SessionPlayersSnapshot
 *
 * Maintains a local synchronized copy of players in a specific game session.
 * Built on top of Network layer - subscribes to Network events instead of managing channels directly.
 * Syncs via database events, ephemeral WebSocket broadcasts, and periodic refreshes.
 */
export class SessionPlayersSnapshot {
  constructor(network, sessionId, options = {}) {
    this.network = network;
    this.sessionId = sessionId;
    this.players = new Map(); // Keyed by player_id
    this.refreshInterval = null;
    this.subscriptionReady = null; // Promise that resolves when subscriptions are ready and initial fetch is complete
    this.refreshIntervalMs = options.refreshIntervalMs || 60000; // Default to 60 seconds

    // Bound event handlers for cleanup
    this.postgresChangesHandler = this.#handlePostgresChanges.bind(this);
    this.broadcastHandler = this.#handleBroadcast.bind(this);

    // Initialize: fetch snapshot and setup subscriptions
    this.subscriptionReady = this.#initialize();

    // Start periodic refresh
    this.#startPeriodicRefresh();
  }

  /**
   * Initialize the snapshot: fetch initial data and setup Network event subscriptions
   * @returns {Promise} Resolves when both fetch and subscription are complete
   */
  async #initialize() {
    // Fetch initial snapshot first
    await this.#fetchInitialSnapshot();

    // Then setup Network event subscriptions
    this.#setupNetworkSubscriptions();
  }

  /**
   * Wait for the initialization to be ready
   * @returns {Promise} Resolves when subscription and initial fetch are complete
   */
  async ready() {
    return this.subscriptionReady;
  }

  /**
   * Fetch initial snapshot of players in this session
   */
  async #fetchInitialSnapshot() {
    try {
      const { data, error } = await this.network.supabase
        .from('session_players')
        .select('*')
        .eq('session_id', this.sessionId);

      if (error) {
        console.warn(`Failed to fetch initial snapshot: ${error.message}`);
        return;
      }

      // Populate the map
      if (data) {
        data.forEach(player => {
          this.players.set(player.player_id, player);
        });
      }
    } catch (err) {
      console.warn(`Failed to fetch initial snapshot: ${err.message}`);
    }
  }

  /**
   * Setup Network event subscriptions for DB changes and broadcasts
   */
  #setupNetworkSubscriptions() {
    // Subscribe to Network's generic postgres_changes events
    this.network.on('postgres_changes', this.postgresChangesHandler);

    // Subscribe to Network's position_update broadcast events
    // Network emits events with payload.type as the event name
    this.network.on('position_update', this.broadcastHandler);
    this.network.on('position_broadcast', this.broadcastHandler);
  }

  /**
   * Handle postgres_changes events from Network
   * Filters for session_players table and this session_id
   */
  #handlePostgresChanges(payload) {
    const { table, new: newRecord, old: oldRecord } = payload;

    // Filter: only handle session_players table
    if (table !== 'session_players') {
      return;
    }

    // Filter: only handle events for this session
    const sessionId = newRecord?.session_id || oldRecord?.session_id;
    if (sessionId && sessionId !== this.sessionId) {
      return;
    }

    // Delegate to existing handler
    this.#handleDbEvent(payload);
  }

  /**
   * Handle broadcast events from Network
   * Processes position_update and position_broadcast messages
   */
  #handleBroadcast(message) {
    // Handle position_update (individual player update)
    if (message.type === 'position_update') {
      this.#handlePositionUpdate(message.data);
    }
    // Handle position_broadcast (batched updates from host)
    else if (message.type === 'position_broadcast') {
      const { updates } = message.data;
      if (updates && Array.isArray(updates)) {
        updates.forEach(update => {
          this.#handlePositionUpdate(update);
        });
      }
    }
  }

  /**
   * Handle database change events
   */
  #handleDbEvent(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        if (newRecord) {
          this.players.set(newRecord.player_id, newRecord);
        }
        break;

      case 'DELETE':
        if (oldRecord) {
          // Supabase Realtime only sends the primary key (id) in DELETE events,
          // not the full record, even with REPLICA IDENTITY FULL.
          // We need to find the player by id and then delete by player_id.
          const playerToDelete = Array.from(this.players.values()).find(p => p.id === oldRecord.id);
          if (playerToDelete) {
            this.players.delete(playerToDelete.player_id);
          }
        }
        break;

      case 'UPDATE':
        if (newRecord) {
          this.players.set(newRecord.player_id, newRecord);
        }
        break;
    }
  }

  /**
   * Handle position update broadcasts
   * Handles both formats:
   * - Direct format: { player_id, position_x, position_y, rotation }
   * - Nested format: { player_id, position: {x, y}, rotation, velocity }
   */
  #handlePositionUpdate(payload) {
    const player_id = payload.player_id || payload.from;
    const player = this.players.get(player_id);

    // Only update if player exists in this session
    if (!player) {
      return;
    }

    // Handle nested position format (from position_update/position_broadcast)
    if (payload.position) {
      if (payload.position.x !== undefined) {
        player.position_x = payload.position.x;
      }
      if (payload.position.y !== undefined) {
        player.position_y = payload.position.y;
      }
    }
    // Handle direct format (for backwards compatibility)
    else {
      if (payload.position_x !== undefined) {
        player.position_x = payload.position_x;
      }
      if (payload.position_y !== undefined) {
        player.position_y = payload.position_y;
      }
    }

    // Update rotation (works for both formats)
    if (payload.rotation !== undefined) {
      player.rotation = payload.rotation;
    }

    // Update health
    if (payload.health !== undefined) {
      player.health = payload.health;
    }
  }

  /**
   * Start periodic snapshot refresh
   */
  #startPeriodicRefresh() {
    this.refreshInterval = setInterval(() => {
      this.#refreshSnapshot();
    }, this.refreshIntervalMs);
  }

  /**
   * Refresh the entire snapshot from the database
   */
  async #refreshSnapshot() {
    try {
      const { data, error } = await this.network.supabase
        .from('session_players')
        .select('*')
        .eq('session_id', this.sessionId);

      if (error) {
        console.error(`Failed to refresh snapshot: ${error.message}`);
        return;
      }

      // Replace the map with fresh data
      if (data) {
        this.players.clear();
        data.forEach(player => {
          this.players.set(player.player_id, player);
        });
      }
    } catch (err) {
      console.error(`Failed to refresh snapshot: ${err.message}`);
    }
  }

  /**
   * Get all players in this session
   * @returns {Map} Map of players keyed by player_id
   */
  getPlayers() {
    return this.players;
  }

  /**
   * Add a player to the session
   * @param {Object} playerData - Player data (player_id, player_name, is_host, etc.)
   */
  async addPlayer(playerData) {
    try {
      // Insert with session_id
      const { data, error } = await this.network.supabase
        .from('session_players')
        .insert({
          session_id: this.sessionId,
          ...playerData,
        })
        .select()
        .single();

      if (error) {
        console.error(`Failed to add player: ${error.message}`);
        return;
      }

      // Add to local map
      if (data) {
        this.players.set(data.player_id, data);
      }
    } catch (err) {
      console.error(`Failed to add player: ${err.message}`);
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    // Clear periodic refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Unsubscribe from Network events
    if (this.network) {
      this.network.off('postgres_changes', this.postgresChangesHandler);
      this.network.off('position_update', this.broadcastHandler);
      this.network.off('position_broadcast', this.broadcastHandler);
    }
  }
}
