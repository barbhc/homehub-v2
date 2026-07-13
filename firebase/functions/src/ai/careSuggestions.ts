/**
 * careSuggestions — ports of v1 suggest-care-notes + import-care-url. Both ask
 * Claude for care/how-to/troubleshooting tips and return a validated
 * {suggestions} payload; import-care-url first fetches + strips a public web page
 * (behind the isAllowedUrl SSRF guard, invariant 8). The `parseSuggestions` core
 * (raw model text → validated suggestions) is shared + fixture-testable.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { makeCallClaudeText, extractJsonObject, type CallClaudeText } from "./claude.js"
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const REGION = "us-central1"

export type Suggestion = {
  title: string
  content: string
  chunk_type: "care" | "how_to" | "troubleshooting"
  category?: string
}

const VALID_CHUNK_TYPES = ["care", "how_to", "troubleshooting"]

/** Pure core: raw model text → validated, capped suggestions. Never throws. */
export function parseSuggestions(rawText: string): Suggestion[] {
  let parsed: { suggestions?: Array<Record<string, unknown>> }
  try {
    parsed = JSON.parse(extractJsonObject(rawText))
  } catch {
    return []
  }
  return (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .filter(
      (s) =>
        s &&
        typeof s.title === "string" &&
        typeof s.content === "string" &&
        VALID_CHUNK_TYPES.includes(String(s.chunk_type ?? "")),
    )
    .slice(0, 8)
    .map((s) => ({
      title: String(s.title).slice(0, 500),
      content: String(s.content).slice(0, 1500),
      chunk_type: s.chunk_type as Suggestion["chunk_type"],
      category: typeof s.category === "string" ? s.category.slice(0, 100) : undefined,
    }))
}

const SUGGEST_SYSTEM = `You are a home care expert. Generate specific, actionable care and maintenance tips. Return ONLY valid JSON with a 'suggestions' array. Each item: { title, content, chunk_type, category? }. chunk_type: care, how_to, or troubleshooting. For house scope include category (e.g. Pest Control, Windows). Keep content under 150 words. Exclude any tips that duplicate or closely match the existing_tips provided in the context. Return 5-8 suggestions.`

const IMPORT_SYSTEM = `You are a home care expert. Extract care/cleaning tips from web content. Return ONLY valid JSON with a 'suggestions' array. Each item: { title, content, chunk_type, category? }. chunk_type: care, how_to, or troubleshooting.`

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** suggest-care-notes core: scope + context → suggestions. */
export async function runSuggestCareNotes(
  callClaude: CallClaudeText,
  scope: string,
  context: Record<string, unknown>,
): Promise<Suggestion[]> {
  const existingTips = Array.isArray((context as { existing_tips?: unknown }).existing_tips)
    ? ((context as { existing_tips: unknown[] }).existing_tips as unknown[])
    : []
  const existingText =
    existingTips.length > 0
      ? `\n\nEXISTING TIPS (do not duplicate or closely match these):\n${existingTips.map((t) => `- ${t}`).join("\n")}`
      : ""
  const userPrompt = `Scope: ${scope}
Context: ${JSON.stringify(context)}
${existingText}

Generate 5-8 unique care tip suggestions. Return ONLY valid JSON: { "suggestions": [ { "title": "...", "content": "...", "chunk_type": "care|how_to|troubleshooting", "category": "..." (only for home scope) } ] }`
  const raw = await callClaude({ model: "claude-sonnet-4-6", maxTokens: 4096, system: SUGGEST_SYSTEM, content: [{ type: "text", text: userPrompt }] })
  return parseSuggestions(raw)
}

export const suggestCareNotes = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { scope, context } = (request.data ?? {}) as { scope?: string; context?: Record<string, unknown> }
  if (!scope || !["home", "room", "item_unit"].includes(scope)) {
    throw new HttpsError("invalid-argument", "scope is required and must be one of: home, room, item_unit")
  }
  try {
    const suggestions = await runSuggestCareNotes(makeCallClaudeText(ANTHROPIC_API_KEY.value()), scope, context ?? {})
    return { suggestions }
  } catch (e) {
    throw new HttpsError("unavailable", e instanceof Error ? e.message : "Suggest care notes failed")
  }
})

/** import-care-url core: fetched page text + scope/context → suggestions. */
export async function runImportCareUrl(
  callClaude: CallClaudeText,
  pageText: string,
  scope: string,
  context: Record<string, unknown>,
): Promise<Suggestion[]> {
  const truncated = pageText.slice(0, 8000)
  const userPrompt = `Extract care and maintenance tips from this web page content.
Scope: ${scope}
Context: ${JSON.stringify(context)}

Page content (truncated):
---
${truncated}
---

Return ONLY valid JSON: { "suggestions": [ { "title": "...", "content": "...", "chunk_type": "care|how_to|troubleshooting", "category": "..." (only for home scope) } ] }
Generate 3-8 actionable tips. chunk_type: care for general care, how_to for step-by-step instructions, troubleshooting for problem-solution.`
  const raw = await callClaude({ model: "claude-sonnet-4-6", maxTokens: 4096, system: IMPORT_SYSTEM, content: [{ type: "text", text: userPrompt }] })
  return parseSuggestions(raw)
}

export const importCareUrl = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { url, scope = "home", context } = (request.data ?? {}) as { url?: string; scope?: string; context?: Record<string, unknown> }
  const trimmed = typeof url === "string" ? url.trim() : ""
  if (!trimmed || !trimmed.startsWith("http")) throw new HttpsError("invalid-argument", "url is required and must be a valid URL")
  if (!isAllowedUrl(trimmed)) throw new HttpsError("permission-denied", "URL not allowed: private or internal addresses are blocked")

  let html: string
  try {
    const res = await fetch(trimmed, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HomeHubCareBot/1.0; +https://github.com/homehub)" },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error("Could not fetch URL")
    html = await res.text()
  } catch (e) {
    throw new HttpsError("unavailable", e instanceof Error ? e.message : "Could not fetch URL")
  }

  try {
    const suggestions = await runImportCareUrl(makeCallClaudeText(ANTHROPIC_API_KEY.value()), stripHtml(html), scope, context ?? {})
    return { suggestions }
  } catch (e) {
    throw new HttpsError("unavailable", e instanceof Error ? e.message : "Failed to extract tips")
  }
})
