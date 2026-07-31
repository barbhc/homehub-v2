/**
 * Parse-manual eval harness.
 *
 * Runs the EXACT production extraction prompt (imported from
 * shared/parse/parsePrompt.ts — the single source of truth) over
 * a golden corpus of real manuals, scores the output, and diffs it against
 * committed golden snapshots. Zero database writes — PDFs are read from prod
 * storage refs, the Anthropic call happens locally, results land in
 * scripts/parse-eval/results/ (gitignored).
 *
 * Usage (vite-node resolves the TS imports):
 *   npx vite-node scripts/parse-eval/run.ts -- --list
 *   npx vite-node scripts/parse-eval/run.ts -- --only=foodcycler
 *   npx vite-node scripts/parse-eval/run.ts -- --update-golden
 *
 * Workflow: change the prompt in _shared/parsePrompt.ts → run the harness →
 * review the diff report → only then deploy parse-manual. When an intentional
 * improvement changes the snapshot, re-baseline with --update-golden.
 */
import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildPrompt, samplingParamsFor, EXTRACTION_TOOL, extractParsedResult } from "../../shared/parse/parsePrompt"
import { titleSimilarity, TITLE_MATCH_THRESHOLD } from "../../shared/parse/parseCore"
import { classifyTaskKind } from "../../shared/tasks/taxonomy"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..", "..")
/** Downloaded PDFs (gitignored) — a corpus manual can be 12MB, and a
 *  before/after prompt comparison re-reads every one of them. */
const PDF_CACHE = join(HERE, ".pdf-cache")

// ── Env / clients ─────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      // Strip surrounding quotes — a quoted value yields a malformed URL/path.
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]
    })
)
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY
// PDFs live in v2 Firebase Storage — the v1 Supabase project was DELETED, which
// is why this harness sat un-runnable (every corpus fetch was ERR_NAME_NOT_RESOLVED).
const SA_KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_APPLICATION_CREDENTIALS
if (!ANTHROPIC_KEY || !SA_KEY_PATH || !existsSync(SA_KEY_PATH)) {
  console.error(
    "Need ANTHROPIC_API_KEY in .env and a readable service-account JSON via\n" +
    "GOOGLE_APPLICATION_CREDENTIALS (env or .env)."
  )
  process.exit(1)
}
const sa = JSON.parse(readFileSync(SA_KEY_PATH, "utf8"))
initializeApp({
  credential: cert(sa),
  projectId: sa.project_id,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
})
const db = getFirestore()
const bucket = getStorage().bucket()

/**
 * Fingerprint of the prompt THIS process loaded, stamped on every result.
 *
 * Each vite-node invocation re-reads parsePrompt.ts, so a per-manual loop picks up
 * whatever the file says when that manual starts — editing the prompt, or merely
 * switching branches, mid-run yields a "baseline" where some manuals used one
 * prompt and some another. That is the worst failure this tool has: it looks
 * perfectly healthy and silently invalidates every conclusion drawn from it. (I
 * hit it twice in one session.) With the hash recorded per manual, a contaminated
 * run is detectable after the fact instead of merely regrettable.
 */
const PROMPT_HASH = createHash("sha256").update(buildPrompt()).digest("hex").slice(0, 12)

/**
 * Corpus PDF → base64, cached on disk. Reads are strictly read-only against the
 * owner's project (Firestore metadata + one Storage download); the harness never
 * writes to either.
 */
async function loadPdfBase64(homeId: string, manualId: string): Promise<string> {
  const cached = join(PDF_CACHE, `${manualId}.pdf`)
  if (existsSync(cached)) return readFileSync(cached).toString("base64")

  const snap = await db.doc(`homes/${homeId}/manuals/${manualId}`).get()
  if (!snap.exists) throw new Error(`manual not found: homes/${homeId}/manuals/${manualId}`)
  const sourceType = String(snap.get("sourceType") ?? "")
  const sourceRef = String(snap.get("sourceRef") ?? "")
  if (!sourceRef) throw new Error("manual has no sourceRef")

  let buf: Buffer
  if (sourceType === "upload") {
    const [exists] = await bucket.file(sourceRef).exists()
    if (!exists) throw new Error(`storage object missing: ${sourceRef}`)
    ;[buf] = await bucket.file(sourceRef).download()
  } else {
    if (/supabase\.co/.test(sourceRef)) {
      throw new Error("sourceRef points at the deleted v1 Supabase project — PDF unrecoverable")
    }
    const res = await fetch(sourceRef, { redirect: "follow" })
    if (!res.ok) throw new Error(`PDF fetch failed: HTTP ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
  }
  mkdirSync(PDF_CACHE, { recursive: true })
  writeFileSync(cached, buf)
  return buf.toString("base64")
}

// ── Types (loose on purpose — we're scoring raw model output) ────────────────
type RawTask = {
  title?: string; schedule_type?: string; priority_tier?: string; care_type?: string
  instructions_text?: string; justification?: string; estimated_minutes?: number
  source_page?: number; symptom_tags?: unknown[]; supplies?: unknown[]
}
type RawChunk = { title?: string; chunk_type?: string; content?: string; source_pages?: unknown[] }
type RawParse = {
  chunks?: RawChunk[]; tasks?: RawTask[]
  cleaning_guide?: unknown; warranty?: unknown
  confidence?: { overall?: number; notes?: string }
}

const HABIT_TYPES = new Set(["after_each_use", "as_needed"])
const VALID_SCHEDULES = new Set([
  "after_each_use", "weekly", "monthly", "quarterly", "semiannual",
  "annual", "seasonal", "every_n_days", "as_needed", "setup",
])

// ── Scoring ───────────────────────────────────────────────────────────────────
function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100)
}

function score(parsed: RawParse) {
  const chunks = Array.isArray(parsed.chunks) ? parsed.chunks : []
  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : []
  const chunksByType: Record<string, number> = {}
  for (const c of chunks) chunksByType[c.chunk_type ?? "?"] = (chunksByType[c.chunk_type ?? "?"] ?? 0) + 1
  const recurring = tasks.filter((t) => t.schedule_type && !HABIT_TYPES.has(t.schedule_type) && t.schedule_type !== "setup")
  const setup = tasks.filter((t) => t.schedule_type === "setup")
  const habits = tasks.filter((t) => t.schedule_type && HABIT_TYPES.has(t.schedule_type))
  const essential = tasks.filter((t) => t.priority_tier === "essential")
  return {
    chunks: { total: chunks.length, byType: chunksByType, withSourcePages: pct(chunks.filter((c) => Array.isArray(c.source_pages) && c.source_pages.length > 0).length, chunks.length) },
    tasks: {
      total: tasks.length,
      recurring: recurring.length,
      setup: setup.length,
      habits: habits.length,
      coverage: {
        instructions: pct(tasks.filter((t) => typeof t.instructions_text === "string" && t.instructions_text.length > 10).length, tasks.length),
        source_page: pct(tasks.filter((t) => typeof t.source_page === "number" && t.source_page >= 1 && t.source_page <= 500).length, tasks.length),
        justification: pct(tasks.filter((t) => typeof t.justification === "string" && t.justification.length > 5).length, tasks.length),
        minutes: pct(tasks.filter((t) => typeof t.estimated_minutes === "number").length, tasks.length),
        validSchedule: pct(tasks.filter((t) => VALID_SCHEDULES.has(t.schedule_type ?? "")).length, tasks.length),
      },
      essentialShare: pct(essential.length, tasks.length),
    },
    hasCleaningGuide: parsed.cleaning_guide != null,
    hasWarranty: parsed.warranty != null,
    confidence: parsed.confidence?.overall ?? null,
  }
}

// ── Golden comparison — uses the SAME fuzzy matcher as prod reconciliation
// (parseCore.titleSimilarity), so a "MISSING" in this report is exactly a task
// prod's rescan would fail to match.
function diffTitles(goldenTitles: string[], newTitles: string[]) {
  const matchedNew = new Set<number>()
  const missing: string[] = []
  for (const g of goldenTitles) {
    let best = -1, bestScore = 0
    newTitles.forEach((t, i) => {
      if (matchedNew.has(i)) return
      const s = titleSimilarity(g, t)
      if (s > bestScore) { bestScore = s; best = i }
    })
    if (best >= 0 && bestScore >= TITLE_MATCH_THRESHOLD) matchedNew.add(best)
    else missing.push(g)
  }
  const added = newTitles.filter((_, i) => !matchedNew.has(i))
  return { matched: goldenTitles.length - missing.length, missing, added }
}

type IndexRow = { title?: string; schedule?: string; tier?: string; care?: string }

/**
 * Label a dropped/added title with the kind the deterministic taxonomy assigns
 * it. This is the question a curation change actually has to answer: dropping
 * "Add Detergent Before Each Cycle" is the goal, dropping "Replace Carbon
 * Filters" is a regression, and a bare list of missing titles can't tell them
 * apart. `maintenance` in a MISSING list is the thing to investigate.
 */
function kindOf(title: string, row?: IndexRow): string {
  const kind = classifyTaskKind({
    title,
    care_type: row?.care ?? "maintenance",
    priority_tier: row?.tier ?? "recommended",
    risk_level: "performance",
    schedule_type: row?.schedule ?? "monthly",
  })
  return kind === "maintenance" ? "maintenance — INVESTIGATE" : `${kind} — expected`
}

/**
 * Classification drift on tasks that SURVIVED in both runs. Title-only diffing is
 * blind to the change that matters most for curation work: a task that stays but
 * moves essential → recommended, or maintenance → cleaning, is not "missing" —
 * it IS the improvement. Without this, a tier/care-type prompt change reads as a
 * clean no-op diff.
 */
function diffClassifications(golden: IndexRow[], next: IndexRow[]) {
  const usedNext = new Set<number>()
  const tierChanges: string[] = []
  const careChanges: string[] = []
  const scheduleChanges: string[] = []
  for (const g of golden) {
    let best = -1, bestScore = 0
    next.forEach((n, i) => {
      if (usedNext.has(i)) return
      const s = titleSimilarity(g.title ?? "", n.title ?? "")
      if (s > bestScore) { bestScore = s; best = i }
    })
    if (best < 0 || bestScore < TITLE_MATCH_THRESHOLD) continue
    usedNext.add(best)
    const n = next[best]
    const label = g.title ?? "?"
    if ((g.tier ?? "") !== (n.tier ?? "")) tierChanges.push(`${label}: ${g.tier} → ${n.tier}`)
    if ((g.care ?? "") !== (n.care ?? "")) careChanges.push(`${label}: ${g.care} → ${n.care}`)
    if ((g.schedule ?? "") !== (n.schedule ?? "")) scheduleChanges.push(`${label}: ${g.schedule} → ${n.schedule}`)
  }
  return { tierChanges, careChanges, scheduleChanges }
}

// ── Anthropic call (mirrors parse-manual: temp 0.1, document block, 20k out) ──
async function extract(pdfBase64: string, model: string) {
  const started = Date.now()
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      ...samplingParamsFor(model),
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      max_tokens: 20000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: buildPrompt() },
        ],
      }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const meta = {
    model,
    stopReason: data?.stop_reason ?? "?",
    inputTokens: data?.usage?.input_tokens ?? null,
    outputTokens: data?.usage?.output_tokens ?? null,
    seconds: Math.round((Date.now() - started) / 1000),
  }
  let parsed: RawParse
  try {
    // Forced-tool extraction — the API delivers already-parsed JSON.
    parsed = extractParsedResult(data) as RawParse
  } catch (e) {
    // Save the raw response so an extraction failure is debuggable — this is
    // exactly what production can't show us.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const dumpPath = join(HERE, "results", `FAILED.${stamp}.json`)
    mkdirSync(join(HERE, "results"), { recursive: true })
    writeFileSync(dumpPath, JSON.stringify(data, null, 2))
    throw new Error(`${e instanceof Error ? e.message : e} (stop ${meta.stopReason}, out ${meta.outputTokens} tok) — raw saved to ${dumpPath}`)
  }
  return { parsed, meta }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const only = args.find((a) => a.startsWith("--only="))?.slice(7)
  const updateGolden = args.includes("--update-golden")
  const corpus = JSON.parse(readFileSync(join(HERE, "corpus.json"), "utf8")) as {
    manuals: Array<{ name: string; home_id: string; manual_id: string; model: string; note?: string }>
  }
  if (args.includes("--list")) {
    for (const m of corpus.manuals) console.log(`${m.name.padEnd(20)} ${m.model.padEnd(20)} ${m.manual_id}  ${m.note ?? ""}`)
    return
  }
  const targets = corpus.manuals.filter((m) => !only || m.name === only)
  if (targets.length === 0) { console.error(`No corpus entry named "${only}"`); process.exit(1) }

  mkdirSync(join(HERE, "results"), { recursive: true })
  mkdirSync(join(HERE, "golden"), { recursive: true })
  let failures = 0

  for (const m of targets) {
    console.log(`\n━━ ${m.name} (${m.model}) · prompt ${PROMPT_HASH} ━━`)
    // Resolve PDF from v2 Firestore/Storage (read-only, disk-cached)
    let pdfBase64: string
    try {
      pdfBase64 = await loadPdfBase64(m.home_id, m.manual_id)
    } catch (e) {
      console.error(`  PDF unavailable: ${e instanceof Error ? e.message : e}`)
      failures++
      continue
    }
    console.log(`  pdf: ${Math.round(pdfBase64.length * 0.75 / 1024)} KB · extracting…`)

    let parsed: RawParse, meta: Awaited<ReturnType<typeof extract>>["meta"]
    try {
      ;({ parsed, meta } = await extract(pdfBase64, m.model))
    } catch (e) {
      console.error(`  EXTRACTION FAILED: ${e instanceof Error ? e.message : e}`)
      failures++
      continue
    }
    const s = score(parsed)
    console.log(`  ${meta.seconds}s · in ${meta.inputTokens} out ${meta.outputTokens} tok · stop ${meta.stopReason}`)
    console.log(`  chunks ${s.chunks.total} (${Object.entries(s.chunks.byType).map(([k, v]) => `${k}:${v}`).join(" ")}) · source_pages ${s.chunks.withSourcePages}%`)
    console.log(`  tasks ${s.tasks.total} (recurring ${s.tasks.recurring} · setup ${s.tasks.setup} · habit ${s.tasks.habits}) · essential ${s.tasks.essentialShare}%`)
    console.log(`  task coverage: instructions ${s.tasks.coverage.instructions}% · source_page ${s.tasks.coverage.source_page}% · justification ${s.tasks.coverage.justification}% · minutes ${s.tasks.coverage.minutes}% · schedule ${s.tasks.coverage.validSchedule}%`)
    if (meta.stopReason === "max_tokens") { console.error("  ⚠ TRUNCATED (max_tokens) — output budget exceeded"); failures++ }
    if (s.tasks.essentialShare > 40) console.warn(`  ⚠ tier inflation: ${s.tasks.essentialShare}% essential`)

    // Snapshot for goldens: titles + key classifications (stable, reviewable)
    const snapshot = {
      promptHash: PROMPT_HASH,
      stats: s,
      taskTitles: (parsed.tasks ?? []).map((t) => t.title ?? "?"),
      taskIndex: (parsed.tasks ?? []).map((t) => ({ title: t.title, schedule: t.schedule_type, tier: t.priority_tier, care: t.care_type })),
      chunkTitles: (parsed.chunks ?? []).map((c) => c.title ?? "?"),
    }

    const goldenPath = join(HERE, "golden", `${m.name}.json`)
    if (existsSync(goldenPath) && !updateGolden) {
      const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as typeof snapshot
      const tDiff = diffTitles(golden.taskTitles, snapshot.taskTitles)
      const cDiff = diffTitles(golden.chunkTitles, snapshot.chunkTitles)
      console.log(`  vs golden — tasks: ${tDiff.matched}/${golden.taskTitles.length} matched, ${tDiff.missing.length} MISSING, ${tDiff.added.length} added`)
      console.log(`  vs golden — chunks: ${cDiff.matched}/${golden.chunkTitles.length} matched, ${cDiff.missing.length} MISSING, ${cDiff.added.length} added`)
      const goldenRow = new Map((golden.taskIndex ?? []).map((r) => [r.title ?? "", r]))
      const newRow = new Map(snapshot.taskIndex.map((r) => [r.title ?? "", r]))
      for (const t of tDiff.missing) console.log(`    − missing task: ${t}  [${kindOf(t, goldenRow.get(t))}]`)
      for (const t of tDiff.added) console.log(`    + new task: ${t}  [${kindOf(t, newRow.get(t))}]`)
      const droppedMaintenance = tDiff.missing.filter((t) => /INVESTIGATE/.test(kindOf(t, goldenRow.get(t))))
      // Reclassification of surviving tasks — the signal a title-only diff misses.
      const cls = diffClassifications(golden.taskIndex ?? [], snapshot.taskIndex)
      if (cls.tierChanges.length || cls.careChanges.length || cls.scheduleChanges.length) {
        console.log(`  vs golden — reclassified: ${cls.tierChanges.length} tier, ${cls.careChanges.length} care_type, ${cls.scheduleChanges.length} schedule`)
        for (const c of cls.tierChanges) console.log(`    ~ tier  ${c}`)
        for (const c of cls.careChanges) console.log(`    ~ care  ${c}`)
        for (const c of cls.scheduleChanges) console.log(`    ~ sched ${c}`)
      }
      // A dropped OPERATIONAL/CLEANING title is the intended effect of curation;
      // a dropped MAINTENANCE title is the "things disappeared" regression. Only
      // the latter fails the gate, so an intentional curation pass can go green.
      if (droppedMaintenance.length > 0) {
        console.error(`  ✗ ${droppedMaintenance.length} MAINTENANCE task(s) dropped — regression, not curation`)
        failures++
      } else if (tDiff.missing.length > 0) {
        console.log(`  ✓ ${tDiff.missing.length} dropped title(s), all operational/cleaning — curation working as intended`)
      }
    } else {
      writeFileSync(goldenPath, JSON.stringify(snapshot, null, 2))
      console.log(`  golden ${existsSync(goldenPath) ? "updated" : "written"}: golden/${m.name}.json`)
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    writeFileSync(join(HERE, "results", `${m.name}.${stamp}.json`), JSON.stringify({ promptHash: PROMPT_HASH, meta, stats: s, parsed }, null, 2))
  }

  console.log(`\n${failures === 0 ? "✓ eval passed" : `✗ eval finished with ${failures} failure(s)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
