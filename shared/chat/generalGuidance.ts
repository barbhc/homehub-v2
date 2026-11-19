/**
 * Ask with nothing to read (design/day-one-home.md, release B; owner said yes
 * on 2026-11-19 to "may Ask give general guidance without a manual?").
 *
 * Before this, a home with no manual, warranty or note behind a question got
 * "I couldn't find anything in your manuals for that." — the most prominent
 * control on a new home's screen failed on the first try. Now it answers from
 * general home-maintenance know-how, fitted to what Homehub knows about the
 * home (its county, winter lows, hazards, type, and the tasks already on its
 * list), and says plainly that it is general guidance.
 *
 * The answer is prose streamed to the person, not data the app parses, so it
 * is a plain text request like the manual path (no tool schema).
 */
import { CHAT_MAX_TOKENS, CHAT_MODEL, SAFETY_RULES, normalizeHistory, type ChatMessage, type ChatRequest } from "./chatMessages.js"
import { thinkingParamsFor } from "../parse/modelParams.js"
import { coldestNightF } from "../area/zipArea.js"

/** The one source chip a general answer carries (the client's "General knowledge" label). */
export const GENERAL_SOURCE = { title: "General knowledge", item_name: "General knowledge", source_type: "ai" as const }

/** What Homehub knows about the home, read from the home doc and its tasks. */
export interface HomeFacts {
  zip: string | null
  county: string | null
  /** USDA half-zone ("8b"); turned into the winter low in words, never shown as a code. */
  hardinessZone: string | null
  freezeRisk: boolean | null
  hazards: string[]
  homeType: string | null
  ownership: string | null
  /** Items the home has recorded (none of them with anything Ask could read). */
  itemNames: string[]
  /** Task titles already on the home's list. */
  taskTitles: string[]
  /** When the question was asked about one item or room. */
  scopeName: string | null
}

const MAX_LISTED = 12

/** The facts block the model reads. Lines with nothing to say are left out. */
export function homeFactsBlock(f: HomeFacts): string {
  const lines: string[] = []
  const place = [f.county, f.zip ? `zip ${f.zip}` : null].filter(Boolean).join(", ")
  if (place) lines.push(`- Location: ${place}`)
  const range = coldestNightF(f.hardinessZone)
  if (range) lines.push(`- Typical coldest winter night: ${range[0]} to ${range[1]}°F`)
  if (f.freezeRisk === true) lines.push("- Pipes can freeze here")
  if (f.freezeRisk === false) lines.push("- Hard freezes are rare here")
  if (f.hazards.length) lines.push(`- Natural hazards rated high for the county: ${f.hazards.join(", ")}`)
  const home = [f.homeType, f.ownership === "rent" ? "rented" : f.ownership === "own" ? "owned" : null].filter(Boolean).join(", ")
  if (home) lines.push(`- Home: ${home}`)
  if (f.itemNames.length) lines.push(`- Appliances recorded (no manual in Homehub): ${f.itemNames.slice(0, MAX_LISTED).join("; ")}`)
  if (f.taskTitles.length) lines.push(`- Already on their task list: ${f.taskTitles.slice(0, MAX_LISTED).join("; ")}`)
  if (f.scopeName) lines.push(`- The question is about: ${f.scopeName}`)
  return lines.length ? `About this home (from their Homehub profile):\n${lines.join("\n")}` : ""
}

const WEB_SEARCH_RULE =
  "\n- Web search results may be appended below. You may use them; cite a web source by its title when you do."

/** The system prompt for a question with nothing in the home to read. */
export function generalSystemPrompt(opts: { webSearch: boolean }): string {
  return `You are Homehub's home assistant. This household has no appliance manual, warranty or note in Homehub that covers this question, so answer from general home-maintenance know-how, fitted to the facts about their home when they are given.

Rules:
- Keep it short: lead with the answer, then at most four short bullets. Under 120 words. No headings.
- Fit the answer to their home: use their county, winter lows, home type and the hazards listed when they change the answer, and say them plainly (for example "In Dallas County, winter nights reach 15 to 20°F"). Leave out any fact that does not change the answer.
- If a task already on their list covers part of the answer, say it is already on their list rather than explaining it again.
- Never invent details that depend on the exact model: button names, part numbers, settings, error codes or filter sizes. When the answer depends on the model, say the appliance's manual or label will have it.
- Never say anything comes from their manual or their notes: none was provided.
- Use markdown: bold for key terms, numbered lists for steps.${SAFETY_RULES}${opts.webSearch ? WEB_SEARCH_RULE : ""}`
}

/** THE general request. chatQuery streams `params` as-is, exactly as it does the manual request. */
export function buildGeneralRequest(input: { question: string; history: unknown; facts: HomeFacts; webContextBlock: string }): ChatRequest {
  const history = normalizeHistory(input.history)
  // Roles must start with the user: a history that opens on an assistant turn
  // (the web-search follow-up) loses that opening turn here.
  const turns = history.turns[0]?.role === "assistant" ? history.turns.slice(1) : history.turns
  const userText = [input.question, homeFactsBlock(input.facts), input.webContextBlock].filter((s) => s.length > 0).join("\n\n")
  const messages: ChatMessage[] = [
    ...turns.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: [{ type: "text", text: userText }] },
  ]
  return {
    params: {
      model: CHAT_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      ...thinkingParamsFor(CHAT_MODEL),
      system: generalSystemPrompt({ webSearch: input.webContextBlock.length > 0 }),
      messages,
    },
    meta: {
      pdfs: 0,
      historyTurns: turns.length,
      droppedHistoryTurns: history.dropped + (history.turns.length - turns.length),
      syntheticPdfTurn: false,
      rules: { webSearch: input.webContextBlock.length > 0, warranty: false, notes: false },
    },
  }
}
