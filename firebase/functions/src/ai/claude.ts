/**
 * Shared Claude/Anthropic helpers for the ported edge functions (Bucket B).
 *
 * v1's edge functions used raw fetch to api.anthropic.com; here we use the SDK
 * (already a dependency for the parse worker). Each function injects a
 * `CallClaudeText` so its core is emulator-testable with a fixture response —
 * the same pattern as the parse worker's CallClaude.
 */
import Anthropic from "@anthropic-ai/sdk"
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"

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
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: content as unknown as Anthropic.MessageParam["content"] }],
    })
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

/** Real CallClaudeTool bound to an API key (forces tool_choice on `tool.name`). */
export function makeCallClaudeTool(apiKey: string): CallClaudeTool {
  const client = new Anthropic({ apiKey })
  return async ({ model, maxTokens, system, tool, content }) => {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      tools: [tool as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: String(tool.name) },
      messages: [{ role: "user", content: content as unknown as Anthropic.MessageParam["content"] }],
    })
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
    const res = await fetch(url, { redirect: "follow" })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > 25 * 1024 * 1024) return null
    return buf.toString("base64")
  } catch {
    return null
  }
}
