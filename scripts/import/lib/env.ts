/**
 * Environment + safety gate for the Phase 6 import.
 *
 * All scripts are DRY-RUN by default: they read the v1 source and report what they
 * WOULD write, but touch nothing in the target until you pass `CONFIRM=IMPORT`.
 * This makes a mistaken run harmless.
 *
 * Required env (export before running — see scripts/import/README.md):
 *   Source (v1 Supabase):
 *     SUPABASE_URL                 https://<ref>.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY    service-role key (bypasses RLS; read-only use here)
 *   Target (v2 Firebase):
 *     GOOGLE_APPLICATION_CREDENTIALS   path to a service-account JSON with Firestore
 *                                      + Auth + Storage admin (firebase-admin reads it)
 *     FIREBASE_PROJECT_ID          e.g. homehub-2068d
 *     FIREBASE_STORAGE_BUCKET      e.g. homehub-2068d.firebasestorage.app (for 30-storage)
 *   Re-parse only (40-reparse):
 *     FIREBASE_WEB_API_KEY         Web API key (Firebase console → Project settings)
 *     OWNER_UID                    a member uid of every home to re-parse (usually you)
 *   Safety:
 *     CONFIRM=IMPORT               actually write (omit for a dry run)
 */

export const DRY_RUN = process.env.CONFIRM !== "IMPORT"

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`\n✖ Missing required env: ${name}\n  See scripts/import/README.md for the full list.`)
    process.exit(1)
  }
  return v
}

/** Guardrail: never let a dry-run silently look like a real import in logs. */
export function banner(script: string): void {
  console.log(`\n━━ ${script} ━━  ${DRY_RUN ? "DRY RUN (no writes — set CONFIRM=IMPORT to apply)" : "APPLYING (CONFIRM=IMPORT)"}\n`)
}
