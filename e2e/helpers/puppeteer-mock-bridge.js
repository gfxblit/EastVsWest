import { createMockSupabase, resetMockBackend } from './mock-supabase.js';

/**
 * Injects the mock Supabase client into a Puppeteer page.
 * This sets up window.MOCK_SUPABASE_CLIENT in the browser.
 * 
 * @param {import('puppeteer').Page} page 
 */
export async function injectMockSupabase(page) {
  // We need to provide a browser-compatible version of the mock.
  // The simplest way is to evaluate a script that defines it.
  
  // Note: This implementation currently doesn't share state between multiple pages
  // if they are in different browser instances, unless we use exposeFunction to bridge back to Node.
  
  // Bridge back to Node for shared state
  const expose = async (name, fn) => {
    try {
      await page.exposeFunction(name, fn);
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }
  };

  await expose('__supabaseMock_auth_signInAnonymously', async () => {
    const client = createMockSupabase();
    return await client.auth.signInAnonymously();
  });

  await expose('__supabaseMock_db_call', async (table, query) => {
    const client = createMockSupabase();
    let builder = client.from(table);
    
    // Apply methods sequentially
    for (const step of query.steps) {
      if (step.method === 'select') builder = builder.select(step.args[0]);
      else if (step.method === 'insert') builder = builder.insert(step.args[0]);
      else if (step.method === 'update') builder = builder.update(step.args[0]);
      else if (step.method === 'delete') builder = builder.delete();
      else if (step.method === 'eq') builder = builder.eq(step.args[0], step.args[1]);
      else if (step.method === 'match') builder = builder.match(step.args[0]);
      else if (step.method === 'single') builder = builder.single();
      else if (step.method === 'order') builder = builder.order(step.args[0], step.args[1]);
      else if (step.method === 'limit') builder = builder.limit(step.args[0]);
    }
    
    return await builder;
  });

  await expose('__supabaseMock_rpc_call', async (fnName, params) => {
    const client = createMockSupabase();
    return await client.rpc(fnName, params);
  });

  // Realtime is trickier because it involves callbacks.
  // We can use a Map in Node to track callbacks by ID.
  const realtimeCallbacks = new Map();
  let nextCallbackId = 1;

  await expose('__supabaseMock_realtime_subscribe', async (channelName, callbackId) => {
    const client = createMockSupabase();
    const channel = client.channel(channelName);
    
    channel.on('broadcast', { event: 'message' }, (payload) => {
      page.evaluate((cbId, p) => {
        if (window.__supabaseMock_callbacks[cbId]) {
          window.__supabaseMock_callbacks[cbId]('broadcast', p);
        }
      }, callbackId, payload).catch(() => {}); // Ignore errors if page closed
    });

    channel.on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
       page.evaluate((cbId, p) => {
        if (window.__supabaseMock_callbacks[cbId]) {
          window.__supabaseMock_callbacks[cbId]('postgres_changes', p);
        }
      }, callbackId, payload).catch(() => {});
    });

    channel.subscribe((status) => {
       page.evaluate((cbId, s) => {
        if (window.__supabaseMock_callbacks[cbId]) {
          window.__supabaseMock_callbacks[cbId]('subscribe', s);
        }
      }, callbackId, status).catch(() => {});
    });

    // Store channel for sending
    if (!page.__mockChannels) page.__mockChannels = new Map();
    page.__mockChannels.set(channelName, channel);
    
    return 'ok';
  });

  await expose('__supabaseMock_realtime_send', async (channelName, payload) => {
    if (page.__mockChannels && page.__mockChannels.has(channelName)) {
      return await page.__mockChannels.get(channelName).send(payload);
    }
    return 'error';
  });

  // Now define the client in the browser
  await page.evaluateOnNewDocument(() => {
    window.__supabaseMock_callbacks = {};
    let nextCallbackId = 1;

    function createQueryBuilder(table) {
      const query = { steps: [] };
      const builder = {
        select: (cols) => { query.steps.push({ method: 'select', args: [cols] }); return builder; },
        insert: (data) => { query.steps.push({ method: 'insert', args: [data] }); return builder; },
        update: (data) => { query.steps.push({ method: 'update', args: [data] }); return builder; },
        delete: () => { query.steps.push({ method: 'delete', args: [] }); return builder; },
        eq: (col, val) => { query.steps.push({ method: 'eq', args: [col, val] }); return builder; },
        match: (obj) => { query.steps.push({ method: 'match', args: [obj] }); return builder; },
        single: () => { query.steps.push({ method: 'single', args: [] }); return builder; },
        order: (col, opt) => { query.steps.push({ method: 'order', args: [col, opt] }); return builder; },
        limit: (n) => { query.steps.push({ method: 'limit', args: [n] }); return builder; },
        then: (resolve, reject) => {
          window.__supabaseMock_db_call(table, query).then(resolve).catch(reject);
        }
      };
      return builder;
    }

    window.MOCK_SUPABASE_CLIENT = {
      auth: {
        signInAnonymously: () => window.__supabaseMock_auth_signInAnonymously(),
        signOut: async () => ({ error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: { id: 'mock-user' } }, error: null })
      },
      from: (table) => createQueryBuilder(table),
      rpc: (fn, params) => window.__supabaseMock_rpc_call(fn, params),
      channel: (name) => {
        const listeners = { broadcast: [], postgres_changes: [], subscribe: [] };
        const callbackId = nextCallbackId++;
        
        window.__supabaseMock_callbacks[callbackId] = (type, payload) => {
          if (type === 'broadcast') listeners.broadcast.forEach(cb => cb({ payload }));
          else if (type === 'postgres_changes') listeners.postgres_changes.forEach(cb => cb(payload));
          else if (type === 'subscribe') listeners.subscribe.forEach(cb => cb(payload));
        };

        const chan = {
          on: (type, filter, callback) => {
            const cb = typeof filter === 'function' ? filter : callback;
            listeners[type].push(cb);
            return chan;
          },
          subscribe: (callback) => {
            listeners.subscribe.push(callback);
            window.__supabaseMock_realtime_subscribe(name, callbackId);
            return chan;
          },
          send: (payload) => window.__supabaseMock_realtime_send(name, payload),
          unsubscribe: () => { delete window.__supabaseMock_callbacks[callbackId]; }
        };
        return chan;
      },
      removeChannel: (chan) => { if (chan && chan.unsubscribe) chan.unsubscribe(); }
    };
  });
}
