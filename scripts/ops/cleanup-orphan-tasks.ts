/**
 * cleanup-orphan-tasks — repairs tasks left behind by deleted items.
 *
 * Until the cascade fix in itemService.softDeleteItemUnit, deleting an item set
 * deletedAt on the ITEM ONLY: its task templates and scheduled instances stayed
 * live and kept surfacing on Home/Tasks — reading as duplicates of the kept
 * item's tasks (observed in prod: a deleted duplicate "Cafe Range" still driving
 * 9 tasks alongside the real "Range").
 *
 * This sweeps every home for tasks whose itemUnitId points at a deleted or
 * missing item, archives those templates, and soft-deletes their still-OPEN
 * instances. COMPLETED instances are preserved — they're real history.
 *
 * SAFETY: dry-run by default (prints the plan, writes nothing). Apply with
 * CONFIRM=CLEANUP. Requires GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID.
 *
 * Optional: ARCHIVE_TEMPLATE=<templateId> also archives one specific template
 * (plus its open instances) — used for a hand-picked near-duplicate.
 *
 *   npx tsx scripts/ops/cleanup-orphan-tasks.ts                 # dry run
 *   CONFIRM=CLEANUP npx tsx scripts/ops/cleanup-orphan-tasks.ts
 */
import { FieldValue } from "firebase-admin/firestore"
import { db } from "../import/lib/target.js"

const APPLY = process.env.CONFIRM === "CLEANUP"
const ARCHIVE_TEMPLATE = process.env.ARCHIVE_TEMPLATE ?? ""

const OPEN = new Set(["scheduled", "snoozed"])

async function main(): Promise<void> {
  const store = db()
  console.log(`\ncleanup-orphan-tasks — ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}\n`)

  const homes = await store.collection("homes").get()
  let totalTpl = 0
  let totalInst = 0

  for (const home of homes.docs) {
    if (home.get("deletedAt") != null) continue
    const H = home.id

    const items = await store.collection(`homes/${H}/items`).get()
    const liveItemIds = new Set(items.docs.filter((d) => d.get("deletedAt") == null).map((d) => d.id))

    const tpls = await store.collection(`homes/${H}/taskTemplates`).get()
    const orphanTpls = tpls.docs.filter((d) => {
      const item = d.get("itemUnitId")
      return d.get("deletedAt") == null && item && !liveItemIds.has(item)
    })

    const insts = await store.collection(`homes/${H}/taskInstances`).get()
    const orphanInsts = insts.docs.filter((d) => {
      const item = d.get("itemUnitId")
      return d.get("deletedAt") == null && OPEN.has(d.get("status")) && item && !liveItemIds.has(item)
    })

    if (orphanTpls.length === 0 && orphanInsts.length === 0) continue

    console.log(`HOME ${H} "${home.get("name")}"`)
    console.log(`  orphan templates: ${orphanTpls.length}   orphan open instances: ${orphanInsts.length}`)
    const byItem: Record<string, number> = {}
    for (const i of orphanInsts) {
      const k = `${i.get("itemName") ?? "?"} (${String(i.get("itemUnitId")).slice(0, 8)})`
      byItem[k] = (byItem[k] ?? 0) + 1
    }
    for (const [k, v] of Object.entries(byItem)) console.log(`    ${String(v).padStart(3)}  ${k}`)
    for (const t of orphanTpls.slice(0, 8)) console.log(`    tpl "${t.get("title")}"`)

    totalTpl += orphanTpls.length
    totalInst += orphanInsts.length

    if (APPLY) {
      const batch = store.batch()
      const now = FieldValue.serverTimestamp()
      for (const t of orphanTpls) batch.set(t.ref, { isActive: false, deletedAt: now, updatedAt: now }, { merge: true })
      for (const i of orphanInsts) batch.set(i.ref, { deletedAt: now, updatedAt: now }, { merge: true })
      await batch.commit()
      console.log(`  ✓ applied`)
    }
    console.log("")
  }

  // Optional hand-picked template (a near-duplicate the owner chose to retire).
  if (ARCHIVE_TEMPLATE) {
    console.log(`Hand-picked template to archive: ${ARCHIVE_TEMPLATE}`)
    for (const home of homes.docs) {
      const ref = store.doc(`homes/${home.id}/taskTemplates/${ARCHIVE_TEMPLATE}`)
      const snap = await ref.get()
      if (!snap.exists) continue
      const open = (await store.collection(`homes/${home.id}/taskInstances`)
        .where("taskTemplateId", "==", ARCHIVE_TEMPLATE).get())
        .docs.filter((d) => d.get("deletedAt") == null && OPEN.has(d.get("status")))
      console.log(`  found in ${home.id}: "${snap.get("title")}" + ${open.length} open instance(s)`)
      if (APPLY) {
        const batch = store.batch()
        const now = FieldValue.serverTimestamp()
        batch.set(ref, { isActive: false, deletedAt: now, updatedAt: now }, { merge: true })
        for (const d of open) batch.set(d.ref, { deletedAt: now, updatedAt: now }, { merge: true })
        await batch.commit()
        console.log(`  ✓ archived`)
      }
    }
    console.log("")
  }

  console.log(`TOTAL — templates: ${totalTpl}, open instances: ${totalInst}`)
  console.log(APPLY ? "Applied.\n" : "Dry run only. Re-run with CONFIRM=CLEANUP to apply.\n")
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
