#!/usr/bin/env node

/**
 * Interactive Player Movement REPL
 *
 * Usage: node scripts/move-host.js
 *
 * Commands:
 *   /join <JOINCODE>  - Join a game session
 *   /left <units>     - Move left by units
 *   /right <units>    - Move right by units
 *   /up <units>       - Move up by units
 *   /down <units>     - Move down by units
 *   /pos              - Show current position
 *   /quit             - Exit the REPL
 */

import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network.js';
import { SessionPlayersSnapshot } from '../src/SessionPlayersSnapshot.js';
import * as readline from 'readline';

// Supabase configuration (local development by default)
const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Game state
let network;
let snapshot;
let supabase;
let playerId;
let sessionId;
let playerRecordId;
let currentPosition = { x: 400, y: 400 };
let currentRotation = 0;
let currentHealth = 100;
let isConnected = false;

// REPL interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

console.log('🎮 Interactive Player Movement REPL');
console.log('===================================\n');
console.log('Commands:');
console.log('  /join <JOINCODE>  - Join a game session');
console.log('  /left <units>     - Move left by units');
console.log('  /right <units>    - Move right by units');
console.log('  /up <units>       - Move up by units');
console.log('  /down <units>     - Move down by units');
console.log('  /pos              - Show current position');
console.log('  /quit             - Exit the REPL\n');

async function initializeConnection() {
  if (isConnected) {
    return;
  }

  try {
    console.log('🔌 Connecting to Supabase...');
    supabase = createClient(supabaseUrl, supabaseAnonKey);

    console.log('🔐 Authenticating...');
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

    if (authError) {
      throw new Error(`Authentication failed: ${authError.message}`);
    }

    playerId = authData.user.id;
    console.log(`✅ Authenticated as: ${playerId.substring(0, 8)}...\n`);

    network = new Network();
    network.initialize(supabase, playerId);

    isConnected = true;
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    throw error;
  }
}

async function joinSession(joinCode) {
  if (!isConnected) {
    await initializeConnection();
  }

  try {
    console.log(`🎯 Joining game session: ${joinCode}...`);
    const playerName = `REPL-${Math.random().toString(36).substring(2, 6)}`;

    const result = await network.joinGame(joinCode, playerName);

    sessionId = result.session.id;
    playerRecordId = result.player.id;

    console.log(`✅ Successfully joined session!`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Player Name: ${playerName}`);
    console.log(`   Status: ${result.session.status}`);

    // Create snapshot to sync with session
    snapshot = new SessionPlayersSnapshot(network, sessionId);
    await snapshot.ready();

    // Get initial position from database
    const players = snapshot.getPlayers();
    const myPlayer = players.get(playerId);
    if (myPlayer) {
      currentPosition.x = myPlayer.position_x || 400;
      currentPosition.y = myPlayer.position_y || 400;
      currentRotation = myPlayer.rotation || 0;
      currentHealth = myPlayer.health || 100;
    }

    console.log(`📍 Initial position: (${currentPosition.x}, ${currentPosition.y})`);
    console.log(`   Rotation: ${currentRotation.toFixed(2)}, Health: ${currentHealth}\n`);

  } catch (error) {
    console.error('❌ Failed to join session:', error.message);
  }
}

async function updatePosition(dx, dy) {
  if (!sessionId) {
    console.log('❌ Not connected to a session. Use /join <JOINCODE> first.\n');
    return;
  }

  // Update position
  currentPosition.x += dx;
  currentPosition.y += dy;

  // Update rotation based on movement direction
  if (dx !== 0 || dy !== 0) {
    currentRotation = Math.atan2(dy, dx);
  }

  console.log(`📍 New position: (${Math.round(currentPosition.x)}, ${Math.round(currentPosition.y)})`);
  console.log(`   Rotation: ${currentRotation.toFixed(2)}`);

  try {
    // Broadcast movement update via Realtime using flattened format
    network.sendMovementUpdate({
      position_x: currentPosition.x,
      position_y: currentPosition.y,
      rotation: currentRotation,
      velocity_x: 0,
      velocity_y: 0,
      health: currentHealth,
    });
    console.log('   ✅ Broadcasted via Realtime');

    // Write to database using flattened parameters
    await network.writeMovementToDB(currentPosition.x, currentPosition.y, currentRotation, 0, 0);
    console.log('   ✅ Written to database\n');

  } catch (error) {
    console.error('❌ Failed to update position:', error.message, '\n');
  }
}

function showPosition() {
  if (!sessionId) {
    console.log('❌ Not connected to a session. Use /join <JOINCODE> first.\n');
    return;
  }

  console.log(`📍 Current position: (${Math.round(currentPosition.x)}, ${Math.round(currentPosition.y)})`);
  console.log(`   Rotation: ${currentRotation.toFixed(2)}`);
  console.log(`   Health: ${currentHealth}\n`);
}

async function handleCommand(line) {
  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case '/join':
      if (args.length === 0) {
        console.log('❌ Usage: /join <JOINCODE>\n');
      } else {
        await joinSession(args[0].toUpperCase());
      }
      break;

    case '/left':
      if (args.length === 0) {
        console.log('❌ Usage: /left <units>\n');
      } else {
        const units = parseFloat(args[0]);
        if (isNaN(units)) {
          console.log('❌ Invalid number\n');
        } else {
          await updatePosition(-units, 0);
        }
      }
      break;

    case '/right':
      if (args.length === 0) {
        console.log('❌ Usage: /right <units>\n');
      } else {
        const units = parseFloat(args[0]);
        if (isNaN(units)) {
          console.log('❌ Invalid number\n');
        } else {
          await updatePosition(units, 0);
        }
      }
      break;

    case '/up':
      if (args.length === 0) {
        console.log('❌ Usage: /up <units>\n');
      } else {
        const units = parseFloat(args[0]);
        if (isNaN(units)) {
          console.log('❌ Invalid number\n');
        } else {
          await updatePosition(0, -units);
        }
      }
      break;

    case '/down':
      if (args.length === 0) {
        console.log('❌ Usage: /down <units>\n');
      } else {
        const units = parseFloat(args[0]);
        if (isNaN(units)) {
          console.log('❌ Invalid number\n');
        } else {
          await updatePosition(0, units);
        }
      }
      break;

    case '/pos':
      showPosition();
      break;

    case '/quit':
      console.log('👋 Exiting...\n');
      await cleanup();
      process.exit(0);
      break;

    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('   Type /join, /left, /right, /up, /down, /pos, or /quit\n');
  }
}

async function cleanup() {
  if (snapshot) {
    snapshot.destroy();
  }
  if (network) {
    network.disconnect();
  }
  rl.close();
}

// Handle REPL input
rl.on('line', async (line) => {
  await handleCommand(line);
  rl.prompt();
});

// Handle Ctrl+C
rl.on('SIGINT', async () => {
  console.log('\n\n👋 Exiting...');
  await cleanup();
  process.exit(0);
});

// Start the REPL
rl.prompt();
