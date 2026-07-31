/**
 * Before/after summary across the whole corpus.
 *
 * `run.ts` reports one manual at a time against its golden. When you change the
 * prompt you want the corpus-wide picture in one place: did total task count come
 * down, did essential share come down, did care_type land right, and — the safety
 * question — did any real MAINTENANCE task disappear.
 *
 * Usage (dirs of golden-shaped snapshots):
 *   npx vite-node scripts/parse-eval/compare.ts -- <before-dir> <after-dir>
 */
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, basename } from "node:path"
import { titleSimilarity, TITLE_MATCH_THRESHOLD } from "../../shared/parse/parseCore"
import { classifyTaskKind } from "../../shared/tasks/taxonomy"

type IndexRow = { title?: string; schedule?: string; tier?: string; care?: string }
type Snapshot = {
  stats?: { tasks?: { total?: number; recurring?: number; setup?: number; habits?: number; essentialShare?: number } }
  taskTitles?: string[]
  taskIndex?: IndexRow[]
}

const [beforeDir, afterDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
if (!beforeDir || !afterDir) {
  console.error("usage: compare.ts -- <before-dir> <after-dir>")
  process.exit(1)
}

function load(dir: string, name: string): Snapshot | null {
  const p = join(dir, name)
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Snapshot) : null
}

function kindOf(row: IndexRow): string {
  return classifyTaskKind({
    title: row.title ?? "",
    care_type: row.care ?? "maintenance",
    priority_tier: row.tier ?? "recommended",
    risk_level: "performance",
    schedule_type: row.schedule ?? "monthly",
  })
}

/** Pair up titles the same way the harness does, so "dropped" means the same thing. */
function pair(before: IndexRow[], after: IndexRow[]) {
  const used = new Set<number>()
  const dropped: IndexRow[] = []
  for (const b of before) {
    let best = -1, bestScore = 0
    after.forEach((a, i) => {
      if (used.has(i)) return
      const s = titleSimilarity(b.title ?? "", a.title ?? "")
      if (s > bestScore) { bestScore = s; best = i }
    })
    if (best >= 0 && bestScore >= TITLE_MATCH_THRESHOLD) used.add(best)
    else dropped.push(b)
  }
  return { dropped, added: after.filter((_, i) => !used.has(i)) }
}

// Only compare manuals in the LIVE corpus. golden/ still holds snapshots for the
// manuals lost to the v1 Supabase deletion (range-ge-gas, microwave-drawer); those
// are byte-identical in both dirs and would pad the summary with fake "no change"
// rows, understating the real effect.
const corpusNames = new Set(
  (JSON.parse(readFileSync(join(import.meta.dirname ?? ".", "corpus.json"), "utf8")) as {
    manuals: Array<{ name: string }>
  }).manuals.map((m) => `${m.name}.json`)
)
const names = readdirSync(beforeDir).filter((f) => f.endsWith(".json") && corpusNames.has(f))
const skipped = readdirSync(beforeDir).filter((f) => f.endsWith(".json") && !corpusNames.has(f))
if (skipped.length) {
  console.log(`(skipping ${skipped.length} non-corpus snapshot(s): ${skipped.map((s) => basename(s, ".json")).join(", ")})\n`)
}
let tBefore = 0, tAfter = 0, eBefore = 0, eAfter = 0, compared = 0
const droppedMaintenance: string[] = []
const droppedNoise: string[] = []

console.log("manual              tasks        essential      dropped (op/clean → intended)   dropped MAINTENANCE")
console.log("─".repeat(104))

for (const n of names) {
  const b = load(beforeDir, n), a = load(afterDir, n)
  if (!b || !a) continue
  const bt = b.stats?.tasks?.total ?? 0, at = a.stats?.tasks?.total ?? 0
  const be = b.stats?.tasks?.essentialShare ?? 0, ae = a.stats?.tasks?.essentialShare ?? 0
  const { dropped } = pair(b.taskIndex ?? [], a.taskIndex ?? [])
  const noise = dropped.filter((r) => kindOf(r) !== "maintenance")
  const maint = dropped.filter((r) => kindOf(r) === "maintenance")
  droppedNoise.push(...noise.map((r) => `${basename(n, ".json")}: ${r.title}`))
  droppedMaintenance.push(...maint.map((r) => `${basename(n, ".json")}: ${r.title} [${r.tier}/${r.care}]`))
  tBefore += bt; tAfter += at; eBefore += be; eAfter += ae; compared++
  console.log(
    `${basename(n, ".json").padEnd(19)} ${String(bt).padStart(2)} → ${String(at).padStart(2)}      ` +
    `${String(be).padStart(3)}% → ${String(ae).padStart(3)}%      ${String(noise.length).padStart(3)}                             ${String(maint.length).padStart(3)}`
  )
}

console.log("─".repeat(104))
console.log(
  `TOTAL               ${tBefore} → ${tAfter}    ` +
  `avg ${Math.round(eBefore / Math.max(compared, 1))}% → ${Math.round(eAfter / Math.max(compared, 1))}%    ` +
  `${droppedNoise.length} noise dropped              ${droppedMaintenance.length} maintenance dropped`
)

if (droppedNoise.length) {
  console.log("\nDropped operational/cleaning (the goal):")
  for (const d of droppedNoise) console.log(`  − ${d}`)
}
if (droppedMaintenance.length) {
  console.log("\n⚠ Dropped MAINTENANCE (investigate — this is the 'things disappeared' bug):")
  for (const d of droppedMaintenance) console.log(`  − ${d}`)
} else {
  console.log("\n✓ No maintenance task dropped anywhere in the corpus.")
}
process.exit(droppedMaintenance.length > 0 ? 1 : 0)
