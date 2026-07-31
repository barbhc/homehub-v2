/**
 * reviewEdits — aggregates every correction made through the task-review wizard
 * into a parser-change worksheet.
 *
 * The owner is re-reviewing all items (2026-07-31) and asked for exactly this:
 * "take all of the changes, make a note of them, and at the end come up with
 * what changes are gonna happen to the parsing algorithm." Every save writes a
 * `parseFeedback` doc (source "review_save"; complaints are "complaint"), and
 * this report reads them ALL and answers:
 *
 *   1. Which FIELD moves recur (schedule→setup? tier demotions? task→tip?)
 *   2. Which exact from→to transitions, with the real titles behind each
 *   3. A drafted change list per transition family, to take to the goldens
 *      harness — the report itself never touches the prompt (non-negotiable #5).
 *
 *   npx tsx scripts/parse-eval/reviewEdits.ts                      # prod (creds)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/parse-eval/reviewEdits.ts
 *   npx tsx scripts/parse-eval/reviewEdits.ts -- --home=<homeId>   # one home only
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "demo-homehub"
  initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId })
}
const db = getFirestore()

const homeArg = process.argv.find((a) => a.startsWith("--home="))?.split("=")[1] ?? null

interface EditDetail { title: string; field: string; from: string; to: string }

/** The families a transition belongs to — each maps to one class of prompt fix. */
function familyOf(e: EditDetail): string {
  if (e.field === "schedule" && e.to === "setup") return "should-be-setup"
  if (e.field === "schedule" && e.from === "setup") return "setup-wrongly-assigned"
  if (e.field === "kind" && e.to === "tip") return "task-should-be-tip"
  if (e.field === "kind" && e.from === "tip") return "tip-should-be-task"
  if (e.field === "tier" && e.from === "essential") return "essential-inflated"
  if (e.field === "tier" && e.to === "essential") return "essential-missed"
  if (e.field === "schedule") return "cadence-wrong"
  if (e.field === "skip") return "should-not-exist"
  return `${e.field}:${e.from}→${e.to}`
}

async function main() {
  const snap = homeArg
    ? await db.collection(`homes/${homeArg}/parseFeedback`).get()
    : await db.collectionGroup("parseFeedback").get()

  const byFamily = new Map<string, { count: number; titles: Map<string, string>; transitions: Map<string, number> }>()
  let events = 0
  let totalEdits = 0

  for (const doc of snap.docs) {
    if (doc.get("deletedAt") != null) continue
    events++
    const details = (doc.get("editDetails") ?? []) as EditDetail[]
    for (const e of details) {
      totalEdits++
      const fam = familyOf(e)
      const agg = byFamily.get(fam) ?? { count: 0, titles: new Map(), transitions: new Map() }
      agg.count++
      agg.titles.set(e.title, `${e.from}→${e.to}`)
      const t = `${e.from}→${e.to}`
      agg.transitions.set(t, (agg.transitions.get(t) ?? 0) + 1)
      byFamily.set(fam, agg)
    }
  }

  const scope = homeArg ? `home ${homeArg}` : "ALL homes"
  console.log(`\n# Review-edit worksheet — ${scope}`)
  console.log(`# ${events} review events · ${totalEdits} individual corrections\n`)
  if (totalEdits === 0) {
    console.log("No corrections recorded yet. They accumulate as reviews are saved.")
    return
  }

  const ranked = [...byFamily.entries()].sort((a, b) => b[1].count - a[1].count)
  for (const [fam, agg] of ranked) {
    console.log(`## ${fam} — ${agg.count} correction${agg.count === 1 ? "" : "s"}`)
    for (const [t, n] of [...agg.transitions.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${t} ×${n}`)
    }
    const titles = [...agg.titles.entries()].slice(0, 12)
    for (const [title, move] of titles) console.log(`   · ${title}  (${move})`)
    if (agg.titles.size > titles.length) console.log(`   … and ${agg.titles.size - titles.length} more`)
    console.log("")
  }

  console.log("# Next step (never automatic): for each family above, add/strengthen a")
  console.log("# golden in scripts/parse-eval, adjust shared/parse/parsePrompt.ts, and run")
  console.log("# the harness with a CONTROL run before deciding anything shipped a change.")
}

main().catch((e) => { console.error(e); process.exit(1) })
