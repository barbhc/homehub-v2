/**
 * Ask general-guidance eval — when a home has nothing Ask can read, is the
 * general answer short, fitted to the home, honest, and safe? Goldens:
 * goldens.json (13 cases, 3 hazardous). Scorer: askGeneral.ts.
 *
 * OFFLINE (the default — free: no key, no network)
 *
 *   npm run eval:ask-general
 *
 *   Checks the goldens and that every request chatQuery would send carries the
 *   safety rules, the question and the home facts, and attaches no document.
 *
 * LIVE (costs money — 13 Sonnet 5 calls with no PDFs, about $0.10 in all)
 *
 *   ANTHROPIC_API_KEY=… npm run eval:ask-general -- --live [--only=<case id>]
 *
 *   Sends each case once with the request chatQuery builds, scores it, prints
 *   why each failure failed, and writes the answers to runs/ (committed: the
 *   score is reproducible from them). Exit 1 unless every case passes.
 *
 * RESCORE (free): npm run eval:ask-general -- --rescore=evals/ask-general/runs/<file>.json
 */
import Anthropic from "@anthropic-ai/sdk"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { usageCost, type UsageNumbers } from "../../scripts/chat-eval/chatEval.js"
import { generalGoldenProblems, generalRequest, generalRequestProblems, parseGeneralGoldens, scoreGeneralAnswer, wordCount } from "./askGeneral.js"

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const live = args.includes("--live")
const rescore = args.find((a) => a.startsWith("--rescore="))?.slice("--rescore=".length)
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length)

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

const goldens = parseGeneralGoldens(JSON.parse(readFileSync(join(HERE, "goldens.json"), "utf8")))
const structural = generalGoldenProblems(goldens)
if (structural.length > 0) fail(`goldens.json: ${structural.join("; ")}`)
const targets = goldens.cases.filter((c) => !only || c.id === only)
if (targets.length === 0) fail(`no case named ${JSON.stringify(only)}`)

interface CaseResult { id: string; kind: string; question: string; pass: boolean; failures: string[]; stopReason: string | null; words: number; usage: UsageNumbers; cost: number; answer: string; error?: string }

function offline(): void {
  let problems = 0
  for (const c of targets) {
    const found = generalRequestProblems(c)
    problems += found.length
    console.log(`  ${found.length === 0 ? "✓" : "✗"} ${c.kind.padEnd(9)} ${c.id.padEnd(26)}${found.length ? ` — ${found.join("; ")}` : ""}`)
  }
  if (problems > 0) fail(`ask-general (offline): ${problems} problem(s)`)
  console.log(`\n✓ ask-general (offline): ${targets.length}/${targets.length} requests carry the safety rules, the question and the home facts\n`)
}

function report(results: CaseResult[], model: string, spent: number, out: string | null): void {
  const passed = results.filter((r) => r.pass).length
  console.log(`\n━━ ${passed}/${results.length} passed · spent $${spent.toFixed(3)} · ${model}`)
  if (out) console.log(`  answers: ${out}`)
  console.log("")
  if (passed < results.length) process.exit(1)
}

async function liveRun(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) fail("--live needs ANTHROPIC_API_KEY in the environment (it is never read from a file here).")
  const client = new Anthropic({ apiKey })
  const results: CaseResult[] = []
  let model = ""
  console.log(`\n━━ ask-general, LIVE — ${targets.length} case(s) ━━\n`)
  for (const c of targets) {
    const { params } = generalRequest(c)
    model = params.model
    const zero: UsageNumbers = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }
    try {
      const msg = await client.messages.stream(params).finalMessage()
      const answer = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("")
      const usage: UsageNumbers = {
        input_tokens: msg.usage.input_tokens,
        cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
        output_tokens: msg.usage.output_tokens,
      }
      const score = msg.stop_reason === "refusal" ? { pass: false, failures: ["the model declined"] } : scoreGeneralAnswer(c, answer, goldens)
      const r: CaseResult = { id: c.id, kind: c.kind, question: c.question, ...score, stopReason: msg.stop_reason, words: wordCount(answer), usage, cost: usageCost(usage).actual, answer }
      results.push(r)
      console.log(`  ${r.pass ? "✓" : "✗"} ${c.kind.padEnd(9)} ${c.id.padEnd(26)} ${String(r.words).padStart(3)} words · $${r.cost.toFixed(4)}${r.failures.length ? ` — ${r.failures.join("; ")}` : ""}`)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      results.push({ id: c.id, kind: c.kind, question: c.question, pass: false, failures: ["API error"], stopReason: null, words: 0, usage: zero, cost: 0, answer: "", error })
      console.error(`  ✗ ${c.kind.padEnd(9)} ${c.id.padEnd(26)} API error: ${error.slice(0, 300)}`)
    }
  }
  const spent = results.reduce((n, r) => n + r.cost, 0)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  mkdirSync(join(HERE, "runs"), { recursive: true })
  const out = join(HERE, "runs", `ask-general.${stamp}.json`)
  writeFileSync(out, JSON.stringify({ summary: { model, passed: results.filter((r) => r.pass).length, total: results.length, spent }, results }, null, 2) + "\n")
  report(results, model, spent, out)
}

function rescoreRun(path: string): void {
  const saved = JSON.parse(readFileSync(path, "utf8")) as { summary: { model: string }; results: CaseResult[] }
  const results = saved.results
    .filter((r) => targets.some((c) => c.id === r.id))
    .map((r) => ({ ...r, ...scoreGeneralAnswer(targets.find((c) => c.id === r.id)!, r.answer, goldens) }))
  for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.kind.padEnd(9)} ${r.id.padEnd(26)}${r.failures.length ? ` — ${r.failures.join("; ")}` : ""}`)
  report(results, saved.summary.model, 0, null)
}

if (rescore) rescoreRun(rescore)
else if (live) await liveRun()
else offline()
