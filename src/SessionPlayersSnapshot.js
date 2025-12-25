/**
 * SessionPlayersSnapshot
 *
 * Maintains a local synchronized copy of players in a specific game session.
 * Syncs via database events, ephemeral WebSocket broadcasts, and periodic refreshes.
 */
export class SessionPlayersSnapshot {
  constructor(supabaseClient, sessionId, channel) {
    this.supabaseClient = supabaseClient;
    this.sessionId = sessionId;
    this.channel = channel;
    this.players = new Map(); // Keyed by player_id
    this.refreshInterval = null;
    this.subscriptionReady = null; // Promise that resolves when channel is subscribed and initial fetch is complete

    // Initialize: fetch snapshot and setup subscriptions
    this.subscriptionReady = this.#initialize();

    // Start periodic refresh
    this.#startPeriodicRefresh();
  }

  /**
   * Initialize the snapshot: fetch initial data and setup channel subscriptions
   * @returns {Promise} Resolves when both fetch and subscription are complete
   */
  async #initialize() {
    // Fetch initial snapshot first
    await this.#fetchInitialSnapshot();

    // Then setup channel subscriptions
    await this.#setupChannelSubscriptions();
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
      const { data, error } = await this.supabaseClient
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
   * Setup channel subscriptions for DB events and position updates
   * @returns {Promise} Resolves when channel is subscribed
   */
  #setupChannelSubscriptions() {
    return new Promise((resolve, reject) => {
      this.channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'session_players',
            // Don't use filter parameter - manually filter in handler to ensure DELETE events work
          },
          (payload) => {
            // Manually filter events by session_id
            const sessionId = payload.new?.session_id || payload.old?.session_id;
            if (sessionId && sessionId !== this.sessionId) {
              return; // Ignore events for other sessions
            }
            this.#handleDbEvent(payload);
          }
        )
        .on(
          'broadcast',
          { event: 'position_update' },
          (message) => {
            this.#handlePositionUpdate(message.payload);
          }
        )
        .subscribe((status, error) => {
          if (status === 'SUBSCRIBED') {
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Failed to subscribe to channel: ${status} ${error ? error.message : ''}`));
          }
        });
    });
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
   */
  #handlePositionUpdate(payload) {
    const { player_id, position_x, position_y, rotation } = payload;

    // Only update if player exists in this session
    const player = this.players.get(player_id);
    if (!player) {
      return;
    }

    // Update position in-memory (ephemeral, not written to DB)
    if (position_x !== undefined) {
      player.position_x = position_x;
    }
    if (position_y !== undefined) {
      player.position_y = position_y;
    }
    if (rotation !== undefined) {
      player.rotation = rotation;
    }
  }

  /**
   * Start periodic snapshot refresh (every 60 seconds)
   */
  #startPeriodicRefresh() {
    this.refreshInterval = setInterval(() => {
      this.#refreshSnapshot();
    }, 60000); // 60 seconds
  }

  /**
   * Refresh the entire snapshot from the database
   */
  async #refreshSnapshot() {
    try {
      const { data, error } = await this.supabaseClient
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
      const { data, error } = await this.supabaseClient
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

    // Unsubscribe from channel
    if (this.channel) {
      this.channel.unsubscribe();
    }
  }
}
