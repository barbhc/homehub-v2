/**
 * Corpus discovery — lists every manual in the live project with enough context
 * to decide whether it belongs in the golden set.
 *
 * This is a HUMAN's tool, not part of the scored run: you run it when you want
 * to widen the corpus, read the table, pick manuals that cover a capability the
 * corpus is missing (a gas appliance, an install/service manual, a
 * cadence-heavy one), and then hand-author their expectations.
 *
 *   npx vite-node evals/manual-parser/discover.ts
 *   npx vite-node evals/manual-parser/discover.ts -- --json
 */
import { firebase } from "./lib/env.js"
import { isCached } from "./lib/pdf.js"

const asJson = process.argv.includes("--json")
const { db, bucket } = firebase()

const snap = await db.collectionGroup("manuals").get()
type Row = {
  name: string | null
  homeId: string
  manualId: string
  category: string | null
  subType: string | null
  model: string | null
  sourceType: string | null
  pdfPages: number | null
  stage: string | null
  tasks: number | null
  inCorpus: boolean
  /** Whether the PDF can still be fetched — v1 Supabase refs are dead links. */
  source: "cached" | "storage" | "url" | "DEAD" | "none"
}

const corpus: { manuals: { manual_id: string }[] } = JSON.parse(
  await import("node:fs").then((fs) => fs.readFileSync(new URL("./corpus/corpus.json", import.meta.url), "utf8")),
)
const known = new Set(corpus.manuals.map((m) => m.manual_id))

const rows: Row[] = []
for (const doc of snap.docs) {
  const homeId = doc.ref.parent.parent!.id
  const m = doc.data()
  let item: Record<string, unknown> = {}
  if (m.itemUnitId) {
    const i = await db.doc(`homes/${homeId}/items/${m.itemUnitId}`).get()
    if (i.exists) item = i.data() ?? {}
  }
  const sourceRef = String(m.sourceRef ?? "")
  let source: Row["source"] = "none"
  if (isCached(doc.id)) source = "cached"
  else if (!sourceRef) source = "none"
  else if (/supabase\.co/.test(sourceRef)) source = "DEAD"
  else if (m.sourceType === "upload") source = (await bucket.file(sourceRef).exists())[0] ? "storage" : "DEAD"
  else source = "url"

  rows.push({
    source,
    name: (item.displayName as string) ?? (m.title as string) ?? null,
    homeId,
    manualId: doc.id,
    category: (item.itemCategory as string) ?? null,
    subType: (item.subType as string) ?? null,
    model: (item.model as string) ?? null,
    sourceType: m.sourceType ?? null,
    pdfPages: m.parse?.pdfPages ?? null,
    stage: m.parse?.stage ?? null,
    tasks: m.parse?.summary?.tasks ?? null,
    inCorpus: known.has(doc.id),
  })
}

rows.sort((a, b) => (b.pdfPages ?? 0) - (a.pdfPages ?? 0))

if (asJson) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log(`${rows.length} manuals in the project; ${rows.filter((r) => r.inCorpus).length} already in the corpus.\n`)
  const pad = (s: unknown, n: number) => String(s ?? "—").slice(0, n).padEnd(n)
  console.log(pad("", 2) + pad("appliance", 30) + pad("category/sub", 26) + pad("pdf", 9) + pad("tasks", 6) + "manualId")
  for (const r of rows) {
    console.log(
      pad(r.inCorpus ? "✓" : "", 2) +
        pad(r.name, 30) +
        pad(`${r.category ?? "—"}/${r.subType ?? "—"}`, 26) +
        pad(r.source, 9) +
        pad(r.tasks, 6) +
        r.manualId,
    )
  }
  console.log("\n✓ = already in evals/manual-parser/corpus/corpus.json")
}
process.exit(0)
