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
let playerId;

async function main() {
  try {
    // Create Supabase client
    console.log('🔌 Connecting to Supabase...');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
        if (payload.new) {
          console.log(`   Player: ${payload.new.player_name} (${payload.new.player_id.substring(0, 8)}...)`);
        }
      }
    });

    // Join the game
    console.log(`🎯 Joining game session: ${joinCode}...`);
    const playerName = `TestPlayer-${Math.random().toString(36).substring(2, 6)}`;

    const result = await network.joinGame(joinCode, playerName);

    console.log(`✅ Successfully joined session!`);
    console.log(`   Session ID: ${result.session.id}`);
    console.log(`   Player Name: ${playerName}`);
    console.log(`   Status: ${result.session.status}\n`);

    // Create SessionPlayersSnapshot to monitor lobby
    console.log('👥 Creating lobby snapshot...');
    snapshot = new SessionPlayersSnapshot(network, result.session.id);
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
    console.log('   Press Ctrl+C to disconnect and exit.\n');

    // Keep the script running
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Disconnecting...');
      await cleanup();
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
