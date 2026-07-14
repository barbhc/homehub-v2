/**
 * prod-smoke — read-only production canary (Admin SDK). Run after any deploy.
 *
 * Exists because the Firestore EMULATOR does not enforce indexes: a query can
 * pass every emulator suite and still throw FAILED_PRECONDITION in prod (this
 * is exactly how the launch-day sign-in incident happened). This script runs
 * the real queries against the real project.
 *
 * Checks:
 *   1. members.uid collection-group query (the sign-in path) — retries while
 *      the index is still building, so it doubles as the "wait for index"
 *      gate between `firebase deploy --only firestore:indexes` and the
 *      functions/hosting deploy.
 *   2. Home inventory: names, item counts, member isPrimary flags.
 *   3. Replicates getPrimaryHome's pick for OWNER_EMAIL and prints the result.
 *   4. Probes the invites.token + manuals.role collection-group indexes.
 *   5. Probes the rooms(deletedAt,name) COLLECTION composite — the Items page
 *      group-by-room query; a plain-collection composite that the collectionGroup
 *      guard and the emulator both miss (the second launch index gap).
 *   6. Flags manual sourceRef paths that don't match the storage-rules shapes.
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID (+ OWNER_EMAIL).
 *   npx tsx scripts/ops/prod-smoke.ts
 */
import { db, auth } from "../import/lib/target.js"

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "bcworkrelated@gmail.com"
const INDEX_RETRIES = 30
const RETRY_MS = 10_000

let failures = 0
const fail = (msg: string) => { failures++; console.error(`  ✖ ${msg}`) }
const ok = (msg: string) => console.log(`  ✓ ${msg}`)

function isIndexBuilding(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /FAILED_PRECONDITION|requires an index|currently building/i.test(msg)
}

async function main(): Promise<void> {
  console.log("\n━━ prod-smoke ━━ (read-only)\n")

  const owner = await auth().getUserByEmail(OWNER_EMAIL).catch(() => null)
  if (!owner) {
    fail(`no Firebase user for OWNER_EMAIL=${OWNER_EMAIL}`)
    process.exit(1)
  }
  console.log(`Owner: ${OWNER_EMAIL} (${owner.uid})\n`)

  // 1. The sign-in query — with retry-while-building.
  console.log("1. members.uid collection-group index (the sign-in path):")
  let memberships: Array<{ homeId: string; isPrimary: boolean }> = []
  for (let attempt = 1; ; attempt++) {
    try {
      const snap = await db().collectionGroup("members").where("uid", "==", owner.uid).get()
      memberships = snap.docs
        .map((d) => ({ homeId: d.ref.parent.parent?.id ?? "", isPrimary: !!d.get("isPrimary") }))
        .filter((m) => m.homeId)
      ok(`query succeeded — ${memberships.length} membership(s)`)
      break
    } catch (e) {
      if (isIndexBuilding(e) && attempt < INDEX_RETRIES) {
        console.log(`  … index not ready (attempt ${attempt}/${INDEX_RETRIES}) — waiting ${RETRY_MS / 1000}s`)
        await new Promise((r) => setTimeout(r, RETRY_MS))
        continue
      }
      fail(`members.uid query failed: ${e instanceof Error ? e.message : e}`)
      break
    }
  }

  // 2. Home inventory.
  console.log("\n2. Homes:")
  const homes = await db().collection("homes").get()
  const homeName = new Map<string, string>()
  for (const h of homes.docs) {
    homeName.set(h.id, String(h.get("name") ?? ""))
    const [items, members] = await Promise.all([
      h.ref.collection("items").count().get(),
      h.ref.collection("members").get(),
    ])
    const flags = members.docs.map((m) => `${m.get("uid") === owner.uid ? "YOU" : m.id.slice(0, 6)}${m.get("isPrimary") ? "(primary)" : ""}`).join(", ")
    console.log(`  ${String(h.get("name")).padEnd(16)} ${String(items.data().count).padStart(3)} items   members: ${flags}`)
  }

  // 3. getPrimaryHome's pick, replicated.
  console.log("\n3. getPrimaryHome pick for the owner:")
  if (memberships.length === 0) {
    fail("owner has NO memberships — sign-in would land on onboarding")
  } else {
    const chosen = memberships.find((m) => m.isPrimary) ?? memberships[0]
    const name = homeName.get(chosen.homeId) ?? chosen.homeId
    const items = await db().collection(`homes/${chosen.homeId}/items`).count().get()
    if (items.data().count > 0) ok(`would land on "${name}" (${items.data().count} items)`)
    else fail(`would land on "${name}" with 0 items — wrong home (isPrimary stamp / cleanup needed?)`)
  }

  // 4. Other collection-group indexes.
  console.log("\n4. Other collection-group indexes:")
  try {
    await db().collectionGroup("invites").where("token", "==", "smoke-probe").limit(1).get()
    ok("invites.token queryable")
  } catch (e) {
    fail(`invites.token: ${isIndexBuilding(e) ? "index missing/building" : e}`)
  }
  try {
    await db().collectionGroup("manuals").where("role", "==", "primary").limit(1).get()
    ok("manuals.role queryable")
  } catch (e) {
    fail(`manuals.role: ${isIndexBuilding(e) ? "index missing/building" : e}`)
  }

  // 5. Plain-collection composite indexes (equality + orderBy on another field).
  //    rooms(deletedAt,name) backs the Items page group-by-room query — a composite
  //    the collectionGroup guard and the emulator both miss (the second launch gap).
  console.log("\n5. Plain-collection composite indexes:")
  {
    const chosen = memberships.find((m) => m.isPrimary)?.homeId ?? memberships[0]?.homeId
    if (!chosen) {
      console.log("  · owner has no membership — skipping rooms composite probe")
    } else {
      try {
        await db().collection(`homes/${chosen}/rooms`).where("deletedAt", "==", null).orderBy("name").limit(1).get()
        ok("rooms(deletedAt,name) composite queryable")
      } catch (e) {
        fail(`rooms(deletedAt,name): ${isIndexBuilding(e) ? "index missing/building" : e}`)
      }
    }
  }

  // 6. Storage path shapes (manual sourceRefs must be writable/readable under the rules).
  console.log("\n6. Manual storage paths vs rules shapes:")
  const RULE_SHAPES = [
    /^[^/]+\/[^/]+\/[^/]+$/, //   {userId}/{itemId}/{file}
    /^photos\/[^/]+\/[^/]+\/[^/]+$/,
    /^receipts\/[^/]+\/[^/]+$/,
    /^images\/[^/]+\/[^/]+$/,
  ]
  let flagged = 0
  for (const h of homes.docs) {
    const manuals = await h.ref.collection("manuals").get()
    for (const m of manuals.docs) {
      if (m.get("sourceType") !== "upload") continue
      const p = String(m.get("sourceRef") ?? "")
      if (!RULE_SHAPES.some((re) => re.test(p))) {
        flagged++
        console.log(`  · off-shape path (read still public; new writes would be denied): ${p}`)
      }
    }
  }
  if (flagged === 0) ok("all uploaded-manual paths match the rules shapes")

  console.log(failures === 0 ? "\n✓ prod-smoke PASSED\n" : `\n✖ prod-smoke: ${failures} failure(s)\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error("\n✖ prod-smoke crashed:", e); process.exit(1) })
