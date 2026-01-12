/**
 * Auth Manager
 * Handles Supabase initialization and authentication
 */
import { createClient } from '@supabase/supabase-js';

export class AuthManager {
  constructor() {
    this.supabase = null;
    this.userId = null;
  }

  async init(env = import.meta.env) {
    console.log('Creating Supabase client...');
    let supabaseUrl = env.VITE_SUPABASE_URL;
    let supabaseKey = env.VITE_SUPABASE_ANON_KEY;

    // Dynamic URL construction for development to support Tailscale/LAN/Localhost seamlessly
    if (env.DEV) {
      const currentHost = window.location.hostname;
      console.log(`Development mode detected. Current hostname: ${currentHost}`);

      // If we are on a custom hostname (like Tailscale or LAN IP), try to use that for the backend too
      // This assumes the backend is running on port 54321 on the same machine
      if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
          const dynamicUrl = `http://${currentHost}:54321`;
          console.log(`Overriding VITE_SUPABASE_URL to match hostname: ${dynamicUrl}`);
          supabaseUrl = dynamicUrl;
      }
    }

    // Fallback for local development if env vars are missing
    if ((!supabaseUrl || !supabaseKey) && env.DEV) {
      console.warn('Supabase credentials missing in env, falling back to local defaults');
      supabaseUrl = 'http://127.0.0.1:54321';
      // Default local Supabase Anon Key
      supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    }

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials in environment variables');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);

    await this.checkConnectivity(supabaseUrl, supabaseKey, env);
    await this.authenticate();

    return this.supabase;
  }

  async checkConnectivity(supabaseUrl, supabaseKey, env) {
    // Diagnostic: Check if we can actually reach the Supabase server
    console.log(`Testing connectivity to ${supabaseUrl}...`);
    try {
      // Shorter timeout for the connectivity check
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);

      // Fetch the root of the REST API to check reachability
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        signal: controller.signal,
        headers: { 'apikey': supabaseKey }
      });
      clearTimeout(id);

      if (!response.ok) {
         if (response.status === 401 || response.status === 403) {
           throw new Error('Supabase API Key (Anon Key) is invalid. Check .env.local');
         }
         console.warn('Supabase connectivity check returned non-OK status:', response.status);
      } else {
         console.log('Supabase is reachable.');
      }
    } catch (netErr) {
      console.error('Failed to reach Supabase server:', netErr);
      let errorMsg = `Cannot reach server at ${supabaseUrl}.`;

      if (env.DEV) {
        errorMsg += ' Is Supabase running? Try: npm run supabase:start';
      } else {
        errorMsg += ' Check your internet connection.';
      }

      throw new Error(errorMsg);
    }
  }

  async authenticate() {
    // Check for existing session first to support reconnection
    console.log('Checking for existing session...');
    const { data: sessionData, error: sessionError } = await this.supabase.auth.getSession();

    if (sessionData?.session?.user) {
      console.log('Found existing session, reusing user ID:', sessionData.session.user.id);
      this.userId = sessionData.session.user.id;
    } else {
      // Sign in anonymously to get an auth.uid()
      console.log('No session found. Signing in anonymously...');
      const { data: authData, error: authError } = await this.supabase.auth.signInAnonymously();
      if (authError) {
        throw new Error(`Failed to sign in anonymously: ${authError.message}`);
      }
      console.log('Signed in anonymously', authData.user.id);
      this.userId = authData.user.id;
    }
  }

  getUserId() {
    return this.userId;
  }

  getClient() {
    return this.supabase;
  }
}
