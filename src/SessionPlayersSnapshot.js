/**
 * SessionPlayersSnapshot
 *
 * READ-ONLY: Maintains a local synchronized copy of players in a game session.
 * Syncs via database events, WebSocket broadcasts, and periodic refreshes.
 *
 * IMPORTANT: This class does NOT write to the database. All database writes
 * are handled by Network.js according to the authority model:
 * - Client-authoritative: position, rotation
 * - Host-authoritative: health, combat, game state
 */
import { CONFIG } from './config.js';

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

    // Subscribe to Network's player_state_update events (generic)
    this.network.on('player_state_update', this.broadcastHandler);
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
   * Handle movement_update and player_state_update events from Network
   */
  #handleBroadcast(message) {
    // Handle generic player_state_update (single or batch)
    if (message.type === 'player_state_update') {
      const data = message.data;
      const senderId = message.from;
      // Handle batched updates
      if (Array.isArray(data)) {
        data.forEach(update => {
          this.#handlePlayerStateUpdate(update, senderId);
        });
      } else {
        // Handle single update
        this.#handlePlayerStateUpdate({
          ...data,
          player_id: data.player_id || senderId,
        }, senderId);
      }
    }
  }

  /**
   * Handle database change events
   */
  #handleDbEvent(payload) {
    console.log(`[Snapshot] DB Event: ${payload.eventType} for table ${payload.table}`);
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
          const existingPlayer = this.players.get(newRecord.player_id);
          if (existingPlayer) {
            // Merge new data into existing player object to preserve local state
            // (like positionHistory, which isn't in the database)
            Object.assign(existingPlayer, newRecord);
          } else {
            this.players.set(newRecord.player_id, newRecord);
          }
        }
        break;
    }
  }

  /**
   * Handle generic player state update broadcasts
   * Supports any combination of client-auth and host-auth fields
   * Enforces authorization: clients can only update their own client-auth fields,
   * host can update all fields for any player
   *
   * @param {Object} payload - The state update payload
   * @param {string} senderId - The player ID of the sender
   */
  #handlePlayerStateUpdate(payload, senderId) {
    const player_id = payload.player_id || senderId;
    const player = this.players.get(player_id);

    // Only update if player exists in this session
    if (!player) {
      return;
    }

    const isFromHost = senderId === this.network.hostId;
    const isFromSelf = senderId === this.network.playerId;

    // Client-authoritative fields: only accept from the player themselves OR the host
    if (senderId === player_id || isFromHost) {
      if (payload.position_x !== undefined) player.position_x = payload.position_x;
      if (payload.position_y !== undefined) player.position_y = payload.position_y;
      if (payload.rotation !== undefined) player.rotation = payload.rotation;
      if (payload.velocity_x !== undefined) player.velocity_x = payload.velocity_x;
      if (payload.velocity_y !== undefined) player.velocity_y = payload.velocity_y;
      
      // Allow self-broadcast of health
      if (isFromSelf && payload.health !== undefined) {
        player.health = payload.health;
      }
    }

    // Host-authoritative fields: ONLY accept from the host
    if (isFromHost) {
      if (payload.health !== undefined) player.health = payload.health;
      if (payload.equipped_weapon !== undefined) player.equipped_weapon = payload.equipped_weapon;
      if (payload.equipped_armor !== undefined) player.equipped_armor = payload.equipped_armor;
      if (payload.is_alive !== undefined) player.is_alive = payload.is_alive;
      if (payload.kills !== undefined) player.kills = payload.kills;
      if (payload.damage_dealt !== undefined) player.damage_dealt = payload.damage_dealt;
      if (payload.is_connected !== undefined) player.is_connected = payload.is_connected;
    }

    // Update position history for interpolation
    this.#updatePositionHistory(player, {
      position_x: payload.position_x !== undefined ? payload.position_x : player.position_x,
      position_y: payload.position_y !== undefined ? payload.position_y : player.position_y,
      rotation: payload.rotation !== undefined ? payload.rotation : player.rotation,
      velocity_x: payload.velocity_x !== undefined ? payload.velocity_x : player.velocity_x,
      velocity_y: payload.velocity_y !== undefined ? payload.velocity_y : player.velocity_y,
    });
  }

  /**
   * Update the position history buffer for a player
   * Used for client-side interpolation
   * @param {Object} player - The player object to update
   * @param {Object} data - The update data containing position/rotation/velocity
   */
  #updatePositionHistory(player, data) {
    if (!player.positionHistory) {
      player.positionHistory = [];
    }

    const timestamp = performance.now();
    const snapshot = {
      x: data.position_x,
      y: data.position_y,
      rotation: data.rotation,
      velocity_x: data.velocity_x,
      velocity_y: data.velocity_y,
      timestamp: timestamp
    };

    player.positionHistory.push(snapshot);

    // Keep only the last N snapshots
    if (player.positionHistory.length > CONFIG.NETWORK.INTERPOLATION_BUFFER_SIZE) {
      player.positionHistory.shift();
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

      // Smart Merge: Update existing players, add new ones, remove missing ones
      if (data) {
        const dbPlayerIds = new Set();
        const isHost = this.network.isHost;

        data.forEach(dbPlayer => {
          dbPlayerIds.add(dbPlayer.player_id);
          const localPlayer = this.players.get(dbPlayer.player_id);

          if (localPlayer) {
            if (isHost) {
              // Host: Only update client-authoritative fields from DB
              // Preserve local host-authoritative fields (health, equipment, etc.)
              const clientAuthFields = CONFIG.NETWORK.CLIENT_AUTHORITATIVE_FIELDS;
              clientAuthFields.forEach(field => {
                localPlayer[field] = dbPlayer[field];
              });
              
              // Also sync read-only metadata if needed, but safe to ignore for now
            } else {
              // Client: DB is authoritative (via Host), so update everything
              // Use assign to preserve the object reference and any local-only properties (like positionHistory)
              Object.assign(localPlayer, dbPlayer);
            }
          } else {
            // New player: Add to map
            this.players.set(dbPlayer.player_id, dbPlayer);
          }
        });

        // Remove players not in DB
        for (const [id] of this.players) {
          if (!dbPlayerIds.has(id)) {
            this.players.delete(id);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to refresh snapshot: ${err.message}`);
    }
  }

  /**
   * Get interpolated state for a player at a specific render time
   * @param {string} playerId - The ID of the player to interpolate
   * @param {number} renderTime - The current render time (performance.now())
   * @returns {Object} { x, y, rotation, vx, vy } or null if player not found
   */
  getInterpolatedPlayerState(playerId, renderTime) {
    const player = this.players.get(playerId);
    if (!player) return null;

    // If no history, return current position
    if (!player.positionHistory || player.positionHistory.length < 1) {
      return {
        x: player.position_x || 0,
        y: player.position_y || 0,
        rotation: player.rotation || 0,
        vx: player.velocity_x || 0,
        vy: player.velocity_y || 0
      };
    }

    const targetTime = renderTime - CONFIG.NETWORK.INTERPOLATION_DELAY_MS;
    const history = player.positionHistory;

    // If target time is after newest snapshot, use newest (no extrapolation yet)
    if (targetTime >= history[history.length - 1].timestamp) {
      const newest = history[history.length - 1];
      return { x: newest.x, y: newest.y, rotation: newest.rotation, vx: newest.velocity_x, vy: newest.velocity_y };
    }

    // If target time is before oldest snapshot, use oldest
    if (targetTime <= history[0].timestamp) {
      const oldest = history[0];
      return { x: oldest.x, y: oldest.y, rotation: oldest.rotation, vx: oldest.velocity_x, vy: oldest.velocity_y };
    }

    // Find bracketing snapshots
    let p1 = history[0];
    let p2 = history[1];

    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].timestamp <= targetTime && history[i + 1].timestamp >= targetTime) {
        p1 = history[i];
        p2 = history[i + 1];
        break;
      }
    }

    // Calculate interpolation factor (0 to 1)
    const totalDuration = p2.timestamp - p1.timestamp;
    const t = totalDuration > 0 ? (targetTime - p1.timestamp) / totalDuration : 0;

    // Linear interpolation for position
    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;

    // Linear interpolation for velocity (smoother animation transitions)
    const vx = p1.velocity_x + (p2.velocity_x - p1.velocity_x) * t;
    const vy = p1.velocity_y + (p2.velocity_y - p1.velocity_y) * t;

    // Shortest path interpolation for rotation
    const rotation = this.#interpolateRotation(p1.rotation, p2.rotation, t);

    return { x, y, rotation, vx, vy };
  }

  /**
   * Interpolate rotation finding the shortest path
   * @param {number} start - Start angle in radians
   * @param {number} end - End angle in radians
   * @param {number} t - Interpolation factor (0-1)
   * @returns {number} Interpolated angle in radians
   */
  #interpolateRotation(start, end, t) {
    const TWO_PI = Math.PI * 2;

    // Normalize angles to 0-2PI
    let normStart = start % TWO_PI;
    if (normStart < 0) normStart += TWO_PI;

    let normEnd = end % TWO_PI;
    if (normEnd < 0) normEnd += TWO_PI;

    // Calculate difference
    let diff = normEnd - normStart;

    // Adjust for shortest path
    if (diff > Math.PI) {
      diff -= TWO_PI;
    } else if (diff < -Math.PI) {
      diff += TWO_PI;
    }

    // Interpolate
    let result = normStart + diff * t;

    // Normalize result
    result = result % TWO_PI;
    if (result < 0) result += TWO_PI;

    return result;
  }

  /**
   * Update the entire player list atomically.
   * Useful for initial game start to ensure all clients have the same bot/player state.
   * @param {Array} playerList - Array of player records from the database
   */
  updatePlayers(playerList) {
    if (!playerList || !Array.isArray(playerList)) return;

    const newPlayerIds = new Set(playerList.map(p => p.player_id));

    // Update existing or add new
    playerList.forEach(dbPlayer => {
      const localPlayer = this.players.get(dbPlayer.player_id);
      if (localPlayer) {
        // Merge DB data into local player object
        Object.assign(localPlayer, dbPlayer);
      } else {
        this.players.set(dbPlayer.player_id, dbPlayer);
      }
    });

    // Remove players not in the new list
    for (const [id] of this.players) {
      if (!newPlayerIds.has(id)) {
        this.players.delete(id);
      }
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
      this.network.off('player_state_update', this.broadcastHandler);
    }
  }
}
