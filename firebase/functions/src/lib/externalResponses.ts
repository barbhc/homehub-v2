/**
 * Third-party API responses, parsed rather than cast (H3a: external responses
 * are validated at the point of entry, like request bodies). Claude's replies
 * are not here — they belong to the structured-output work and its evals.
 *
 * Each schema covers only the fields a reader here uses, and is lenient in
 * exactly the way the readers already were: a field missing or of the wrong
 * type reads as missing, an entry that isn't an object is skipped, and a body
 * without the expected envelope reads as "no results" — what every caller
 * already made of a missing `web.results` or `responses[0]`.
 */
import { z } from "zod"

const text = z.string().optional().catch(undefined)

/** One Brave web-search result, as the manual finder, image search and Ask read it. */
export const BraveWebResult = z.object({
  title: text,
  url: text,
  description: text,
  thumbnail: z.object({ src: text, original: text }).optional().catch(undefined),
})
export type BraveWebResult = z.output<typeof BraveWebResult>

const BraveEnvelope = z.object({ web: z.object({ results: z.array(z.unknown()) }) })

/** `web.results` of a Brave web-search body; [] when the body has none. */
export function braveWebResults(body: unknown): BraveWebResult[] {
  const envelope = BraveEnvelope.safeParse(body)
  if (!envelope.success) return []
  return envelope.data.web.results.flatMap((r) => {
    const parsed = BraveWebResult.safeParse(r)
    return parsed.success ? [parsed.data] : []
  })
}

const VisionTextBody = z.object({
  responses: z.array(z.object({ fullTextAnnotation: z.object({ text: z.string() }).optional().catch(undefined) })),
})

/** The full text of a Google Vision TEXT_DETECTION body; "" when it read none. */
export function visionFullText(body: unknown): string {
  const parsed = VisionTextBody.safeParse(body)
  return parsed.success ? (parsed.data.responses[0]?.fullTextAnnotation?.text ?? "") : ""
}

/** APNs' `{"reason": "..."}` error body, or null when it isn't one. */
export function apnsReason(body: string): string | null {
  try {
    const parsed = z.object({ reason: z.string() }).safeParse(JSON.parse(body))
    return parsed.success ? parsed.data.reason : null
  } catch {
    // Not JSON: the caller falls back to the raw text, which it logs.
    return null
  }
}
