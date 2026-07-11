/**
 * App-facing user shape. Populated from the Firebase user but exposes only the
 * fields the app actually reads (`id`, `email`, `user_metadata.full_name`), so the
 * Supabase→Firebase auth swap needs ZERO consumer changes — `user.id` stays
 * `user.id` (mapped from the Firebase `uid`).
 */
export type AuthUser = {
  id: string
  email: string | null
  user_metadata?: { full_name?: string | null }
}
