/**
 * cleanup-homes — one-time post-import cleanup (Wave 1 of the production plan).
 *
 * Deletes the v1 test homes + the stray duplicate home created during the
 * launch-day incident, then stamps isPrimary on the owner's REAL home
 * membership (imported member docs have no isPrimary, while the stray was
 * created with isPrimary:true — without this, getPrimaryHome would pick the
 * empty stray the moment the members.uid index goes live).
 *
 * SAFETY: dry-run by default (prints the plan, writes nothing). Apply with
 * CONFIRM=CLEANUP. The manifest below matches homes by (name, itemCount) and
 * the script ABORTS if the observed set doesn't match exactly — so it can
 * never delete the wrong thing after data drift.
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID (same env as
 * the import; see scripts/import/README.md). Optional OWNER_EMAIL overrides
 * the default owner account.
 *
 *   npx tsx scripts/ops/cleanup-homes.ts              # dry run
 *   CONFIRM=CLEANUP npx tsx scripts/ops/cleanup-homes.ts
 */
import { db, auth } from "../import/lib/target.js"

const APPLY = process.env.CONFIRM === "CLEANUP"
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "bcworkrelated@gmail.com"

/** Expected homes, by (name, itemCount). Anything off-manifest aborts the run. */
const DELETE_MANIFEST = [
  { name: "SF Condo", items: 0 }, // stray duplicate from the incident
  { name: "Mission Condo", items: 1 },
  { name: "E2E Test Home", items: 6 },
  { name: "Test Home", items: 0 },
]
const KEEP_MANIFEST = [
  { name: "SF Condo", items: 25 }, // the real home — isPrimary gets stamped here
  { name: "My House", items: 3 },
]

type HomeRow = { id: string; name: string; items: number }

async function main(): Promise<void> {
  console.log(`\n━━ cleanup-homes ━━  ${APPLY ? "APPLYING (CONFIRM=CLEANUP)" : "DRY RUN (no writes — set CONFIRM=CLEANUP to apply)"}\n`)

  // Plain collection read — works even while the members.uid index is missing/building.
  const snap = await db().collection("homes").get()
  const homes: HomeRow[] = []
  for (const h of snap.docs) {
    const items = await h.ref.collection("items").count().get()
    homes.push({ id: h.id, name: String(h.get("name") ?? ""), items: items.data().count })
  }
  console.log("Observed homes:")
  for (const h of homes) console.log(`  ${h.name.padEnd(16)} ${String(h.items).padStart(3)} items   (${h.id})`)

  // Drift guard: observed set must match manifest exactly (as multisets of name/items).
  const key = (r: { name: string; items: number }) => `${r.name}::${r.items}`
  const observed = homes.map(key).sort()
  const expected = [...DELETE_MANIFEST, ...KEEP_MANIFEST].map(key).sort()
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    console.error("\n✖ ABORT: observed homes don't match the manifest — data has drifted since this script was written.")
    console.error("  expected:", expected.join(" | "))
    console.error("  observed:", observed.join(" | "))
    console.error("  Review and update the manifest before re-running.")
    process.exit(1)
  }

  const toDelete = DELETE_MANIFEST.map((m) => homes.find((h) => key(h) === key(m))!)
  const keepReal = homes.find((h) => key(h) === key(KEEP_MANIFEST[0]))! // real SF Condo

  // Owner uid for the isPrimary stamp.
  const owner = await auth().getUserByEmail(OWNER_EMAIL).catch(() => null)
  if (!owner) {
    console.error(`\n✖ ABORT: no Firebase user for OWNER_EMAIL=${OWNER_EMAIL}`)
    process.exit(1)
  }

  console.log(`\nPlan:`)
  for (const h of toDelete) console.log(`  DELETE  ${h.name} (${h.items} items, ${h.id}) — recursive`)
  console.log(`  KEEP    ${keepReal.name} (${keepReal.items} items, ${keepReal.id}) → stamp isPrimary:true for ${OWNER_EMAIL}`)
  console.log(`  KEEP    My House`)

  if (!APPLY) {
    console.log("\n(dry run) nothing written.")
    return
  }

  for (const h of toDelete) {
    await db().recursiveDelete(db().doc(`homes/${h.id}`))
    console.log(`  ✓ deleted ${h.name} (${h.id})`)
  }

  // isPrimary: true on the real home's membership; false on any other membership
  // this uid still holds (deterministic getPrimaryHome pick).
  const memberRef = db().doc(`homes/${keepReal.id}/members/${owner.uid}`)
  const member = await memberRef.get()
  if (!member.exists) {
    console.error(`  ✖ expected member doc missing at ${memberRef.path} — stamp skipped, investigate.`)
    process.exit(1)
  }
  await memberRef.set({ isPrimary: true }, { merge: true })
  const others = await db().collectionGroup("members").where("uid", "==", owner.uid).get().catch(() => null)
  if (others) {
    for (const m of others.docs) {
      if (m.ref.path !== memberRef.path) await m.ref.set({ isPrimary: false }, { merge: true })
    }
  } else {
    console.log("  · members collection-group query unavailable (index still building) — only the real membership was stamped; fine.")
  }
  console.log(`  ✓ isPrimary stamped for ${OWNER_EMAIL} on ${keepReal.name}`)

  console.log(`\n✓ Cleanup complete. NOTE: Storage objects under deleted homes are NOT removed`)
  console.log(`  (recursiveDelete is Firestore-only) — harmless orphans; remove manually if desired.`)
  console.log(`  Do NOT re-run scripts/import/20-firestore.ts — it would resurrect the deleted homes.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error("\n✖ cleanup failed:", e); process.exit(1) })
