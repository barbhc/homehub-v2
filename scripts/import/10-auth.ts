/**
 * 10-auth — import v1 Supabase Auth users into v2 Firebase Auth, PRESERVING each
 * user's uid so every `user_id` reference in the data import (members, assignees,
 * createdBy) stays valid.
 *
 * Passwords are NOT copied by default: the Supabase JS admin API doesn't expose
 * bcrypt hashes, so users are created with their uid + verified email and NO
 * password. They sign in via the magic-link or "forgot password" flow (both are
 * live in the v2 auth module) on first use.
 *
 * OPTIONAL password preservation: if you can export the bcrypt hashes from
 * Supabase (`select id, encrypted_password from auth.users`), firebase-admin
 * supports `importUsers([...], { hash: { algorithm: "BCRYPT" } })` — see the
 * README "Password preservation" note. This script uses the no-password path.
 *
 *   CONFIRM=IMPORT npx tsx scripts/import/10-auth.ts
 */
import { banner, DRY_RUN } from "./lib/env.js"
import { listAuthUsers } from "./lib/source.js"
import { auth } from "./lib/target.js"

async function main(): Promise<void> {
  banner("10-auth")
  const users = await listAuthUsers()
  console.log(`Source has ${users.length} auth user(s).`)

  let created = 0
  let updated = 0
  let skipped = 0
  for (const u of users) {
    if (!u.email) {
      console.warn(`  · ${u.id}: no email — skipping (Firebase requires an identifier)`)
      skipped++
      continue
    }
    if (DRY_RUN) {
      console.log(`  would import ${u.email} (uid ${u.id})`)
      continue
    }
    try {
      await auth().createUser({ uid: u.id, email: u.email, emailVerified: true })
      created++
    } catch (e) {
      // uid or email already exists → make it idempotent by updating in place.
      if ((e as { code?: string })?.code === "auth/uid-already-exists" || (e as { code?: string })?.code === "auth/email-already-exists") {
        await auth().updateUser(u.id, { email: u.email, emailVerified: true }).catch(() => {})
        updated++
      } else {
        throw e
      }
    }
  }

  console.log(
    DRY_RUN
      ? `\n(dry run) would import ${users.length - skipped} user(s).`
      : `\n✓ auth import: ${created} created, ${updated} updated, ${skipped} skipped.\n  Users set their password via "forgot password" / magic link on first sign-in.`
  )
}

main().then(() => process.exit(0)).catch((e) => { console.error("\n✖ Auth import failed:", e); process.exit(1) })
