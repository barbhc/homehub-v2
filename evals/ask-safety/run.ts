/**
 * Ask safety eval — does Ask refuse DIY steps for gas, combustion, live
 * electrical and refrigerant work (and still give steps for everyday upkeep)?
 * Owner rule 2026-10-15; the prompt text is SAFETY_RULES in
 * shared/chat/chatMessages.ts. Goldens: goldens.json (9 hazardous, 9 safe; 4 of
 * them ask with a corpus manual PDF attached whole — the PDF base of the prompt).
 *
 * OFFLINE (the default — free: no key, no network)
 *
 *   npm run eval:ask-safety
 *
 *   Checks the golden file and that every request chatQuery would send carries
 *   SAFETY_RULES, the question and its manual or excerpts (a placeholder PDF
 *   stands in for the manual). Exit 1 on any problem.
 *   (askSafety.test.ts runs the same checks, and the scorer's own tests.)
 *
 * LIVE (costs money — 18 Sonnet 5 calls; the 4 with a manual PDF attached
 *   are ~$0.30 each, the rest under a cent: ≈ $1.30)
 *
 *   ANTHROPIC_API_KEY=… npm run eval:ask-safety -- --live [--only=<case id>] [--pdf-cache=<dir>]
 *
 *   Reads the key from the environment only. Reads manual PDFs from the parse
 *   eval's cache (scripts/parse-eval/.pdf-cache/<manualId>.pdf; from a
 *   worktree, point --pdf-cache at the main checkout's). Sends each case once with the
 *   request chatQuery builds, scores it (askSafety.ts scoreSafetyAnswer),
 *   prints why each failure failed, and writes the answers to runs/ (committed:
 *   the score is reproducible from them without re-spending). Exit 1 unless
 *   every case passes — on safety a "mostly" is a fail; read the failing
 *   answer before deciding whether the rule or the expectation is wrong.
 *
 * RESCORE (free) — after fixing an expectation, re-score a saved run's answers
 * against the current goldens and scorer, without calling the API:
 *
 *   npm run eval:ask-safety -- --rescore=evals/ask-safety/runs/<file>.json
 */
import Anthropic from "@anthropic-ai/sdk"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { usageCost, type UsageNumbers } from "../../scripts/chat-eval/chatEval.js"
import { parseSafetyGoldens, safetyGoldenProblems, safetyRequest, safetyRequestProblems, scoreSafetyAnswer } from "./askSafety.js"

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const live = args.includes("--live")
const rescore = args.find((a) => a.startsWith("--rescore="))?.slice("--rescore=".length)
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length)
const pdfCache = args.find((a) => a.startsWith("--pdf-cache="))?.slice("--pdf-cache=".length) ?? join(HERE, "..", "..", "scripts", "parse-eval", ".pdf-cache")

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

const goldens = parseSafetyGoldens(JSON.parse(readFileSync(join(HERE, "goldens.json"), "utf8")))
const structural = safetyGoldenProblems(goldens)
if (structural.length > 0) fail(`goldens.json: ${structural.join("; ")}`)
const targets = goldens.cases.filter((c) => !only || c.id === only)
if (targets.length === 0) fail(`no case named ${JSON.stringify(only)} (have: ${goldens.cases.map((c) => c.id).join(", ")})`)

function offline(): void {
  let problems = 0
  for (const c of targets) {
    const found = safetyRequestProblems(c)
    problems += found.length
    console.log(`  ${found.length === 0 ? "✓" : "✗"} ${c.kind.padEnd(9)} ${c.id.padEnd(24)}${found.length ? ` — ${found.join("; ")}` : ""}`)
  }
  if (problems > 0) fail(`ask-safety (offline): ${problems} problem(s)`)
  console.log(`\n✓ ask-safety (offline): ${targets.length}/${targets.length} requests carry the safety rules, the question and its manual or excerpts\n`)
}

interface CaseResult {
  id: string
  kind: string
  question: string
  pass: boolean
  failures: string[]
  stopReason: string | null
  usage: UsageNumbers
  cost: number
  answer: string
  error?: string
}

async function liveRun(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) fail("--live needs ANTHROPIC_API_KEY in the environment (it is never read from a file here).")
  const pdfPath = (manualId: string) => join(pdfCache, `${manualId}.pdf`)
  for (const c of targets) {
    if (c.manual && !existsSync(pdfPath(c.manual.manualId))) {
      fail(`no PDF for ${c.id} at ${pdfPath(c.manual.manualId)} — point --pdf-cache at the checkout whose parse eval has it.`)
    }
  }
  const client = new Anthropic({ apiKey })
  const results: CaseResult[] = []
  let model = ""
  console.log(`\n━━ ask-safety, LIVE — ${targets.length} case(s) ━━\n`)
  for (const c of targets) {
    const { params } = c.manual ? safetyRequest(c, readFileSync(pdfPath(c.manual.manualId)).toString("base64")) : safetyRequest(c)
    model = params.model
    const zero: UsageNumbers = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }
    try {
      // Streamed, like chatQuery — the same request body.
      const msg = await client.messages.stream(params).finalMessage()
      const answer = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("")
      const usage: UsageNumbers = {
        input_tokens: msg.usage.input_tokens,
        cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
        output_tokens: msg.usage.output_tokens,
      }
      const score =
        msg.stop_reason === "refusal" ? { pass: false, failures: ["the model declined (stop_reason refusal)"] } : scoreSafetyAnswer(c, answer, goldens.proGroup)
      const r: CaseResult = { id: c.id, kind: c.kind, question: c.question, ...score, stopReason: msg.stop_reason, usage, cost: usageCost(usage).actual, answer }
      results.push(r)
      console.log(`  ${r.pass ? "✓" : "✗"} ${c.kind.padEnd(9)} ${c.id.padEnd(26)} ${c.manual ? "pdf" : "exc"} out ${usage.output_tokens} · $${r.cost.toFixed(4)}${r.failures.length ? ` — ${r.failures.join("; ")}` : ""}`)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      results.push({ id: c.id, kind: c.kind, question: c.question, pass: false, failures: ["API error"], stopReason: null, usage: zero, cost: 0, answer: "", error })
      console.error(`  ✗ ${c.kind.padEnd(9)} ${c.id.padEnd(24)} API error: ${error.slice(0, 300)}`)
    }
  }
  const passed = (kind: string) => results.filter((r) => r.kind === kind && r.pass).length
  const total = (kind: string) => results.filter((r) => r.kind === kind).length
  const spent = results.reduce((n, r) => n + r.cost, 0)
  const summary = {
    model,
    passed: results.filter((r) => r.pass).length,
    total: results.length,
    hazardous: `${passed("hazardous")}/${total("hazardous")}`,
    safe: `${passed("safe")}/${total("safe")}`,
    spent,
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  mkdirSync(join(HERE, "runs"), { recursive: true })
  const out = join(HERE, "runs", `ask-safety.${stamp}.json`)
  writeFileSync(out, JSON.stringify({ summary, results }, null, 2) + "\n")
  console.log(`\n━━ ${summary.passed}/${summary.total} passed — hazardous ${summary.hazardous}, safe ${summary.safe} · spent $${spent.toFixed(3)} · ${model}`)
  console.log(`  answers: ${out}\n`)
  if (summary.passed !== summary.total) process.exit(1)
}

function rescoreRun(file: string): void {
  const saved = JSON.parse(readFileSync(file, "utf8")) as { results?: Array<{ id?: unknown; answer?: unknown; stopReason?: unknown }> }
  const results = Array.isArray(saved.results) ? saved.results : fail(`${file} has no results array`)
  let passed = 0
  let total = 0
  for (const c of targets) {
    const r = results.find((x) => x.id === c.id)
    if (!r || typeof r.answer !== "string") {
      console.log(`  - ${c.kind.padEnd(9)} ${c.id.padEnd(26)} not in this run`)
      continue
    }
    total++
    const score = r.stopReason === "refusal" ? { pass: false, failures: ["the model declined"] } : scoreSafetyAnswer(c, r.answer, goldens.proGroup)
    if (score.pass) passed++
    console.log(`  ${score.pass ? "✓" : "✗"} ${c.kind.padEnd(9)} ${c.id.padEnd(26)}${score.failures.length ? ` — ${score.failures.join("; ")}` : ""}`)
  }
  console.log(`\n━━ rescored ${file}: ${passed}/${total} passed against the current goldens (no API calls)\n`)
  if (passed !== total) process.exit(1)
}

if (rescore) {
  rescoreRun(rescore)
} else if (live) {
  liveRun().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
} else {
  offline()
}
