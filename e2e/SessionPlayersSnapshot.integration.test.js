import { createClient } from '@supabase/supabase-js';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('SessionPlayersSnapshot Integration with Supabase', () => {
  let hostClient;
  let playerClient;
  let hostSnapshot;
  let playerSnapshot;
  let testSessionId;
  let testJoinCode;
  let hostChannel;
  let playerChannel;
  let hostUser;
  let playerUser;

  // Skip tests if Supabase is not configured
  if (!supabaseUrl || !supabaseAnonKey) {
    test.only('Supabase environment variables not set, skipping integration tests', () => {
      console.warn('Set SUPABASE_URL and SUPABASE_ANON_KEY to run integration tests.');
      expect(true).toBe(true);
    });
    return;
  }

  beforeAll(async () => {
    // Create two separate clients (host and player)
    hostClient = createClient(supabaseUrl, supabaseAnonKey);
    playerClient = createClient(supabaseUrl, supabaseAnonKey);

    // Authenticate both clients
    const { data: hostAuth, error: hostAuthError } = await hostClient.auth.signInAnonymously();
    if (hostAuthError) {
      throw new Error(`Failed to authenticate host: ${hostAuthError.message}`);
    }
    hostUser = hostAuth.user;

    const { data: playerAuth, error: playerAuthError } = await playerClient.auth.signInAnonymously();
    if (playerAuthError) {
      throw new Error(`Failed to authenticate player: ${playerAuthError.message}`);
    }
    playerUser = playerAuth.user;
  });

  afterAll(async () => {
    // Sign out both clients
    if (hostClient) {
      await hostClient.auth.signOut();
    }
    if (playerClient) {
      await playerClient.auth.signOut();
    }
  });

  beforeEach(async () => {
    // Create a test session
    testJoinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const channelName = `game_session:${testJoinCode}`;

    const { data: sessionData, error: sessionError } = await hostClient
      .from('game_sessions')
      .insert({
        join_code: testJoinCode,
        host_id: hostUser.id,
        status: 'lobby',
        realtime_channel_name: channelName,
      })
      .select()
      .single();

    if (sessionError) {
      throw new Error(`Failed to create test session: ${sessionError.message}`);
    }

    testSessionId = sessionData.id;

    // Create channels for both clients with broadcast enabled (SessionPlayersSnapshot will subscribe them)
    hostChannel = hostClient.channel(channelName, {
      config: {
        broadcast: {
          ack: true,
        },
      },
    });
    playerChannel = playerClient.channel(channelName, {
      config: {
        broadcast: {
          ack: true,
        },
      },
    });
  });

  afterEach(async () => {
    // Destroy snapshots first (clears intervals and unsubscribes from channels)
    if (hostSnapshot) {
      hostSnapshot.destroy();
      hostSnapshot = null;
    }
    if (playerSnapshot) {
      playerSnapshot.destroy();
      playerSnapshot = null;
    }

    // Wait for channel unsubscriptions to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Remove channels
    if (hostChannel) {
      await hostClient.removeChannel(hostChannel);
      hostChannel = null;
    }
    if (playerChannel) {
      await playerClient.removeChannel(playerChannel);
      playerChannel = null;
    }

    // Wait for server-side cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Clean up test data
    if (testSessionId) {
      // Delete players first (due to foreign key constraint)
      await hostClient.from('session_players').delete().eq('session_id', testSessionId);
      // Delete session
      await hostClient.from('game_sessions').delete().eq('id', testSessionId);
      testSessionId = null;
    }
  });

  describe('Initialization and Snapshot', () => {
    test('should fetch initial snapshot filtered by session_id', async () => {
      // Add a player to the session first
      const { error: insertError } = await hostClient
        .from('session_players')
        .insert({
          session_id: testSessionId,
          player_id: hostUser.id,
          player_name: 'HostPlayer',
          is_host: true,
        });

      expect(insertError).toBeNull();

      // Create snapshot
      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel);

      // Wait for channel subscription to complete
      await hostSnapshot.ready();

      const players = hostSnapshot.getPlayers();
      expect(players.size).toBe(1);
      expect(players.has(hostUser.id)).toBe(true);
      expect(players.get(hostUser.id).player_name).toBe('HostPlayer');
      expect(players.get(hostUser.id).is_host).toBe(true);
    });

    test('should only fetch players for the specific session', async () => {
      // Create another session with a different player
      const otherJoinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: otherSession, error: otherSessionError } = await hostClient
        .from('game_sessions')
        .insert({
          join_code: otherJoinCode,
          host_id: hostUser.id,
          status: 'lobby',
          realtime_channel_name: `game_session:${otherJoinCode}`,
        })
        .select()
        .single();

      expect(otherSessionError).toBeNull();

      // Add player to OTHER session
      await hostClient
        .from('session_players')
        .insert({
          session_id: otherSession.id,
          player_id: hostUser.id,
          player_name: 'OtherPlayer',
          is_host: true,
        });

      // Add player to TEST session (use playerClient to insert playerUser)
      await playerClient
        .from('session_players')
        .insert({
          session_id: testSessionId,
          player_id: playerUser.id,
          player_name: 'TestPlayer',
          is_host: false,
        });

      // Create snapshot for test session
      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel);

      // Wait for BOTH snapshots to be ready (if both exist)
      if (hostSnapshot && playerSnapshot) {
        await Promise.all([hostSnapshot.ready(), playerSnapshot.ready()]);
      } else if (hostSnapshot) {
        await hostSnapshot.ready();
      } else if (playerSnapshot) {
        await playerSnapshot.ready();
      }

      const players = hostSnapshot.getPlayers();

      // Should only have the player from testSessionId
      expect(players.size).toBe(1);
      expect(players.has(playerUser.id)).toBe(true);
      expect(players.get(playerUser.id).player_name).toBe('TestPlayer');

      // Cleanup other session
      await hostClient.from('session_players').delete().eq('session_id', otherSession.id);
      await hostClient.from('game_sessions').delete().eq('id', otherSession.id);
    });
  });

  describe('addPlayer', () => {
    test('should insert player into database with correct session_id', async () => {
      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel);

      // Wait for BOTH snapshots to be ready (if both exist)
      if (hostSnapshot && playerSnapshot) {
        await Promise.all([hostSnapshot.ready(), playerSnapshot.ready()]);
      } else if (hostSnapshot) {
        await hostSnapshot.ready();
      } else if (playerSnapshot) {
        await playerSnapshot.ready();
      }

      await hostSnapshot.addPlayer({
        player_id: hostUser.id,
        player_name: 'HostPlayer',
        is_host: true,
      });

      // Verify in database
      const { data, error } = await hostClient
        .from('session_players')
        .select('*')
        .eq('session_id', testSessionId)
        .eq('player_id', hostUser.id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data.player_name).toBe('HostPlayer');
      expect(data.is_host).toBe(true);
      expect(data.session_id).toBe(testSessionId);
    });

    test('should add player to local map after insertion', async () => {
      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel);

      // Wait for BOTH snapshots to be ready (if both exist)
      if (hostSnapshot && playerSnapshot) {
        await Promise.all([hostSnapshot.ready(), playerSnapshot.ready()]);
      } else if (hostSnapshot) {
        await hostSnapshot.ready();
      } else if (playerSnapshot) {
        await playerSnapshot.ready();
      }

      await hostSnapshot.addPlayer({
        player_id: hostUser.id,
        player_name: 'HostPlayer',
        is_host: true,
      });

      const players = hostSnapshot.getPlayers();
      expect(players.has(hostUser.id)).toBe(true);
      expect(players.get(hostUser.id).player_name).toBe('HostPlayer');
    });
  });

  describe('DB Event Synchronization - INSERT', () => {
    test('should receive INSERT event and update local map', async () => {
      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel);
      playerSnapshot = new SessionPlayersSnapshot(playerClient, testSessionId, playerChannel);

      // Wait for BOTH snapshots to be ready (if both exist)
      if (hostSnapshot && playerSnapshot) {
        await Promise.all([hostSnapshot.ready(), playerSnapshot.ready()]);
      } else if (hostSnapshot) {
        await hostSnapshot.ready();
      } else if (playerSnapshot) {
        await playerSnapshot.ready();
      }

      // Player joins session first (required by RLS policy to see other players)
      await playerSnapshot.addPlayer({
        player_id: playerUser.id,
        player_name: 'PlayerOne',
        is_host: false,
      });

      // Wait for player join to propagate
      await new Promise(resolve => setTimeout(resolve, 300));

      // Host adds themselves
      await hostSnapshot.addPlayer({
        player_id: hostUser.id,
        player_name: 'HostPlayer',
        is_host: true,
      });

      // Wait for DB event to propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      // Player snapshot should have received the INSERT event for the host
      const playerPlayers = playerSnapshot.getPlayers();
      expect(playerPlayers.has(hostUser.id)).toBe(true);
      expect(playerPlayers.get(hostUser.id).player_name).toBe('HostPlayer');
    });
  });

  describe('DB Event Synchronization - DELETE', () => {
    test('should receive DELETE event and remove from local map', async () => {
      // Add host player first
      const { data: insertedPlayer, error: insertError } = await hostClient
        .from('session_players')
        .insert({
          session_id: testSessionId,
          player_id: hostUser.id,
          player_name: 'HostPlayer',
          is_host: true,
        })
        .select()
        .single();

      expect(insertError).toBeNull();

      // Add player to session (required by RLS policy to see other players)
      const { error: playerInsertError } = await playerClient
        .from('session_players')
        .insert({
          session_id: testSessionId,
          player_id: playerUser.id,
          player_name: 'PlayerOne',
          is_host: false,
        });

      expect(playerInsertError).toBeNull();

      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel);
      playerSnapshot = new SessionPlayersSnapshot(playerClient, testSessionId, playerChannel);

      // Wait for BOTH snapshots to be ready (if both exist)
      if (hostSnapshot && playerSnapshot) {
        await Promise.all([hostSnapshot.ready(), playerSnapshot.ready()]);
      } else if (hostSnapshot) {
        await hostSnapshot.ready();
      } else if (playerSnapshot) {
        await playerSnapshot.ready();
      }

      // Both should have the host player
      expect(hostSnapshot.getPlayers().has(hostUser.id)).toBe(true);
      expect(playerSnapshot.getPlayers().has(hostUser.id)).toBe(true);

      // Delete the host player
      await hostClient
        .from('session_players')
        .delete()
        .eq('id', insertedPlayer.id);

      // Wait for DELETE event to propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      // Both should have removed the host player
      expect(hostSnapshot.getPlayers().has(hostUser.id)).toBe(false);
      expect(playerSnapshot.getPlayers().has(hostUser.id)).toBe(false);
    });
  });

  describe('DB Event Synchronization - UPDATE', () => {
    test('should receive UPDATE event and update local map', async () => {
      // Add a player first
      const { data: insertedPlayer, error: insertError } = await hostClient
        .from('session_players')
        .insert({
          session_id: testSessionId,
          player_id: hostUser.id,
          player_name: 'HostPlayer',
          is_host: true,
          kills: 0,
        })
        .select()
        .single();

      expect(insertError).toBeNull();

      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel);
      playerSnapshot = new SessionPlayersSnapshot(playerClient, testSessionId, playerChannel);

      // Wait for BOTH snapshots to be ready (if both exist)
      if (hostSnapshot && playerSnapshot) {
        await Promise.all([hostSnapshot.ready(), playerSnapshot.ready()]);
      } else if (hostSnapshot) {
        await hostSnapshot.ready();
      } else if (playerSnapshot) {
        await playerSnapshot.ready();
      }

      expect(hostSnapshot.getPlayers().get(hostUser.id).kills).toBe(0);
      expect(playerSnapshot.getPlayers().get(hostUser.id).kills).toBe(0);

      // Update the player
      await hostClient
        .from('session_players')
        .update({ kills: 5 })
        .eq('id', insertedPlayer.id);

      // Wait for UPDATE event to propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      // Both should have updated kills
      expect(hostSnapshot.getPlayers().get(hostUser.id).kills).toBe(5);
      expect(playerSnapshot.getPlayers().get(hostUser.id).kills).toBe(5);
    });
  });

  describe('Position Update Synchronization', () => {
    test('should receive position updates via channel broadcast', async () => {
      // Add a player first
      await hostClient
        .from('session_players')
        .insert({
          session_id: testSessionId,
          player_id: hostUser.id,
          player_name: 'HostPlayer',
          is_host: true,
          position_x: 0,
          position_y: 0,
          rotation: 0,
        });

      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel);
      playerSnapshot = new SessionPlayersSnapshot(playerClient, testSessionId, playerChannel);

      // Wait for BOTH snapshots to be ready (if both exist)
      if (hostSnapshot && playerSnapshot) {
        await Promise.all([hostSnapshot.ready(), playerSnapshot.ready()]);
      } else if (hostSnapshot) {
        await hostSnapshot.ready();
      } else if (playerSnapshot) {
        await playerSnapshot.ready();
      }

      // Give broadcasts time to fully initialize after subscription
      await new Promise(resolve => setTimeout(resolve, 100));

      // Host broadcasts position update
      await hostChannel.send({
        type: 'broadcast',
        event: 'position_update',
        payload: {
          player_id: hostUser.id,
          position_x: 100,
          position_y: 200,
          rotation: 1.5,
        },
      });

      // Wait for broadcast to propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      // Player snapshot should have updated position
      const playerPlayers = playerSnapshot.getPlayers();
      expect(playerPlayers.get(hostUser.id).position_x).toBe(100);
      expect(playerPlayers.get(hostUser.id).position_y).toBe(200);
      expect(playerPlayers.get(hostUser.id).rotation).toBe(1.5);
    });

    test('position updates should not write to database', async () => {
      // Add a player first
      await hostClient
        .from('session_players')
        .insert({
          session_id: testSessionId,
          player_id: hostUser.id,
          player_name: 'HostPlayer',
          is_host: true,
          position_x: 0,
          position_y: 0,
        });

      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel);

      // Wait for BOTH snapshots to be ready (if both exist)
      if (hostSnapshot && playerSnapshot) {
        await Promise.all([hostSnapshot.ready(), playerSnapshot.ready()]);
      } else if (hostSnapshot) {
        await hostSnapshot.ready();
      } else if (playerSnapshot) {
        await playerSnapshot.ready();
      }

      // Broadcast position update
      await hostChannel.send({
        type: 'broadcast',
        event: 'position_update',
        payload: {
          player_id: hostUser.id,
          position_x: 100,
          position_y: 200,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Check database - position should still be 0, 0
      const { data, error } = await hostClient
        .from('session_players')
        .select('position_x, position_y')
        .eq('session_id', testSessionId)
        .eq('player_id', hostUser.id)
        .single();

      expect(error).toBeNull();
      expect(data.position_x).toBe(0);
      expect(data.position_y).toBe(0);
    });
  });

  describe('Periodic Refresh', () => {
    test('should refresh snapshot every 5 seconds and pick up new players', async () => {
      // Create two snapshots with 5-second refresh interval
      hostSnapshot = new SessionPlayersSnapshot(hostClient, testSessionId, hostChannel, { refreshIntervalMs: 5000 });
      playerSnapshot = new SessionPlayersSnapshot(playerClient, testSessionId, playerChannel, { refreshIntervalMs: 5000 });

      await Promise.all([hostSnapshot.ready(), playerSnapshot.ready()]);

      // Give the channel subscriptions extra time to fully initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Initially, no players in either snapshot
      expect(hostSnapshot.getPlayers().size).toBe(0);
      expect(playerSnapshot.getPlayers().size).toBe(0);

      // Insert a player directly into the database (not using addPlayer)
      // This simulates an external insertion that both snapshots should pick up via DB events or periodic refresh
      const { error: insertError } = await playerClient
        .from('session_players')
        .insert({
          session_id: testSessionId,
          player_id: playerUser.id,
          player_name: 'NewPlayer',
          is_host: false,
        });

      expect(insertError).toBeNull();

      // Wait for either DB event (should be immediate) or periodic refresh (5s) to pick it up
      // DB events should pick this up within 1 second, but we'll wait longer to also test periodic refresh as a fallback
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Both snapshots should now have the new player (either from DB event or periodic refresh)
      expect(hostSnapshot.getPlayers().size).toBe(1);
      expect(hostSnapshot.getPlayers().has(playerUser.id)).toBe(true);
      expect(hostSnapshot.getPlayers().get(playerUser.id).player_name).toBe('NewPlayer');

      expect(playerSnapshot.getPlayers().size).toBe(1);
      expect(playerSnapshot.getPlayers().has(playerUser.id)).toBe(true);
      expect(playerSnapshot.getPlayers().get(playerUser.id).player_name).toBe('NewPlayer');
    });
  });
});
