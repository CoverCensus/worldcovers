/**
 * Supabase client is optional: only created when VITE_SUPABASE_URL and
 * VITE_SUPABASE_PUBLISHABLE_KEY are set. When not set, a no-op stub is exported
 * so the app loads without "supabaseUrl is required". Data fetching uses Django API.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const NOT_CONFIGURED = { data: null, error: { message: "Supabase is not configured. Using Django API." } };
const notConfiguredPromise = Promise.resolve(NOT_CONFIGURED);

function createStubChain() {
  return {
    select: () => createStubChain(),
    insert: () => createStubChain(),
    update: () => createStubChain(),
    delete: () => createStubChain(),
    eq: () => createStubChain(),
    order: () => createStubChain(),
    single: () => notConfiguredPromise,
    then: (onFulfilled?: (value: typeof NOT_CONFIGURED) => unknown) =>
      notConfiguredPromise.then(onFulfilled),
    catch: (fn: (err: unknown) => unknown) => notConfiguredPromise.catch(fn),
  };
}

function createNoOpClient(): ReturnType<typeof createClient<Database>> {
  const from = () => createStubChain();
  return {
    from,
    storage: {
      from: () => ({
        upload: () => notConfiguredPromise,
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    rpc: () => notConfiguredPromise,
    auth: {
      getSession: () => notConfiguredPromise,
      getUser: () => notConfiguredPromise,
      signOut: () => Promise.resolve({ error: null }),
    },
  } as ReturnType<typeof createClient<Database>>;
}

let client: ReturnType<typeof createClient<Database>>;

if (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
  client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof localStorage !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
} else {
  client = createNoOpClient();
}

export const supabase = client;
