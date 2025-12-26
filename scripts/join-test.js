#!/usr/bin/env node

/**
 * Test Script: Join Game Session
 *
 * Usage: node scripts/join-test.js <JOIN_CODE>
 *
 * Joins a game session with the given join code and stays connected
 * so you can verify the browser host sees the player in the lobby.
 */

import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network.js';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot.js';

// Get join code from command line
const joinCode = process.argv[2];

if (!joinCode) {
  console.error('Usage: node scripts/join-test.js <JOIN_CODE>');
  console.error('Example: node scripts/join-test.js ABC123');
  process.exit(1);
}

// Supabase configuration (local development by default)
const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

console.log('🎮 Game Session Join Test');
console.log('========================\n');
console.log(`Join Code: ${joinCode}`);
console.log(`Supabase URL: ${supabaseUrl}\n`);

let network;
let snapshot;
let supabase;
let playerId;
let sessionId;
let playerRecordId;

async function main() {
  try {
    // Create Supabase client
    console.log('🔌 Connecting to Supabase...');
    supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Authenticate anonymously
    console.log('🔐 Authenticating...');
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

    if (authError) {
      throw new Error(`Authentication failed: ${authError.message}`);
    }

    playerId = authData.user.id;
    console.log(`✅ Authenticated as: ${playerId.substring(0, 8)}...\n`);

    // Create Network instance
    network = new Network();
    network.initialize(supabase, playerId);

    // Listen to Network events for debugging
    network.on('postgres_changes', (payload) => {
      console.log('📡 DB Event:', payload.eventType, payload.table);
      if (payload.table === 'session_players') {
        // For INSERT/UPDATE, use payload.new; for DELETE, use payload.old
        const record = payload.new || payload.old;
        if (record && record.player_id && record.player_name) {
          console.log(`   Player: ${record.player_name} (${record.player_id.substring(0, 8)}...)`);
        } else {
          console.log('   Payload:', JSON.stringify({ new: payload.new, old: payload.old }, null, 2));
        }
      }
    });

    // Join the game
    console.log(`🎯 Joining game session: ${joinCode}...`);
    const playerName = `TestPlayer-${Math.random().toString(36).substring(2, 6)}`;

    const result = await network.joinGame(joinCode, playerName);

    // Store session and player info for cleanup
    sessionId = result.session.id;
    playerRecordId = result.player.id;

    console.log(`✅ Successfully joined session!`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Player Name: ${playerName}`);
    console.log(`   Player Record ID: ${playerRecordId}`);
    console.log(`   Status: ${result.session.status}\n`);

    // Create SessionPlayersSnapshot to monitor lobby
    console.log('👥 Creating lobby snapshot...');
    snapshot = new SessionPlayersSnapshot(network, sessionId);
    await snapshot.ready();

    console.log('✅ Lobby snapshot ready\n');

    // Display current players
    displayLobby();

    // Monitor for changes
    network.on('postgres_changes', (payload) => {
      if (payload.table === 'session_players') {
        console.log(`\n🔄 Lobby updated (${payload.eventType})`);
        displayLobby();
      }
    });

    console.log('\n💡 Script is now connected. Check your browser lobby!');
    console.log('   Press Ctrl+C to leave session and exit.\n');

    // Keep the script running
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Leaving session...');
      await leaveSession();
      await cleanup();
      console.log('✅ Disconnected and exited');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await cleanup();
    process.exit(1);
  }
}

function displayLobby() {
  const players = snapshot.getPlayers();
  console.log('═══════════════════════════════════');
  console.log('📋 Current Lobby Players:');
  console.log('═══════════════════════════════════');

  if (players.size === 0) {
    console.log('   (No players)');
  } else {
    Array.from(players.values()).forEach((player, index) => {
      const isMe = player.player_id === playerId;
      const hostBadge = player.is_host ? '👑 ' : '   ';
      const meBadge = isMe ? ' ← YOU' : '';
      console.log(`${hostBadge}${index + 1}. ${player.player_name}${meBadge}`);
      console.log(`      ID: ${player.player_id.substring(0, 12)}...`);
    });
  }
  console.log('═══════════════════════════════════\n');
}

async function leaveSession() {
  if (!supabase || !sessionId || !playerRecordId) {
    console.log('⚠️  No active session to leave');
    return;
  }

  try {
    console.log('🚪 Removing player from session...');
    const { error } = await supabase
      .from('session_players')
      .delete()
      .eq('id', playerRecordId);

    if (error) {
      console.error('Failed to leave session:', error.message);
    } else {
      console.log('✅ Player removed from session');

      // Wait for postgres_changes event to propagate to browser
      console.log('⏳ Waiting for browser to update...');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error('Error leaving session:', err.message);
  }
}

async function cleanup() {
  if (snapshot) {
    snapshot.destroy();
  }
  if (network) {
    network.disconnect();
  }
}

// Run the script
main();
