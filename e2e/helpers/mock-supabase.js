/**
 * Mock Supabase Client for E2E Testing
 * 
 * This module provides a mock Supabase client that runs entirely in-memory.
 * It simulates:
 * - Authentication (signInAnonymously)
 * - Database operations (select, insert, update, delete)
 * - Realtime subscriptions (channels, broadcast, postgres_changes)
 * - RPC calls
 * 
 * It maintains a shared state across all client instances created via createMockSupabase(),
 * allowing tests to simulate multiple clients interacting with the same "backend".
 */

// Shared in-memory database state
let db = {
  game_sessions: [],
  session_players: []
};

// Active realtime channels
// Map<channelName, Set<subscriptionCallback>>
const channels = new Map();

// Active postgres_changes subscriptions
// Set<{ filter: object, callback: function }>
const dbSubscriptions = new Set();

/**
 * Resets the shared mock backend state.
 * Call this in beforeAll or beforeEach.
 */
export function resetMockBackend() {
  db = {
    game_sessions: [],
    session_players: []
  };
  channels.clear();
  dbSubscriptions.clear();
}

/**
 * Generates a UUID-like string
 */
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Notify all subscribers of a database change
 * @param {string} eventType - INSERT, UPDATE, DELETE
 * @param {string} table - Table name
 * @param {object} oldRecord - Previous record (for UPDATE/DELETE)
 * @param {object} newRecord - New record (for INSERT/UPDATE)
 */
function notifyDbSubscribers(eventType, table, oldRecord, newRecord) {
  const payload = {
    schema: 'public',
    table: table,
    commit_timestamp: new Date().toISOString(),
    eventType: eventType,
    new: newRecord || {},
    old: oldRecord || {},
    errors: null
  };

  // Notify channel subscriptions listening for postgres_changes
  for (const sub of dbSubscriptions) {
    // Simple filter matching
    if (sub.filter.table && sub.filter.table !== table) continue;
    if (sub.filter.event && sub.filter.event !== '*' && sub.filter.event !== eventType) continue;
    
    // In a real scenario, Supabase filters by more criteria, but for our tests,
    // we usually filter in the client callback or assume table match is enough.
    // The Network class manually filters by session_id in the callback, so we pass everything matching the table.
    
    setTimeout(() => sub.callback(payload), 10);
  }
}

/**
 * Creates a mock Supabase client instance.
 * @returns {object} Mock Supabase client
 */
export function createMockSupabase() {
  const user = {
    id: uuidv4(),
    email: 'anon@example.com',
    role: 'anon'
  };

  return {
    auth: {
      signInAnonymously: async () => {
        return { data: { user, session: { access_token: 'mock-token' } }, error: null };
      },
      signOut: async () => {
        return { error: null };
      },
      getUser: async () => {
        return { data: { user }, error: null };
      }
    },

    from: (table) => {
      // Query builder state
      let query = {
        table,
        filters: [], // { column, operator, value }
        order: null, // { column, ascending }
        limit: null,
        single: false,
        returning: false // implicitly true in Supabase JS usually, but strict in builder
      };

      const builder = {
        select: (columns = '*') => {
          query.returning = true; // Mark that we want data back
          return builder;
        },
        insert: (data) => {
          query.type = 'INSERT';
          query.data = data;
          return builder;
        },
        update: (data) => {
          query.type = 'UPDATE';
          query.data = data;
          return builder;
        },
        delete: () => {
          query.type = 'DELETE';
          return builder;
        },
        eq: (column, value) => {
          query.filters.push({ column, operator: 'eq', value });
          return builder;
        },
        match: (filterObj) => {
           for (const [key, value] of Object.entries(filterObj)) {
             query.filters.push({ column: key, operator: 'eq', value });
           }
           return builder;
        },
        order: (column, { ascending = true } = {}) => {
          query.order = { column, ascending };
          return builder;
        },
        single: () => {
          query.single = true;
          return builder;
        },
        limit: (n) => {
          query.limit = n;
          return builder;
        },
        // Execute the query
        then: (resolve, reject) => {
          // Process query logic asynchronously
          setTimeout(() => {
            try {
              if (!db[table]) {
                resolve({ data: null, error: { message: `Table ${table} not found` } });
                return;
              }

              let result = { data: null, error: null };

              if (query.type === 'INSERT') {
                const defaults = {
                  game_sessions: {
                    status: 'lobby',
                    game_phase: 'lobby',
                    max_players: 12,
                    created_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
                  },
                  session_players: {
                    is_host: false,
                    is_connected: true,
                    is_alive: true,
                    position_x: 1200,
                    position_y: 800,
                    velocity_x: 0,
                    velocity_y: 0,
                    rotation: 0,
                    health: 100,
                    kills: 0,
                    damage_dealt: 0,
                    joined_at: new Date().toISOString(),
                    last_heartbeat: new Date().toISOString()
                  }
                };

                const tableDefaults = defaults[table] || {};
                const newRecord = { ...tableDefaults, ...query.data, id: query.data.id || uuidv4() };
                
                // Check unique constraints (very basic implementation)
                if (table === 'game_sessions' && db[table].some(r => r.join_code === newRecord.join_code)) {
                   resolve({ data: null, error: { code: '23505', message: 'Unique violation' } }); // mimic pg error code
                   return;
                }
                if (table === 'session_players' && db[table].some(r => r.session_id === newRecord.session_id && r.player_id === newRecord.player_id)) {
                   resolve({ data: null, error: { code: '23505', message: 'Unique violation' } });
                   return;
                }

                db[table].push({ ...newRecord });
                notifyDbSubscribers('INSERT', table, null, { ...newRecord });
                result.data = query.single ? { ...newRecord } : [{ ...newRecord }];
              } 
              else if (query.type === 'UPDATE') {
                const toUpdate = filterRecords(db[table], query.filters);
                const updatedRecords = [];
                
                toUpdate.forEach(record => {
                  const oldRecord = { ...record };
                  Object.assign(record, query.data);
                  const newRecord = { ...record };
                  updatedRecords.push(newRecord);
                  notifyDbSubscribers('UPDATE', table, oldRecord, newRecord);
                });
                
                result.data = query.single ? (updatedRecords[0] || null) : updatedRecords;
              }
              else if (query.type === 'DELETE') {
                const initialLength = db[table].length;
                const remaining = [];
                const deleted = [];
                
                db[table].forEach(record => {
                  if (matchFilters(record, query.filters)) {
                    deleted.push({ ...record });
                  } else {
                    remaining.push(record);
                  }
                });
                
                db[table] = remaining;
                
                deleted.forEach(record => {
                  notifyDbSubscribers('DELETE', table, record, null);
                });
                
                result.data = deleted;
              }
              else {
                // SELECT
                let rows = filterRecords(db[table], query.filters).map(r => ({ ...r }));
                
                if (query.order) {
                  rows.sort((a, b) => {
                    if (a[query.order.column] < b[query.order.column]) return query.order.ascending ? -1 : 1;
                    if (a[query.order.column] > b[query.order.column]) return query.order.ascending ? 1 : -1;
                    return 0;
                  });
                }
                
                if (query.limit) {
                  rows = rows.slice(0, query.limit);
                }

                if (query.single) {
                  if (rows.length === 0) result.data = null; // or error depending on supabase version, usually null or error. Network.js checks for !data
                  else result.data = rows[0];
                } else {
                  result.data = rows;
                }
              }

              resolve(result);
            } catch (e) {
              resolve({ data: null, error: { message: e.message } });
            }
          }, 10);
        }
      };
      return builder;
    },

    rpc: async (fnName, params) => {
      if (fnName === 'get_session_by_join_code') {
        const session = db.game_sessions.find(s => s.join_code === params.p_join_code);
        return { data: session ? [session] : [], error: null };
      }
      return { data: null, error: { message: `RPC ${fnName} not implemented in mock` } };
    },

    channel: (name, options = {}) => {
      const channelObj = {
        name,
        _listeners: {
          broadcast: [],
          postgres_changes: []
        },
        on(type, filter, callback) {
          const actualCallback = typeof filter === 'function' ? filter : callback;
          if (type === 'broadcast') {
            this._listeners.broadcast.push(actualCallback);
          } else if (type === 'postgres_changes') {
            const actualFilter = typeof filter === 'object' ? filter : {};
            const sub = { filter: { ...actualFilter, channelName: name }, callback: actualCallback };
            dbSubscriptions.add(sub);
            this._listeners.postgres_changes.push(sub);
          }
          return this;
        },
        subscribe(callback) {
          if (!channels.has(name)) {
            channels.set(name, new Set());
          }
          channels.get(name).add(this);
          setTimeout(() => callback && callback('SUBSCRIBED'), 0);
          return this;
        },
        send(payload) {
          // payload: { type: 'broadcast', event: 'message', payload: { ... } }
          if (payload.type === 'broadcast') {
            const channelSubs = channels.get(name);
            if (channelSubs) {
              channelSubs.forEach(sub => {
                if (sub !== this) { // Don't echo back to sender (Supabase behavior)
                   // Simulate network latency
                   setTimeout(() => {
                     sub._listeners.broadcast.forEach(cb => cb(payload));
                   }, 10);
                }
              });
            }
          }
          return Promise.resolve('ok');
        },
        unsubscribe() {
           if (channels.has(name)) {
             channels.get(name).delete(this);
           }
           // Remove postgres subscriptions
           this._listeners.postgres_changes.forEach(sub => dbSubscriptions.delete(sub));
        }
      };
      return channelObj;
    },
    
    removeChannel: (channel) => {
       if (channel && channel.unsubscribe) channel.unsubscribe();
       return Promise.resolve('ok');
    }
  };
}

// Helper to filter records
function filterRecords(records, filters) {
  return records.filter(record => matchFilters(record, filters));
}

function matchFilters(record, filters) {
  return filters.every(f => {
    if (f.operator === 'eq') return record[f.column] === f.value;
    return true;
  });
}
