/**
 * Minimal test to isolate Supabase channel subscription timing issues.
 * 
 * This test creates a host and player channel subscription, then verifies:
 * 1. postgres_changes events are reliably received
 * 2. broadcast messages are reliably received after channel subscription
 */
import { createClient } from '@supabase/supabase-js';
import { Network } from '../src/network';
import { waitFor } from './helpers/wait-utils.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('Channel Subscription Timing', () => {
	if (!supabaseUrl || !supabaseAnonKey) {
		test.skip('Supabase environment variables not set', () => { });
		return;
	}

	let hostSupabase;
	let playerSupabase;
	let hostNetwork;
	let playerNetwork;
	let testSessionId;

	beforeAll(async () => {
		hostSupabase = createClient(supabaseUrl, supabaseAnonKey);
		playerSupabase = createClient(supabaseUrl, supabaseAnonKey);

		const { data: hostAuth } = await hostSupabase.auth.signInAnonymously();
		const { data: playerAuth } = await playerSupabase.auth.signInAnonymously();

		hostNetwork = new Network();
		hostNetwork.initialize(hostSupabase, hostAuth.user.id);

		playerNetwork = new Network();
		playerNetwork.initialize(playerSupabase, playerAuth.user.id);
	});

	afterAll(async () => {
		if (hostNetwork) hostNetwork.disconnect();
		if (playerNetwork) playerNetwork.disconnect();
		if (testSessionId) {
			await hostSupabase.from('game_sessions').delete().match({ id: testSessionId });
		}
		await hostSupabase.auth.signOut();
		await playerSupabase.auth.signOut();
	});

	test('host should receive postgres_changes INSERT when player joins', async () => {
		// Host creates game
		const { session } = await hostNetwork.hostGame('Host');
		testSessionId = session.id;

		// Track postgres_changes events on host
		const insertEvents = [];
		const handler = (payload) => {
			if (payload.eventType === 'INSERT' && payload.table === 'session_players') {
				insertEvents.push(payload);
			}
		};
		hostNetwork.on('postgres_changes', handler);

		// Player joins (with reordered subscription)
		await playerNetwork.joinGame(session.join_code, 'Player');

		// Wait for host to receive INSERT event
		await waitFor(() => {
			return insertEvents.some(e => e.new.player_id === playerNetwork.playerId);
		}, 5000);

		const playerInsertEvent = insertEvents.find(e => e.new.player_id === playerNetwork.playerId);
		expect(playerInsertEvent).toBeDefined();
		expect(playerInsertEvent.new.player_name).toBe('Player');

		hostNetwork.off('postgres_changes', handler);
	}, 10000);

	test('player should receive broadcast immediately after channel subscription', async () => {
		// Host creates game
		const { session } = await hostNetwork.hostGame('Host');
		testSessionId = session.id;

		// Track messages received by player
		const receivedMessages = [];

		// Player joins - this subscribes to channel before inserting
		await playerNetwork.joinGame(session.join_code, 'Player');

		// Setup listener on player immediately after joining
		const handler = (msg) => receivedMessages.push(msg);
		playerNetwork.on('test_message', handler);

		// Host sends message to player
		hostNetwork.send('test_message', { text: 'hello' });

		// Wait for player to receive
		await waitFor(() => receivedMessages.length > 0, 3000);

		expect(receivedMessages.length).toBe(1);
		expect(receivedMessages[0].data.text).toBe('hello');

		playerNetwork.off('test_message', handler);
	}, 10000);

	test('back-to-back message reliability', async () => {
		// This test checks if messages sent rapidly after subscription are received
		const { session } = await hostNetwork.hostGame('Host');
		testSessionId = session.id;

		const receivedMessages = [];

		await playerNetwork.joinGame(session.join_code, 'Player');

		const handler = (msg) => receivedMessages.push(msg);
		playerNetwork.on('rapid_message', handler);

		// Send 5 messages rapidly
		for (let i = 0; i < 5; i++) {
			hostNetwork.send('rapid_message', { index: i });
		}

		// Wait for all messages
		await waitFor(() => receivedMessages.length >= 5, 5000);

		expect(receivedMessages.length).toBe(5);

		playerNetwork.off('rapid_message', handler);
	}, 15000);
});
