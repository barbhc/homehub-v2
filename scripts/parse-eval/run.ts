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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildPrompt, samplingParamsFor, EXTRACTION_TOOL, extractParsedResult } from "../../shared/parse/parsePrompt"
import { titleSimilarity, TITLE_MATCH_THRESHOLD } from "../../shared/parse/parseCore"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..", "..")

// ── Env / clients ─────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      // Strip surrounding quotes — some .env files quote values ("https://…"),
      // and an unstripped quote yields a malformed URL → "fetch failed".
      const val = l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2")
      return [l.slice(0, i).trim(), val]
    })
)
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY
const STORAGE_BUCKET = env.VITE_FIREBASE_STORAGE_BUCKET || "homehub-2068d.firebasestorage.app"
// PDFs now live in v2 Firebase Storage (the v1 Supabase project was deleted).
// Auth with the admin service-account JSON — GOOGLE_APPLICATION_CREDENTIALS, else
// auto-detect the firebase-adminsdk key sitting in the repo root.
const saHit = readdirSync(ROOT).find((f) => /firebase-adminsdk.*\.json$/.test(f))
const SA_KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || (saHit ? join(ROOT, saHit) : null)
if (!ANTHROPIC_KEY || !SA_KEY_PATH) {
  console.error("Missing ANTHROPIC_API_KEY in .env, or no service-account JSON (set GOOGLE_APPLICATION_CREDENTIALS or drop the firebase-adminsdk key in the repo root)")
  process.exit(1)
}
const sa = JSON.parse(readFileSync(SA_KEY_PATH, "utf8"))
initializeApp({ credential: cert(sa), projectId: sa.project_id, storageBucket: STORAGE_BUCKET })
const db = getFirestore()
const bucket = getStorage().bucket()

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
    console.log(`\n━━ ${m.name} (${m.model}) ━━`)
    // Resolve PDF from v2 Firestore/Storage (read-only). Uploads → Storage object
    // at sourceRef; url → direct fetch (some old refs point at the dead Supabase).
    const manualSnap = await db.doc(`homes/${m.home_id}/manuals/${m.manual_id}`).get()
    if (!manualSnap.exists) { console.error(`  manual not found: homes/${m.home_id}/manuals/${m.manual_id}`); failures++; continue }
    const sourceType = String(manualSnap.get("sourceType") ?? "")
    const sourceRef = String(manualSnap.get("sourceRef") ?? "")
    let pdfBase64: string
    try {
      if (sourceType === "url") {
        const r = await fetch(sourceRef, { redirect: "follow" })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        pdfBase64 = Buffer.from(await r.arrayBuffer()).toString("base64")
      } else {
        const [buf] = await bucket.file(sourceRef).download()
        pdfBase64 = buf.toString("base64")
      }
    } catch (e) {
      console.error(`  PDF fetch failed (${sourceType}): ${e instanceof Error ? e.message : e}`); failures++; continue
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
      for (const t of tDiff.missing) console.log(`    − missing task: ${t}`)
      for (const t of tDiff.added) console.log(`    + new task: ${t}`)
      if (tDiff.missing.length > 0) failures++
    } else {
      writeFileSync(goldenPath, JSON.stringify(snapshot, null, 2))
      console.log(`  golden ${existsSync(goldenPath) ? "updated" : "written"}: golden/${m.name}.json`)
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    writeFileSync(join(HERE, "results", `${m.name}.${stamp}.json`), JSON.stringify({ meta, stats: s, parsed }, null, 2))
  }

  console.log(`\n${failures === 0 ? "✓ eval passed" : `✗ eval finished with ${failures} failure(s)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
