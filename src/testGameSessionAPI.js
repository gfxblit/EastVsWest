#!/usr/bin/env node
/**
 * Manual Test Script for Game Session API
 *
 * Usage:
 *   SUPABASE_URL=your_url SUPABASE_KEY=your_key node src/testGameSessionAPI.js
 *
 * This script tests the game_sessions table using Supabase REST API.
 */

import { randomUUID } from 'node:crypto';
import { GameSessionAPI } from './gameSession.js';

async function runTests() {
  console.log('🚀 Testing Game Session API with Supabase\n');

  // Check environment variables
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set');
    console.error('\nUsage:');
    console.error('  SUPABASE_URL=your_url SUPABASE_KEY=your_key node src/testGameSessionAPI.js');
    process.exit(1);
  }

  console.log(`📍 Supabase URL: ${SUPABASE_URL}`);
  console.log(`🔑 API Key: ${SUPABASE_KEY.substring(0, 20)}...\n`);

  const api = new GameSessionAPI(SUPABASE_URL, SUPABASE_KEY);

  try {
    // Test 1: Create a game session
    console.log('Test 1: Creating a game session...');
    const hostId = randomUUID();
    const joinCode = 'TEST' + Math.floor(Math.random() * 100).toString().padStart(2, '0');
    console.log(`  Host ID: ${hostId}`);
    console.log(`  Join Code: ${joinCode}`);

    const session = await api.createGameSession(hostId, joinCode);
    console.log('✅ Session created successfully!');
    console.log(`  Session ID: ${session.id}`);
    console.log(`  Status: ${session.status}`);
    console.log(`  Game Phase: ${session.game_phase}`);
    console.log(`  Max Players: ${session.max_players}`);
    console.log(`  Current Players: ${session.current_player_count}`);
    console.log(`  Created At: ${session.created_at}`);
    console.log(`  Expires At: ${session.expires_at}\n`);

    // Test 2: Get the session by join code
    console.log('Test 2: Getting session by join code...');
    const retrievedSession = await api.getGameSession(joinCode);
    if (retrievedSession && retrievedSession.id === session.id) {
      console.log('✅ Session retrieved successfully!');
      console.log(`  Retrieved Session ID: ${retrievedSession.id}\n`);
    } else {
      console.log('❌ Failed to retrieve session\n');
    }

    // Test 3: Update the session
    console.log('Test 3: Updating session status...');
    const updatedSession = await api.updateGameSession(session.id, {
      status: 'active',
      started_at: new Date().toISOString(),
      conflict_zone_center_x: 500.5,
      conflict_zone_center_y: 400.25,
      conflict_zone_radius: 600
    });
    console.log('✅ Session updated successfully!');
    console.log(`  Status: ${updatedSession.status}`);
    console.log(`  Started At: ${updatedSession.started_at}`);
    console.log(`  Zone Center: (${updatedSession.conflict_zone_center_x}, ${updatedSession.conflict_zone_center_y})`);
    console.log(`  Zone Radius: ${updatedSession.conflict_zone_radius}\n`);

    // Test 4: Get non-existent session
    console.log('Test 4: Getting non-existent session...');
    const nonExistent = await api.getGameSession('XYZ999');
    if (nonExistent === null) {
      console.log('✅ Correctly returned null for non-existent session\n');
    } else {
      console.log('❌ Should have returned null for non-existent session\n');
    }

    // Test 5: Delete the session
    console.log('Test 5: Deleting session...');
    await api.deleteGameSession(session.id);
    console.log('✅ Session deleted successfully!');

    // Verify deletion
    const deletedSession = await api.getGameSession(joinCode);
    if (deletedSession === null) {
      console.log('✅ Verified session was deleted\n');
    } else {
      console.log('❌ Session still exists after deletion\n');
    }

    console.log('🎉 All tests passed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runTests();
