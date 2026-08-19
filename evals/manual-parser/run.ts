/**
 * Manual-parser eval — the one command.
 *
 *   npm run eval:parser                     full corpus, calls the API
 *   npm run eval:parser -- --only=dryer-lg  one manual (cheapest check)
 *   npm run eval:parser -- --offline        re-score the committed runs, $0
 *   npm run eval:parser -- --update-baseline
 *
 * Runs the EXACT production extraction path — the prompt from
 * shared/parse/parsePrompt.ts, the forced EXTRACTION_TOOL, the sampling params
 * from samplingParamsFor(), and the model pickParseModel would choose — then
 * scores the output against hand-authored expectations and prints a table.
 *
 * Zero writes to anyone's home: it reads manual metadata and one Storage object
 * per manual, and everything it produces lands in evals/manual-parser/runs/.
 */
import Anthropic from "@anthropic-ai/sdk"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildPrompt, samplingParamsFor, EXTRACTION_TOOL, extractParsedResult } from "../../shared/parse/parsePrompt.js"
import { EVAL_DIR, requireAnthropicKey } from "./lib/env.js"
import { loadPdfBase64 } from "./lib/pdf.js"
import { corpusScore, scoreManual, WEIGHTS, type Extraction, type Expectations, type ManualScore } from "./lib/score.js"

const argv = process.argv.slice(2)
const flag = (k: string) => argv.includes(`--${k}`)
const opt = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=")

const ONLY = opt("only")
const OFFLINE = flag("offline")
const UPDATE = flag("update-baseline")
const RUNS = join(EVAL_DIR, "runs")
const BASELINE = join(EVAL_DIR, "baseline.json")

/**
 * Fingerprint of the prompt THIS process loaded, stamped on every run.
 *
 * The predecessor harness was bitten twice by editing the prompt while a
 * baseline was running: each manual picks up whatever the file said when it
 * started, so half the "before" used one prompt and half another — a corrupt
 * baseline that looks perfectly healthy. With the hash recorded per manual,
 * contamination is detectable after the fact rather than merely regrettable.
 */
const PROMPT_HASH = createHash("sha256").update(buildPrompt()).digest("hex").slice(0, 12)

const corpus = JSON.parse(readFileSync(join(EVAL_DIR, "corpus", "corpus.json"), "utf8")) as {
  manuals: { name: string; appliance: string; home_id: string; manual_id: string; model: string }[]
}
const manuals = ONLY ? corpus.manuals.filter((m) => m.name === ONLY) : corpus.manuals
if (!manuals.length) {
  console.error(`no corpus manual named "${ONLY}". Known: ${corpus.manuals.map((m) => m.name).join(", ")}`)
  process.exit(2)
}

function expectationsFor(name: string): Expectations {
  return JSON.parse(readFileSync(join(EVAL_DIR, "corpus", "expectations", `${name}.json`), "utf8"))
}

/** The newest committed run for a manual, or null. */
function latestRun(name: string): (Extraction & { model?: string; promptHash?: string; at?: string }) | null {
  if (!existsSync(RUNS)) return null
  const files = readdirSync(RUNS).filter((f) => f.startsWith(`${name}.`) && f.endsWith(".json")).sort()
  if (!files.length) return null
  return JSON.parse(readFileSync(join(RUNS, files[files.length - 1]), "utf8"))
}

async function extract(m: (typeof corpus.manuals)[number]): Promise<Extraction & { model: string; promptHash: string; at: string }> {
  const client = new Anthropic({ apiKey: requireAnthropicKey() })
  const pdfBase64 = await loadPdfBase64(m.home_id, m.manual_id)
  const res = await client.messages.create({
    model: m.model,
    max_tokens: 16000,
    ...samplingParamsFor(m.model),
    tools: [EXTRACTION_TOOL as unknown as Anthropic.Tool],
    // Forced tool use, exactly as production does it. Structured output is not
    // optional here: parsing JSON out of free text is the failure class this
    // whole pipeline already eliminated, and an eval that used a softer path
    // would be measuring something the product does not do.
    tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: buildPrompt() },
        ],
      },
    ],
  })
  const parsed = extractParsedResult({ content: res.content as never }) as Extraction
  return {
    ...parsed,
    truncated: res.stop_reason === "max_tokens",
    model: m.model,
    promptHash: PROMPT_HASH,
    at: new Date().toISOString(),
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────
const scores: ManualScore[] = []
const skipped: string[] = []

for (const m of manuals) {
  const exp = expectationsFor(m.name)
  let ext: (Extraction & { model?: string; promptHash?: string }) | null

  if (OFFLINE) {
    ext = latestRun(m.name)
    if (!ext) {
      skipped.push(`${m.name} (no committed run to score — run without --offline once)`)
      continue
    }
  } else {
    process.stderr.write(`  running ${m.name} (${m.model}) … `)
    try {
      ext = await extract(m)
      mkdirSync(RUNS, { recursive: true })
      // One file per manual, overwritten. Committed on purpose: it is what
      // makes --offline reproducible, and it lets a reviewer read what the
      // model actually produced instead of taking the number on faith.
      writeFileSync(join(RUNS, `${m.name}.json`), JSON.stringify(ext, null, 1) + "\n")
      process.stderr.write(`${(ext.tasks ?? []).length} tasks, ${(ext.chunks ?? []).length} chunks\n`)
    } catch (e) {
      process.stderr.write(`FAILED\n`)
      skipped.push(`${m.name} (${e instanceof Error ? e.message : String(e)})`)
      continue
    }
  }

  scores.push(scoreManual(ext, exp))
}

// ── Report ───────────────────────────────────────────────────────────────────
const pad = (s: unknown, n: number) => String(s).padEnd(n)
const lpad = (s: unknown, n: number) => String(s).padStart(n)
const pctOf = (d: { earned: number; possible: number }) => (d.possible === 0 ? " — " : lpad(Math.round((d.earned / d.possible) * 100), 3))

console.log(`\nMANUAL-PARSER EVAL — prompt ${PROMPT_HASH}${OFFLINE ? " (offline: scoring committed runs)" : ""}\n`)
console.log(
  pad("manual", 22) + lpad("score", 6) + lpad("rcl", 5) + lpad("prc", 5) + lpad("cad", 5) +
  lpad("care", 6) + lpad("safe", 6) + lpad("strc", 6) + lpad("tier", 6) + lpad("vol", 5) + lpad("tasks", 7),
)
console.log("─".repeat(84))
for (const s of scores) {
  const d = s.dimensions
  console.log(
    pad(s.name, 22) + lpad(s.score.toFixed(1), 6) + lpad(pctOf(d.recall), 5) + lpad(pctOf(d.precision), 5) +
    lpad(pctOf(d.cadence), 5) + lpad(pctOf(d.careType), 6) + lpad(pctOf(d.safety), 6) +
    lpad(pctOf(d.structure), 6) + lpad(pctOf(d.tier), 6) + lpad(pctOf(d.volume), 5) + lpad(s.taskCount, 7),
  )
}
console.log("─".repeat(84))
const total = corpusScore(scores)
console.log(pad("CORPUS", 22) + lpad(total.toFixed(1), 6) + `   (${scores.length} manuals)`)
console.log(
  `\nweights: ${Object.entries(WEIGHTS).map(([k, v]) => `${k} ${v}`).join(", ")}` +
  `\n  rcl = must-have tasks present   prc = forbidden tasks absent   cad = manufacturer cadence kept` +
  `\n  care = care_type correct   safe = safety context kept + no hazardous DIY   strc = commitable shape` +
  `\n  "—" means the dimension does not apply to that manual and was excluded from its score.`,
)

const failing = scores.filter((s) => s.failures.length)
if (failing.length) {
  console.log(`\n${"═".repeat(84)}\nWHAT FAILED\n`)
  for (const s of failing) {
    console.log(`▸ ${s.name} (${s.score.toFixed(1)})`)
    for (const f of s.failures) console.log(`    ${f}`)
    console.log()
  }
}

const softMisses = scores.flatMap((s) => s.should.detail.map((d) => `${s.name}: ${d}`))
if (softMisses.length) {
  console.log(`SOFT COVERAGE (not scored — signal only)\n${softMisses.map((s) => `    ${s}`).join("\n")}\n`)
}
if (skipped.length) console.log(`SKIPPED\n${skipped.map((s) => `    ${s}`).join("\n")}\n`)

// ── Baseline comparison ──────────────────────────────────────────────────────
interface Baseline { corpus: number; promptHash: string; recordedAt: string; manuals: Record<string, number> }

if (UPDATE) {
  const baseline: Baseline = {
    corpus: total,
    promptHash: PROMPT_HASH,
    recordedAt: new Date().toISOString(),
    manuals: Object.fromEntries(scores.map((s) => [s.name, s.score])),
  }
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + "\n")
  console.log(`Baseline updated: corpus ${total.toFixed(1)} at prompt ${PROMPT_HASH}.`)
  console.log(`Report the delta in the PR body, per the evals rule in CLAUDE.md.`)
  process.exit(0)
}

if (existsSync(BASELINE)) {
  const base = JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline
  const delta = Math.round((total - base.corpus) * 10) / 10
  const sign = delta > 0 ? "+" : ""
  console.log(`${"═".repeat(84)}`)
  console.log(`BASELINE  corpus ${base.corpus.toFixed(1)} (prompt ${base.promptHash}, ${base.recordedAt.slice(0, 10)})`)
  console.log(`THIS RUN  corpus ${total.toFixed(1)}   Δ ${sign}${delta.toFixed(1)}`)
  if (base.promptHash !== PROMPT_HASH) {
    console.log(`\nThe prompt CHANGED since the baseline (${base.promptHash} → ${PROMPT_HASH}).`)
    console.log(`That is the point — report this delta in the PR, and --update-baseline only`)
    console.log(`once the change is deliberate and the delta is understood.`)
  }
  const moved = scores
    .map((s) => ({ name: s.name, d: Math.round((s.score - (base.manuals[s.name] ?? s.score)) * 10) / 10 }))
    .filter((x) => Math.abs(x.d) >= 0.1)
    .sort((a, b) => a.d - b.d)
  if (moved.length) {
    console.log(`\nper manual: ${moved.map((x) => `${x.name} ${x.d > 0 ? "+" : ""}${x.d}`).join(", ")}`)
  }
  // Only a REGRESSION fails the command. Run-to-run drift on this pipeline is
  // real (the predecessor harness measured 2-3 titles moving per run with
  // identical code), so a hair-trigger threshold would cry wolf until nobody
  // ran it. 2 points is comfortably outside that noise.
  const REGRESSION = -2
  if (delta <= REGRESSION) {
    console.log(`\nFAIL: corpus score fell ${Math.abs(delta)} points (threshold ${Math.abs(REGRESSION)}).`)
    process.exit(1)
  }
} else {
  console.log(`\nNo baseline yet. Record one with:  npm run eval:parser -- --update-baseline`)
}
process.exit(0)
