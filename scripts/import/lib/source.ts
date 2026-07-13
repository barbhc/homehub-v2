/**
 * v1 Supabase SOURCE client (read-only). Uses the service-role key so RLS is
 * bypassed — we read every row regardless of the caller. We NEVER write here.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { requireEnv } from "./env.js"

let client: SupabaseClient | null = null
export function source(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

/** Fetch every row of a table, paginating past Supabase's 1000-row cap. Returns
 *  [] if the table doesn't exist (older v1 schemas may lack aux tables). */
export async function fetchAll<T = Record<string, unknown>>(table: string): Promise<T[]> {
  const db = source()
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select("*").range(from, from + PAGE - 1)
    if (error) {
      // Missing table / relation → treat as empty (schema drift is expected across the ~20 tables).
      if (/does not exist|relation|not found/i.test(error.message)) {
        if (from === 0) console.warn(`  · ${table}: not present in source (skipping)`)
        return out
      }
      throw new Error(`source ${table}: ${error.message}`)
    }
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

/** List every user in v1 Supabase Auth (admin API; paginated). */
export async function listAuthUsers(): Promise<Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>> {
  const db = source()
  const out: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }> = []
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`source auth: ${error.message}`)
    out.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? undefined, user_metadata: u.user_metadata })))
    if (data.users.length < 1000) break
  }
  return out
}
