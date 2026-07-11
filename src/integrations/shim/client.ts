import { createClient } from "@supabase/supabase-js"

/**
 * TEMPORARY BACKEND SHIM — Phase 1 scaffold only.
 *
 * Keeps every v1 service compiling and the app booting while the service layer
 * is swapped to Firestore module-by-module (implementation plan, Phase 5). Each
 * swapped service drops its import of this file; the Phase 5 gate is ZERO
 * imports of "@/integrations/shim" remaining, at which point this directory and
 * the @supabase/supabase-js dependency are deleted.
 *
 * Defaults to inert placeholder credentials so the app boots with no env —
 * services return empty/error results, which the UI already handles.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://stub-not-configured.supabase.co"
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "stub-anon-key"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
