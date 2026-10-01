/**
 * Ask (chatQuery) eval — the chat path had none (BACKLOG §7.3), and prompt
 * caching moves the manual PDFs from the latest user turn to the first one.
 *
 * OFFLINE (the default — free: no key, no network, no PDFs)
 *
 *   npx vite-node scripts/chat-eval/run.ts
 *
 *   Builds the exact request chatQuery would send for each of the 10 goldens
 *   (goldens.json) with the builder chatQuery itself uses, and checks: the PDF
 *   leads the first user turn with the one cache breakpoint; the question is
 *   the last block; the system text is byte-identical to main's
 *   (shared/chat/__tests__/fixtures/main-chat-requests.json); a follow-up
 *   repeats turn 1's cached prefix byte for byte. Exit 1 on any problem.
 *   (chatEval.test.ts runs the same checks under vitest.)
 *
 * LIVE (costs money — ~$4 for --layout=both; the gatekeeper runs it)
 *
 *   ANTHROPIC_API_KEY=… npx vite-node scripts/chat-eval/run.ts -- --live --layout=both
 *       [--only=<conversation id>] [--pdf-cache=<dir>]
 *
 *   Reads the key from the environment only. Reads the corpus PDFs from the
 *   parse eval's cache (scripts/parse-eval/.pdf-cache/<manual_id>.pdf; from a
 *   worktree, point --pdf-cache at the main checkout's). Sends each
 *   conversation's two turns in each layout —
 *     first-turn   this branch: PDFs in the first user turn behind the breakpoint
 *     latest-turn  main before caching (toLatestTurnLayout — proven equal to
 *                  main's own output in chatEval.test.ts)
 *   — scores every answer against its must-contain phrases, prints the token
 *   and cache numbers and the cost of each call, writes results/ (gitignored),
 *   and ends with KEEP or DROP:
 *     KEEP  first-turn passes at least as many goldens as latest-turn minus
 *           one (answers vary run to run), AND every first-turn follow-up
 *           read the PDF from the cache (cache_read_input_tokens > 0).
 *     DROP  otherwise — see the PR's "Gate" section for what to revert.
 */
import Anthropic from "@anthropic-ai/sdk"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cachedPrefix } from "../../shared/chat/chatMessages.js"
import {
  GENERAL_KNOWLEDGE_MARKER,
  goldenProblems,
  goldenRequest,
  requestShapeProblems,
  scoreAnswer,
  toLatestTurnLayout,
  usageCost,
  type Goldens,
  type Layout,
  type UsageNumbers,
} from "./chatEval.js"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..", "..")
const PLACEHOLDER_PDF = "JVBERi0xLjQK" // offline only: the shape is checked, never the content

const args = process.argv.slice(2)
const flag = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const live = args.includes("--live")
const only = flag("only")
const layoutArg = flag("layout") ?? "first-turn"
const pdfCache = flag("pdf-cache") ?? join(ROOT, "scripts", "parse-eval", ".pdf-cache")

const goldens = JSON.parse(readFileSync(join(HERE, "goldens.json"), "utf8")) as Goldens
const corpus = (JSON.parse(readFileSync(join(ROOT, "scripts", "parse-eval", "corpus.json"), "utf8")) as {
  manuals: Array<{ name: string; manual_id: string }>
}).manuals
const mainFixture = JSON.parse(readFileSync(join(ROOT, "shared", "chat", "__tests__", "fixtures", "main-chat-requests.json"), "utf8")) as {
  systemPrompts: Record<string, string>
}
const MAIN_SYSTEM = mainFixture.systemPrompts["pdf|web=0|warranty=0|notes=0"]

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

const structural = goldenProblems(goldens, corpus)
if (structural.length > 0) fail(`goldens.json: ${structural.join("; ")}`)
const targets = goldens.conversations.filter((c) => !only || c.id === only)
if (targets.length === 0) fail(`no conversation named ${JSON.stringify(only)} (have: ${goldens.conversations.map((c) => c.id).join(", ")})`)

// ── Offline ───────────────────────────────────────────────────────────────────
function offline(): void {
  console.log(`\n━━ chat eval, offline — ${targets.length} conversation(s), the request chatQuery would send ━━\n`)
  let problems = 0
  for (const c of targets) {
    const turn1Prefix = JSON.stringify(cachedPrefix(goldenRequest(c, 0, [], PLACEHOLDER_PDF).params))
    for (let i = 0; i < c.turns.length; i++) {
      const t = c.turns[i]
      const priorAnswers = c.turns.slice(0, i).map((p) => `(answer to ${p.id})`)
      const { params, meta } = goldenRequest(c, i, priorAnswers, PLACEHOLDER_PDF)
      const found = requestShapeProblems(params, t.question, MAIN_SYSTEM)
      if (i > 0 && JSON.stringify(cachedPrefix(params)) !== turn1Prefix) found.push("the follow-up does not repeat turn 1's cached prefix")
      problems += found.length
      const where = `${params.messages.length} message(s), ${meta.historyTurns} history turn(s)`
      console.log(`  ${found.length === 0 ? "✓" : "✗"} ${t.id.padEnd(28)} ${where}${found.length ? ` — ${found.join("; ")}` : ""}`)
    }
  }
  const total = targets.reduce((n, c) => n + c.turns.length, 0)
  if (problems > 0) fail(`chat eval (offline): ${problems} problem(s) across ${total} request(s)`)
  console.log(`\n✓ chat eval (offline): ${total}/${total} requests — PDF first with the cache breakpoint, question last, system text byte-identical to main, follow-ups repeat the cached prefix\n`)
}

// ── Live ──────────────────────────────────────────────────────────────────────
interface TurnResult {
  conversation: string
  turn: string
  layout: Layout
  pass: boolean
  missing: string[][]
  generalKnowledge: boolean
  stopReason: string | null
  usage: UsageNumbers
  cost: { actual: number; uncached: number }
  answer: string
  error?: string
}

async function liveRun(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) fail("--live needs ANTHROPIC_API_KEY in the environment (it is never read from a file here).")
  const layouts: Layout[] =
    layoutArg === "both" ? ["first-turn", "latest-turn"] : layoutArg === "latest-turn" ? ["latest-turn"] : layoutArg === "first-turn" ? ["first-turn"] : fail(`--layout must be first-turn, latest-turn or both (got ${layoutArg})`)
  for (const c of targets) {
    if (!existsSync(join(pdfCache, `${c.manualId}.pdf`))) {
      fail(
        `no PDF for ${c.id} at ${join(pdfCache, `${c.manualId}.pdf`)}. The chat eval reads the parse eval's cache: ` +
          "copy it from the checkout that has it (--pdf-cache=<that dir>), or run the parse eval for that manual once.",
      )
    }
  }
  const client = new Anthropic({ apiKey })
  const results: TurnResult[] = []
  console.log(`\n━━ chat eval, LIVE — ${targets.length} conversation(s) × ${layouts.join(" + ")} ━━`)
  for (const c of targets) {
    const pdf = readFileSync(join(pdfCache, `${c.manualId}.pdf`)).toString("base64")
    for (const layout of layouts) {
      console.log(`\n  ${c.id} · ${layout}`)
      const answers: string[] = []
      for (let i = 0; i < c.turns.length; i++) {
        const t = c.turns[i]
        const built = goldenRequest(c, i, answers, pdf).params
        const params = layout === "first-turn" ? built : toLatestTurnLayout(built)
        const zero: UsageNumbers = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }
        try {
          // Streamed, like chatQuery — the same request body, `stream: true` added.
          const msg = await client.messages.stream(params).finalMessage()
          const answer = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("")
          const usage: UsageNumbers = {
            input_tokens: msg.usage.input_tokens,
            cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
            output_tokens: msg.usage.output_tokens,
          }
          const score = msg.stop_reason === "refusal" ? { pass: false, missing: t.mustContain } : scoreAnswer(answer, t.mustContain)
          const r: TurnResult = {
            conversation: c.id,
            turn: t.id,
            layout,
            ...score,
            generalKnowledge: answer.includes(GENERAL_KNOWLEDGE_MARKER),
            stopReason: msg.stop_reason,
            usage,
            cost: usageCost(usage),
            answer,
          }
          results.push(r)
          answers.push(answer)
          console.log(
            `    ${r.pass ? "✓" : "✗"} ${t.id.padEnd(28)} in ${usage.input_tokens} · cache write ${usage.cache_creation_input_tokens} · cache read ${usage.cache_read_input_tokens} · out ${usage.output_tokens} · $${r.cost.actual.toFixed(4)} (uncached $${r.cost.uncached.toFixed(4)})` +
              `${r.missing.length ? ` — missing ${r.missing.map((g) => g.join(" | ")).join("; ")}` : ""}` +
              `${r.generalKnowledge ? " — fell back to general knowledge" : ""}${msg.stop_reason === "refusal" ? " — REFUSED" : ""}`,
          )
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          results.push({ conversation: c.id, turn: t.id, layout, pass: false, missing: t.mustContain, generalKnowledge: false, stopReason: null, usage: zero, cost: usageCost(zero), answer: "", error })
          console.error(`    ✗ ${t.id.padEnd(28)} API error: ${error.slice(0, 300)} — skipping the rest of this conversation`)
          break
        }
      }
    }
  }

  const summary = layouts.map((layout) => {
    const rs = results.filter((r) => r.layout === layout)
    const followUps = rs.filter((r) => !goldens.conversations.some((c) => c.turns[0].id === r.turn))
    return {
      layout,
      passed: rs.filter((r) => r.pass).length,
      total: targets.reduce((n, c) => n + c.turns.length, 0),
      errors: rs.filter((r) => r.error).length,
      followUpsReadingCache: followUps.filter((r) => r.usage.cache_read_input_tokens > 0).length,
      followUps: followUps.length,
      cost: rs.reduce((n, r) => n + r.cost.actual, 0),
      uncachedCost: rs.reduce((n, r) => n + r.cost.uncached, 0),
    }
  })
  console.log("\n━━ summary ━━")
  for (const s of summary) {
    console.log(
      `  ${s.layout.padEnd(12)} ${s.passed}/${s.total} passed · follow-ups reading the cache ${s.followUpsReadingCache}/${s.followUps} · spent $${s.cost.toFixed(3)} (uncached would be $${s.uncachedCost.toFixed(3)})${s.errors ? ` · ${s.errors} API error(s)` : ""}`,
    )
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  mkdirSync(join(HERE, "results"), { recursive: true })
  const out = join(HERE, "results", `chat-eval.${stamp}.json`)
  writeFileSync(out, JSON.stringify({ layouts, summary, results }, null, 2))
  console.log(`  answers: ${out}`)

  const errors = summary.some((s) => s.errors > 0)
  const first = summary.find((s) => s.layout === "first-turn")
  const latest = summary.find((s) => s.layout === "latest-turn")
  const cacheOk = !first || first.followUpsReadingCache === first.followUps
  if (first && latest) {
    const keep = !errors && cacheOk && first.passed >= latest.passed - 1
    console.log(
      keep
        ? `\n✓ KEEP — first-turn ${first.passed}/${first.total} vs latest-turn ${latest.passed}/${latest.total}; every follow-up read the cache\n`
        : `\n✗ DROP — ${errors ? "API errors; " : ""}${cacheOk ? "" : "a follow-up did not read the cache; "}first-turn ${first.passed}/${first.total} vs latest-turn ${latest.passed}/${latest.total}\n`,
    )
    process.exit(keep ? 0 : 1)
  }
  if (errors || !cacheOk) fail(errors ? "chat eval (live): API errors — see above" : "chat eval (live): a first-turn follow-up did not read the cache")
  console.log("\n(one layout only — run --layout=both for the keep/drop comparison)\n")
}

if (live) {
  liveRun().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
} else {
  offline()
}
