/**
 * Prompt caching on the parse path, and the usage line every Claude call logs
 * (2026-09-30) — pure, no emulator, no network.
 *
 *   - the switch (config/spend.parseCacheBreakpoint) reaches the WIRE: with it
 *     off, the body the SDK sends is byte-identical to buildExtractionRequest's
 *     pre-caching request; with it on, the PDF block carries the breakpoint;
 *   - every response is logged as one structured "claude usage" line carrying
 *     the four token numbers a week of logs needs;
 *   - a config read that fails means OFF, and does not fail the parse.
 *
 * The SDK is real; only its HTTP transport is a fake (makeCallClaude's
 * test-only `fetch`), so this exercises the serialization boundary production
 * crosses.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { CLAUDE_USAGE_MESSAGE, claudeUsageLine, logClaudeUsage } from "../lib/firebase/functions/src/lib/claudeUsage.js"
import { makeCallClaude } from "../lib/firebase/functions/src/parse/anthropic.js"
import { parseCacheBreakpointFor } from "../lib/firebase/functions/src/parse/parseWorker.js"
import { buildExtractionRequest } from "../lib/shared/parse/parsePrompt.js"

const PDF = "JVBERi0xLjQK" // "%PDF-1.4\n"
const PROMPT = "PROMPT"
const SONNET = "claude-sonnet-5"

/** Run `fn` and collect the structured usage lines it prints (everything else passes through). */
async function usageLinesDuring(fn) {
  const lines = []
  const original = process.stdout.write
  process.stdout.write = function (chunk, ...rest) {
    const s = String(chunk)
    if (s.includes(`"message":"${CLAUDE_USAGE_MESSAGE}"`)) {
      lines.push(JSON.parse(s))
      return true
    }
    return original.call(process.stdout, chunk, ...rest)
  }
  try {
    await fn()
  } finally {
    process.stdout.write = original
  }
  return lines
}

/** A fake Messages API: records each request body, answers with a tool call and the given usage. */
function fakeAnthropic(usage) {
  const bodies = []
  const fetch = async (_url, init) => {
    bodies.push(String(init.body))
    return new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: SONNET,
        content: [{ type: "tool_use", id: "toolu_test", name: "record_extraction", input: { chunks: [], tasks: [] } }],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }
  return { fetch, bodies }
}

const soon = () => Date.now() + 10 * 60_000

// ─── the usage line ──────────────────────────────────────────────────────────

test("a usage line carries all four token numbers; a missing cache field counts as 0", () => {
  const line = claudeUsageLine("chatQuery", SONNET, {
    model: SONNET,
    stop_reason: "end_turn",
    usage: { input_tokens: 900, output_tokens: 300, cache_creation_input_tokens: null, cache_read_input_tokens: 101_000 },
  })
  assert.deepEqual(line, {
    callSite: "chatQuery",
    model: SONNET,
    servedModel: SONNET,
    stopReason: "end_turn",
    input_tokens: 900,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 101_000,
    output_tokens: 300,
    promptTokens: 101_900,
  })
  // A response with no usage at all (never seen, but never a crash either).
  assert.equal(claudeUsageLine("ocr", "claude-haiku-4-5", {}).promptTokens, 0)
})

test("context rides along but can never overwrite the numbers", () => {
  const line = claudeUsageLine(
    "parseWorker",
    SONNET,
    { usage: { input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 3, cache_read_input_tokens: 4 } },
    { manualId: "m1", input_tokens: 999_999, callSite: "forged" },
  )
  assert.equal(line.manualId, "m1")
  assert.equal(line.input_tokens, 1)
  assert.equal(line.callSite, "parseWorker")
})

test("logClaudeUsage writes ONE structured INFO line — what the Cloud Logging query matches", async () => {
  const lines = await usageLinesDuring(async () => {
    logClaudeUsage("detectDocType", "claude-haiku-4-5", {
      model: "claude-haiku-4-5",
      usage: { input_tokens: 40_000, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })
  })
  assert.equal(lines.length, 1)
  assert.equal(lines[0].message, "claude usage")
  assert.equal(lines[0].severity, "INFO")
  assert.equal(lines[0].callSite, "detectDocType")
  assert.equal(lines[0].input_tokens, 40_000)
})

// ─── the parse request on the wire ───────────────────────────────────────────

test("switch OFF (the default): the SDK sends buildExtractionRequest's pre-caching body, byte for byte", async () => {
  const api = fakeAnthropic({ input_tokens: 120_000, output_tokens: 9_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })
  const lines = await usageLinesDuring(async () => {
    const call = makeCallClaude("sk-test-not-a-key", { deadlineAt: soon(), fetch: api.fetch, logFields: { manualId: "m1", taskAttempt: 1 } })
    const out = await call({ model: SONNET, pdfBase64: PDF, prompt: PROMPT })
    assert.equal(out.content[0].type, "tool_use")
  })
  assert.equal(api.bodies.length, 1)
  assert.equal(api.bodies[0], JSON.stringify(buildExtractionRequest(SONNET, PDF, PROMPT).params))
  assert.ok(!api.bodies[0].includes("cache_control"))
  assert.equal(lines.length, 1)
  assert.equal(lines[0].callSite, "parseWorker")
  assert.equal(lines[0].cacheBreakpoint, false)
  assert.equal(lines[0].manualId, "m1")
  assert.equal(lines[0].call, 1)
})

test("switch ON: the PDF block carries the cache breakpoint, the prompt text follows it, and the write is logged", async () => {
  const api = fakeAnthropic({ input_tokens: 2_400, output_tokens: 9_000, cache_creation_input_tokens: 117_600, cache_read_input_tokens: 0 })
  const lines = await usageLinesDuring(async () => {
    const call = makeCallClaude("sk-test-not-a-key", { deadlineAt: soon(), fetch: api.fetch, cacheBreakpoint: true })
    await call({ model: SONNET, pdfBase64: PDF, prompt: PROMPT })
  })
  const sent = JSON.parse(api.bodies[0])
  assert.deepEqual(sent.messages[0].content, [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: PDF }, cache_control: { type: "ephemeral" } },
    { type: "text", text: PROMPT },
  ])
  assert.equal(api.bodies[0], JSON.stringify(buildExtractionRequest(SONNET, PDF, PROMPT, { cacheBreakpoint: true }).params))
  assert.equal(lines[0].cacheBreakpoint, true)
  assert.equal(lines[0].cache_creation_input_tokens, 117_600)
  assert.equal(lines[0].promptTokens, 120_000)
})

// ─── the switch itself ───────────────────────────────────────────────────────

test("the worker reads the switch from config/spend: on is on, off is off", async () => {
  const config = (parseCacheBreakpoint) => async () => ({
    monthlyCeilingUnits: 1500,
    dailyUnitsDefault: 50,
    dailyUnitsOverrides: {},
    scansPerDay: 50,
    parseCacheBreakpoint,
  })
  assert.equal(await parseCacheBreakpointFor(config(true)), true)
  assert.equal(await parseCacheBreakpointFor(config(false)), false)
})

test("a config read that fails means OFF — logged, and the parse goes on", async () => {
  const logged = []
  const original = console.error
  console.error = (...args) => logged.push(args.map(String).join(" "))
  try {
    const on = await parseCacheBreakpointFor(async () => {
      throw new Error("14 UNAVAILABLE: firestore hiccup")
    })
    assert.equal(on, false)
  } finally {
    console.error = original
  }
  assert.equal(logged.length, 1)
  assert.match(logged[0], /parseCacheBreakpoint/)
  assert.match(logged[0], /firestore hiccup/)
})
