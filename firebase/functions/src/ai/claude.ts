/**
 * Shared Claude/Anthropic helpers for the ported edge functions (Bucket B).
 *
 * v1's edge functions used raw fetch to api.anthropic.com; here we use the SDK
 * (already a dependency for the parse worker). Each function injects a
 * `CallClaudeText` so its core is emulator-testable with a fixture response —
 * the same pattern as the parse worker's CallClaude.
 */
import Anthropic from "@anthropic-ai/sdk"
import { isAllowedUrl, fetchGuarded } from "../../../../shared/parse/ssrf.js"
import {
  SERVER_SIDE_FALLBACK_BETA,
  assertNotRefused,
  rejectsForcedToolChoice,
  thinkingParamsFor,
} from "../../../../shared/parse/modelParams.js"

/** A text-in/text-out Claude call. `content` may include document/image blocks. */
export type CallClaudeText = (args: {
  model: string
  maxTokens: number
  system?: string
  content: Array<Record<string, unknown>>
}) => Promise<string>

/** Real CallClaudeText bound to an API key (concatenates returned text blocks). */
export function makeCallClaudeText(apiKey: string): CallClaudeText {
  const client = new Anthropic({ apiKey })
  return async ({ model, maxTokens, system, content }) => {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...thinkingParamsFor(model),
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: content as unknown as Anthropic.MessageParam["content"] }],
    })
    assertNotRefused(res)
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
  }
}

/**
 * A forced tool-use Claude call: returns the `input` object of the first
 * tool_use block matching `tool.name`, or null if the model returned none.
 */
export type CallClaudeTool = (args: {
  model: string
  maxTokens: number
  system?: string
  tool: Record<string, unknown>
  content: Array<Record<string, unknown>>
}) => Promise<Record<string, unknown> | null>

/** JSON-schema keywords structured outputs rejects (numeric, string-length and
 *  array-size constraints). Callers already validate these after the call. */
const UNSUPPORTED_SCHEMA_KEYS = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "minItems", "maxItems",
])

/** A tool input_schema adapted for structured outputs: every object closed,
 *  unsupported constraints dropped. */
function toStructuredOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStructuredOutputSchema)
  if (!schema || typeof schema !== "object") return schema
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema)) {
    if (!UNSUPPORTED_SCHEMA_KEYS.has(k)) out[k] = toStructuredOutputSchema(v)
  }
  if (out.type === "object") out.additionalProperties = false
  return out
}

/**
 * Real CallClaudeTool bound to an API key. Forces tool_choice on `tool.name`
 * for models that accept it (Sonnet, Haiku). Models that 400 on forced tool
 * use (Opus 5.5) get the tool's input_schema as a structured output instead —
 * schema-constrained decoding, so the reply is still structured output, not
 * free-text JSON — and the result is returned in the same shape.
 */
export function makeCallClaudeTool(apiKey: string): CallClaudeTool {
  const client = new Anthropic({ apiKey })
  return async ({ model, maxTokens, system, tool, content }) => {
    const messages = [{ role: "user" as const, content: content as unknown as Anthropic.MessageParam["content"] }]
    if (rejectsForcedToolChoice(model)) {
      // Opus 5.5: thinking is always on and counts toward max_tokens, so give
      // it room; effort is explicit (the API default is medium). Server-side
      // fallbacks retry a safety decline on another model.
      const body = {
        model,
        max_tokens: Math.max(maxTokens, 8000),
        ...(system ? { system } : {}),
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: toStructuredOutputSchema(tool.input_schema) },
        },
        fallbacks: "default",
        betas: [SERVER_SIDE_FALLBACK_BETA],
        messages,
      }
      // Outgoing body; the pinned SDK predates the `fallbacks` field.
      const res = await client.beta.messages.create(body as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)
      assertNotRefused(res)
      if (res.stop_reason === "max_tokens") throw new Error("The AI's answer was cut off before it finished. Please try again.")
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
      const parsed: unknown = JSON.parse(text)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
    }
    // No thinkingParamsFor here: a forced call doesn't think, and explicitly
    // disabling thinking makes Sonnet 5 stringify array fields (modelParams.ts).
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      tools: [tool as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: String(tool.name) },
      messages,
    })
    assertNotRefused(res)
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === String(tool.name),
    )
    return (block?.input as Record<string, unknown>) ?? null
  }
}

/** Pull the first {...} JSON object out of a model response (tolerates fences). */
export function extractJsonObject(text: string): string {
  const m = text.match(/\{[\s\S]*\}/)
  return m ? m[0] : "{}"
}

/**
 * Fetch a PDF from a public URL → base64. Guards SSRF (isAllowedUrl, invariant 8)
 * and caps at 25MB (base64 ≈ 33MB, near Claude's limit). Returns null on failure.
 */
export async function fetchPdfBase64(url: string): Promise<string | null> {
  if (!isAllowedUrl(url)) throw new Error("URL not allowed: private or internal addresses are blocked")
  try {
    // fetchGuarded re-checks each redirect hop; the isAllowedUrl above only
    // covers the first one.
    const res = await fetchGuarded(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > 25 * 1024 * 1024) return null
    return buf.toString("base64")
  } catch {
    return null
  }
}
