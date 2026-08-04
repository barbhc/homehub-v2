/**
 * dedupe-tasks — retire a duplicate task template, keeping the one you name.
 *
 * Reported from a real session: the furnace carried both "Replace the Air
 * Filter" and "Filter Replacement" — the same job, parsed twice under different
 * wordings, showing up in two different rooms on the Tasks page.
 *
 * SAFETY, in order of how much it matters:
 *   · Dry run by DEFAULT. Prints the plan and writes nothing. Apply with
 *     CONFIRM=DEDUPE.
 *   · Scoped to ONE home id, passed explicitly. The owner shares this project
 *     with a friend's test home; nothing here may touch it.
 *   · SOFT delete only (isActive:false + deletedAt), the same shape the in-app
 *     review uses. Nothing is destroyed and it can be undone by clearing those
 *     two fields.
 *   · Completion history is NEVER touched. Done instances stay done — they are
 *     the record that the work happened, whatever the task was called.
 *   · Aborts if the observed titles don't match the manifest exactly, so data
 *     drift can never make it retire the wrong row.
 *
 *   FIREBASE_PROJECT_ID=homehub-2068d HOME_ID=<id> \
 *     npx tsx scripts/ops/dedupe-tasks.ts                 # dry run
 *   ... CONFIRM=DEDUPE npx tsx scripts/ops/dedupe-tasks.ts
 */
import { Timestamp } from "firebase-admin/firestore"
import { db } from "../import/lib/target.js"

const APPLY = process.env.CONFIRM === "DEDUPE"
const HOME_ID = process.env.HOME_ID
if (!HOME_ID) {
  console.error("✖ HOME_ID is required. Scope this to one home explicitly — never let it run project-wide.")
  process.exit(1)
}

/**
 * Each pair names the row to keep and the one to retire.
 *
 * Usually by TITLE. But a re-parse can emit the SAME title twice with different
 * cadences — the range carried two rows both called "Clean Burner Grates", one
 * weekly and one monthly — and a title cannot distinguish those. Those pairs are
 * addressed by document id instead, which is the only unambiguous handle.
 *
 * Either form aborts unless it resolves to exactly one keep and one retire.
 */
type Pair =
  | { keep: string; retire: string; note?: string }
  | { keepId: string; retireId: string; note?: string }

const PAIRS: Pair[] = [
  // Round 1 (applied 2026-08-03) — left here as the record of what ran.
  // { keep: "Replace the Air Filter", retire: "Filter Replacement" },

  // Round 2 — the owner's calls, 2026-08-04.
  {
    // Same title twice; only the cadence differs. Monthly is the keeper.
    keepId: "63ae043c-776f-4671-ba26-a228e8d61c36",   // Clean Burner Grates · monthly
    retireId: "zMF1Fe0xViob6faSsbg7",                 // Clean Burner Grates · weekly
    note: "Clean Burner Grates — keep monthly, drop weekly",
  },
  { keep: "Run Oven Self-Clean or Steam Clean", retire: "Steam Clean Oven" },
  { keep: "Clean the Airfoils", retire: "Clean Airfoils with Soap and Water" },
  { keep: "Check Fan Wiring", retire: "Inspect Wiring Connections" },
]

interface Row {
  id: string
  title: string
  itemUnitId: string | null
  roomId: string | null
  careType: string
  priorityTier: string
  scheduleType: string
  source: string
  manualId: string | null
  createdAt: string
}

async function loadActive(): Promise<Row[]> {
  const snap = await db()
    .collection(`homes/${HOME_ID}/taskTemplates`)
    .where("deletedAt", "==", null)
    .get()
  return snap.docs
    .filter((d) => d.get("isActive") !== false)
    .map((d) => ({
      id: d.id,
      title: String(d.get("title") ?? ""),
      itemUnitId: (d.get("itemUnitId") as string | null) ?? null,
      roomId: (d.get("roomId") as string | null) ?? null,
      careType: String(d.get("careType") ?? ""),
      priorityTier: String(d.get("priorityTier") ?? ""),
      scheduleType: String(d.get("schedule.scheduleType") ?? ""),
      source: String(d.get("source") ?? ""),
      manualId: (d.get("manualId") as string | null) ?? null,
      createdAt: (d.get("createdAt") as Timestamp | undefined)?.toDate().toISOString().slice(0, 10) ?? "?",
    }))
}

/** Open instances of a retired template must go too, or the agenda keeps showing
 *  a row whose template is gone. Done ones are history and stay. */
async function openInstances(templateId: string): Promise<{ id: string; status: string; dueDate: string }[]> {
  const snap = await db()
    .collection(`homes/${HOME_ID}/taskInstances`)
    .where("taskTemplateId", "==", templateId)
    .where("deletedAt", "==", null)
    .get()
  return snap.docs
    .map((d) => ({ id: d.id, status: String(d.get("status") ?? ""), dueDate: String(d.get("dueDate") ?? "") }))
    .filter((i) => i.status === "scheduled" || i.status === "snoozed")
}

async function countDone(templateId: string): Promise<number> {
  const snap = await db()
    .collection(`homes/${HOME_ID}/taskInstances`)
    .where("taskTemplateId", "==", templateId)
    .where("status", "==", "done")
    .get()
  return snap.size
}

async function main() {
  const home = await db().doc(`homes/${HOME_ID}`).get()
  if (!home.exists) {
    console.error(`✖ No home ${HOME_ID} in this project.`)
    process.exit(1)
  }
  console.log(`\nHome: ${home.get("name")}  (${HOME_ID})`)
  console.log(APPLY ? "MODE: APPLY — will write\n" : "MODE: dry run — writes nothing\n")

  const rows = await loadActive()
  const plan: { keep: Row; retire: Row; open: { id: string; status: string; dueDate: string }[]; done: number }[] = []

  for (const pair of PAIRS) {
    const byId = "keepId" in pair
    const keep = byId ? rows.filter((r) => r.id === pair.keepId) : rows.filter((r) => r.title === pair.keep)
    const retire = byId ? rows.filter((r) => r.id === pair.retireId) : rows.filter((r) => r.title === pair.retire)
    const label = byId ? (pair.note ?? `${pair.keepId} / ${pair.retireId}`) : `"${pair.keep}" / "${pair.retire}"`
    if (keep.length !== 1 || retire.length !== 1) {
      console.error(
        `✖ Manifest mismatch for ${label}: found ${keep.length} to keep, ${retire.length} to retire. Expected exactly 1 of each.`,
      )
      console.error("  Aborting without writing — resolve by hand rather than guessing.")
      process.exit(1)
    }
    if (keep[0].id === retire[0].id) {
      console.error(`✖ ${label} resolves to the SAME row. Refusing to retire the row being kept.`)
      process.exit(1)
    }
    plan.push({
      keep: keep[0],
      retire: retire[0],
      open: await openInstances(retire[0].id),
      done: await countDone(retire[0].id),
    })
  }

  for (const p of plan) {
    const f = (r: Row) =>
      `      id=${r.id}\n      item=${r.itemUnitId ?? "(none)"}  room=${r.roomId ?? "(none)"}\n      ${r.careType}/${r.priorityTier}/${r.scheduleType}  source=${r.source}  manual=${p.keep.manualId ?? "(none)"}  created=${r.createdAt}`
    console.log(`  KEEP    "${p.keep.title}"\n${f(p.keep)}`)
    console.log(`  RETIRE  "${p.retire.title}"\n${f(p.retire)}`)
    console.log(`      open instances to close: ${p.open.length}${p.open.length ? ` (${p.open.map((i) => `${i.status} ${i.dueDate}`).join(", ")})` : ""}`)
    console.log(`      completed instances KEPT as history: ${p.done}\n`)
  }

  if (!APPLY) {
    console.log("Dry run complete. Re-run with CONFIRM=DEDUPE to apply.\n")
    return
  }

  const now = Timestamp.now()
  const batch = db().batch()
  for (const p of plan) {
    batch.set(
      db().doc(`homes/${HOME_ID}/taskTemplates/${p.retire.id}`),
      { isActive: false, deletedAt: now, updatedAt: now },
      { merge: true },
    )
    for (const inst of p.open) {
      batch.set(
        db().doc(`homes/${HOME_ID}/taskInstances/${inst.id}`),
        { deletedAt: now, updatedAt: now },
        { merge: true },
      )
    }
  }
  await batch.commit()
  console.log(`✓ Retired ${plan.length} duplicate template(s) and closed ${plan.reduce((n, p) => n + p.open.length, 0)} open instance(s).`)
  console.log("  Soft delete — undo by clearing isActive/deletedAt on those docs.\n")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
