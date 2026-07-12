/**
 * TEMPORARY BACKEND SHIM — inert stub (implementation plan, Phase 5).
 *
 * Keeps not-yet-migrated v1 services compiling and RUNNING WITHOUT NETWORK while
 * the service layer is swapped to Firebase module-by-module. Every query resolves
 * to an empty, no-error result — so a page that still calls a shimmed service
 * renders with that section EMPTY instead of crashing on a failed fetch. Each
 * swapped service drops its `@/integrations/shim` import; the Phase 5 gate is
 * ZERO such imports, at which point this directory (and @supabase/supabase-js)
 * are deleted.
 *
 * (Earlier this used a real supabase-js client against a placeholder URL, which
 * made unmigrated reads throw "TypeError: Failed to fetch" and blank whole pages
 * — the opposite of inert. This hand-written stub does no I/O.)
 */

/** Empty, successful result — shaped for both list (`data ?? []`) and single
 *  (`data as X` → null) call sites, plus count/head queries (`count` → 0). */
const RESULT = { data: null, error: null, count: 0 } as const

/** Chainable, awaitable query builder: any method returns the builder; awaiting
 *  (or .then) resolves to RESULT. Covers arbitrary .select().eq().in().order()…
 *  .single()/.maybeSingle() chains without enumerating the PostgREST surface. */
function makeBuilder(): unknown {
  const builder: unknown = new Proxy(
    { then: (resolve: (v: unknown) => void) => resolve(RESULT) },
    {
      get(target: Record<string, unknown>, prop: string | symbol) {
        if (prop === "then") return target.then
        return () => builder
      },
    }
  )
  return builder
}

const storageBucket = {
  upload: async () => RESULT,
  download: async () => RESULT,
  remove: async () => RESULT,
  list: async () => RESULT,
  createSignedUrl: async () => RESULT,
  getPublicUrl: () => ({ data: { publicUrl: "" } }),
}

// Runtime is this inert stub; the compile-time type stays `SupabaseClient` so the
// still-shimmed call sites keep their original inference (no implicit-any churn).
const stub = {
  from: () => makeBuilder(),
  rpc: async () => RESULT,
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    refreshSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: "shim: not configured" } }),
    signInWithOtp: async () => ({ data: {}, error: { message: "shim: not configured" } }),
    signInWithOAuth: async () => ({ data: {}, error: { message: "shim: not configured" } }),
    signUp: async () => ({ data: { user: null, session: null }, error: { message: "shim: not configured" } }),
    signOut: async () => ({ error: null }),
    updateUser: async () => ({ data: { user: null }, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  storage: { from: () => storageBucket },
  functions: { invoke: async () => RESULT },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => {},
}

export const supabase = stub as unknown as import("@supabase/supabase-js").SupabaseClient
