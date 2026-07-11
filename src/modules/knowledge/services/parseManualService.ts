import { supabase } from "@/integrations/shim/client"

/**
 * Shape returned by the parse-manual edge function under `confidence`.
 * All values are optional because older runs (or future prompt versions)
 * may omit sections — callers must treat `undefined` as "unknown / low
 * confidence" and degrade gracefully, never silently assume 1.0.
 */
export interface ParsedConfidence {
  overall?: number
  safety?: number
  how_to?: number
  care?: number
  troubleshooting?: number
  /** Optional free-form note the parser emits when it hedges. */
  notes?: string
}

export type ParseManualResult =
  | { ok: true; chunks: number; tasks: number; committed?: boolean; draft?: boolean; processing?: boolean; confidence?: ParsedConfidence }
  | { ok: false; error: string; transient?: boolean }

function coerceConfidence(raw: unknown): ParsedConfidence | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as Record<string, unknown>
  const pickNumber = (k: string): number | undefined => {
    const v = r[k]
    return typeof v === "number" && Number.isFinite(v) ? v : undefined
  }
  const notes = typeof r.notes === "string" ? r.notes : undefined
  const result: ParsedConfidence = {
    overall: pickNumber("overall"),
    safety: pickNumber("safety"),
    how_to: pickNumber("how_to"),
    care: pickNumber("care"),
    troubleshooting: pickNumber("troubleshooting"),
    notes,
  }
  // Return undefined if nothing usable came through, rather than an empty object.
  const hasAny = Object.values(result).some((v) => v !== undefined)
  return hasAny ? result : undefined
}

/**
 * Triggers the parse-manual edge function to extract knowledge chunks
 * and task templates from a manual PDF.
 *
 * When `rescan` is true, old chunks/tasks are deleted before re-parsing.
 *
 * Uses a raw fetch with a 3-minute timeout because large PDFs can take
 * well over the default 60s supabase.functions.invoke timeout.
 */
export async function parseManual(manualId: string, opts?: { rescan?: boolean; fillGaps?: boolean }): Promise<ParseManualResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  let { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    const { data } = await supabase.auth.refreshSession()
    session = data.session
  }
  const token = session?.access_token

  if (!supabaseUrl || !anonKey || !token) {
    return { ok: false, error: "Authentication required. Please sign in again." }
  }

  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/parse-manual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        manual_id: manualId,
        commit: true, // always commit — the review step is the human review layer
        rescan: opts?.rescan ?? false,
        fill_gaps: opts?.fillGaps ?? false,
      }),
      signal: AbortSignal.timeout(180_000), // 3 minutes
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      try {
        const j = JSON.parse(text)
        if (typeof j?.error === "string") return { ok: false, error: j.error }
      } catch { /* not JSON */ }
      return { ok: false, error: `Edge function error (HTTP ${res.status})` }
    }

    const data = await res.json()

    if (data?.ok === true) {
      // Handle both committed (chunks/tasks at top level) and draft (summary.chunks/tasks) responses
      const chunks = typeof data.chunks === "number" ? data.chunks : data.summary?.chunks ?? 0
      const tasks = typeof data.tasks === "number" ? data.tasks : data.summary?.tasks ?? 0
      return {
        ok: true,
        chunks,
        tasks,
        committed: data.committed ?? true,
        draft: data.draft ?? false,
        // The function now parses in the background and returns immediately with
        // processing:true; the caller polls manual_document.parsed_at.
        processing: data.processing === true,
        confidence: coerceConfidence(data.confidence),
      }
    }

    const errMsg = typeof data?.error === "string" ? data.error : "Parse failed"
    return { ok: false, error: errMsg }
  } catch (err) {
    // Network drop / client timeout: the edge gateway often closes the
    // connection at its wall-clock limit while the function keeps running and
    // commits server-side. Mark these transient so the caller can poll for the
    // result instead of reporting a false failure.
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { ok: false, error: "Timed out — PDF may be too large. Try rescanning individually.", transient: true }
    }
    return { ok: false, error: err instanceof Error ? err.message : "Request failed", transient: true }
  }
}
