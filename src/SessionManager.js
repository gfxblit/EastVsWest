/**
 * Session Manager
 * Handles game session lifecycle (hosting, joining, max players enforcement)
 */
import { CONFIG } from './config.js';

export class SessionManager {
    constructor(supabase, network) {
        this.supabase = supabase;
        this.network = network;
    }

    async hostGame(playerName) {
        if (!this.supabase) throw new Error('Supabase client not initialized.');
        if (!this.network.playerId) throw new Error('Player ID not set.');

        const newJoinCode = this.generateJoinCode();
        const channelName = `game_session:${newJoinCode}`;

        const { data: sessionData, error: sessionError } = await this.supabase
            .from('game_sessions')
            .insert({
                join_code: newJoinCode,
                host_id: this.network.playerId,
                realtime_channel_name: channelName,
            })
            .select()
            .single();

        if (sessionError) throw sessionError;

        this.network.sessionId = sessionData.id;
        this.network.isHost = true;
        this.network.joinCode = newJoinCode;
        this.network.hostId = this.network.playerId;

        // Subscribe to channel and postgres changes
        await this.network._subscribeToChannel(channelName);

        const { data: playerRecord, error: playerError } = await this.supabase
            .from('session_players')
            .insert({
                session_id: this.network.sessionId,
                player_id: this.network.playerId,
                player_name: playerName,
                is_host: true,
                position_x: CONFIG.WORLD.WIDTH / 2,
                position_y: CONFIG.WORLD.HEIGHT / 2,
                equipped_weapon: 'fist',
            })
            .select()
            .single();

        if (playerError) throw playerError;

        return { session: sessionData, player: playerRecord };
    }

    async joinGame(joinCode, playerName) {
        if (!this.supabase) throw new Error('Supabase client not initialized.');
        if (!this.network.playerId) throw new Error('Player ID not set.');

        // 1. Get session info via RPC
        const { data: sessionData, error: sessionError } = await this.supabase
            .rpc('get_session_by_join_code', { p_join_code: joinCode });

        if (sessionError) throw sessionError;
        if (!sessionData || sessionData.length === 0) throw new Error('Session not found');

        const session = sessionData[0];
        if (session.status !== 'lobby') throw new Error('Session is not joinable.');

        this.network.sessionId = session.id;
        this.network.isHost = false;
        this.network.joinCode = joinCode;
        this.network.hostId = session.host_id;

        // 2. Client-authoritative join: Self-insert into session_players FIRST
        let playerRecord;

        const { data: newPlayerRecord, error: insertError } = await this.supabase
            .from('session_players')
            .insert({
                session_id: this.network.sessionId,
                player_id: this.network.playerId,
                player_name: playerName,
                is_host: false,
                position_x: CONFIG.WORLD.WIDTH / 2,
                position_y: CONFIG.WORLD.HEIGHT / 2,
                equipped_weapon: 'fist',
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === '23505') { // Unique constraint violation
                console.log('Player already in session. Reconnecting...');
                const { data: existingPlayer, error: fetchError } = await this.supabase
                    .from('session_players')
                    .select('*')
                    .eq('session_id', this.network.sessionId)
                    .eq('player_id', this.network.playerId)
                    .single();

                if (fetchError) throw fetchError;
                playerRecord = existingPlayer;
            } else {
                throw insertError;
            }
        } else {
            playerRecord = newPlayerRecord;
        }

        // 3. Subscribe to channel and postgres changes
        await this.network._subscribeToChannel(session.realtime_channel_name);

        this.network.connected = true;

        return {
            session,
            player: playerRecord
        };
    }

    async leaveGame() {
        if (!this.supabase || !this.network.sessionId) {
            this.network.disconnect();
            return;
        }

        try {
            if (this.network.isHost) {
                // Broadcast session termination to all clients before deleting
                this.network.send('session_terminated', {
                    reason: 'host_left',
                    message: 'The host has left the game. The session has ended.'
                });

                const { error } = await this.supabase
                    .from('game_sessions')
                    .delete()
                    .eq('id', this.network.sessionId);
                if (error) throw error;
            } else {
                const { error } = await this.supabase
                    .from('session_players')
                    .delete()
                    .eq('session_id', this.network.sessionId)
                    .eq('player_id', this.network.playerId);
                if (error) throw error;
            }
        } catch (error) {
            console.error('Error leaving game:', error.message);
        } finally {
            this.network.disconnect();
        }
    }

    async enforceMaxPlayers() {
        if (!this.network.isHost || !this.network.sessionId) return;

        // Get current players sorted by join time from database
        const { data: players, error: playersError } = await this.supabase
          .from('session_players')
          .select('*')
          .eq('session_id', this.network.sessionId)
          .order('joined_at', { ascending: true });

        if (playersError) {
          console.error(`Failed to fetch players for max enforcement: ${playersError.message}`);
          return;
        }

        const { data: session } = await this.supabase
          .from('game_sessions')
          .select('max_players')
          .eq('id', this.network.sessionId)
          .single();

        if (!session) {
            console.error('Failed to fetch session for max enforcement');
            return;
        }

        if (players.length > session.max_players) {
          console.log(`Host: Session full (${players.length}/${session.max_players}). Evicting latest joiners.`);
          const excessPlayers = players.slice(session.max_players);
          for (const p of excessPlayers) {
            await this.supabase
              .from('session_players')
              .delete()
              .eq('id', p.id);
          }
        }
    }

    async startGame() {
        if (!this.supabase || !this.network.sessionId) return;

        // 1. Get current players to see how many bots we need
        const { data: players, error: playersError } = await this.supabase
            .from('session_players')
            .select('id')
            .eq('session_id', this.network.sessionId);

        if (playersError) throw playersError;

        const playerCount = players.length;
        const minPlayers = CONFIG.GAME.MIN_PLAYERS || 4;

        if (playerCount < minPlayers) {
            const botsNeeded = minPlayers - playerCount;
            
            for (let i = 1; i <= botsNeeded; i++) {
                await this.addBot(i);
            }
        }

        // 2. Update session status to active
        const { error: updateError } = await this.supabase
            .from('game_sessions')
            .update({ status: 'active' })
            .eq('id', this.network.sessionId);

        if (updateError) throw updateError;
        
        // Broadcast start event so clients transition UI
        this.network.send('game_start', {
            timestamp: Date.now()
        });
    }

    async addBot(botNumber) {
        const botId = crypto.randomUUID();
        const botName = `Bot-${botNumber}`;
        
        // Random weapon selection
        const weaponIds = Object.keys(CONFIG.WEAPONS);
        const randomWeapon = CONFIG.WEAPONS[weaponIds[Math.floor(Math.random() * weaponIds.length)]].id;

        // Spawn bots around the center with some offset
        const offsetX = (Math.random() - 0.5) * 400;
        const offsetY = (Math.random() - 0.5) * 400;

        const { error } = await this.supabase
            .from('session_players')
            .insert({
                session_id: this.network.sessionId,
                player_id: botId,
                player_name: botName,
                is_host: false,
                is_bot: true,
                position_x: CONFIG.WORLD.WIDTH / 2 + offsetX,
                position_y: CONFIG.WORLD.HEIGHT / 2 + offsetY,
                equipped_weapon: randomWeapon,
                health: 100
            });

        if (error) {
            console.error(`Failed to add bot ${botName}:`, error.message);
        }
    }

    generateJoinCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
}
