/**
 * Emulator seed — Admin SDK port of v1's scripts/seed-test-data.ts.
 *
 * PHASE 1 SCAFFOLD: wiring + auth seeding only. The Firestore document writes
 * land with Phase 2, once docs/firestore-model.md fixes the collection shapes —
 * seeding before the model exists would freeze a guessed schema. The dataset
 * MUST stay byte-equivalent to v1's (same items/tasks/dates from
 * e2e/seed-config.ts) so the visual baselines remain comparable.
 *
 * Run with emulators up (`npm run emu`):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     npm run seed:emu
 */
import { initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { TEST_EMAIL, TEST_PASSWORD } from "../e2e/seed-config"

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    "Refusing to run: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST not set.\n" +
    "This script seeds EMULATORS ONLY — it must never touch a real project."
  )
  process.exit(1)
}

const app = initializeApp({ projectId: "demo-homehub" })
const auth = getAuth(app)
const db = getFirestore(app)

async function main() {
  // 1. Deterministic test user (same credentials the e2e fixtures sign in with).
  let uid: string
  try {
    const existing = await auth.getUserByEmail(TEST_EMAIL)
    uid = existing.uid
  } catch {
    const created = await auth.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD, emailVerified: true })
    uid = created.uid
  }
  console.log(`✓ auth user ${TEST_EMAIL} (${uid})`)

  // 2. Firestore dataset — Phase 2 (needs docs/firestore-model.md).
  //    Port v1's scripts/seed-test-data.ts entity-by-entity here: home + member,
  //    rooms, items (specs/warranty), task templates + instances with the
  //    deterministic seed-config dates, chunks, care notes, chat FAQs.
  void db
  console.log("⚠ Firestore seeding is a Phase 2 TODO (model doc first) — auth-only for now.")
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
