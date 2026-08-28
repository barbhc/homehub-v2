/**
 * Recognising a spend refusal — shared by the client and the functions.
 *
 * Its own file, importing nothing, because `policy.ts` reads `process.env` for
 * the monthly-ceiling override and the browser tsconfig will not take it. That
 * is precisely why this drifted in the first place: the client could not import
 * the server's knowledge, so it kept a private copy of the patterns.
 */
/**
 * Does this refusal message mean "a ceiling we set", rather than a failure?
 *
 * Lives in shared/ deliberately. The CLIENT owns the wording it shows — that is
 * HH-124's whole point, because server copy can only change with a functions
 * deploy — but it has to RECOGNISE what the server said, and the two sides had
 * no common ground for that. `startParse` discards the structured details and
 * keeps only `err.message`, so recognition was a regex sitting in the client,
 * matching sentences written in the functions package. Add a new refusal
 * message there and the client silently treats a queued scan as a hard error
 * with a dead "Try again" — exactly the experience HH-124 was raised about.
 *
 * So the matcher is shared, and the functions test asserts every message the
 * server can produce is matched by it. Copy stays free to change; recognition
 * cannot drift without something going red.
 */
export function isQuotaExhaustedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  return /daily ai limit|monthly ai budget|resource[- ]exhausted|too many requests|manual scans today|daily limit reached for this action/i.test(
    message,
  )
}

/**
 * Is this refusal a RATE limit — "wait a few seconds" — rather than a ceiling?
 *
 * The distinction is the whole fix for HH-145. A tester scanned a manual, saw
 * "The scan failed", and directly beneath it the app was reading her manual
 * perfectly well. The scan had not failed: a second request inside the same
 * 60-second window was throttled, and because neither rate-limit sentence
 * appeared in `isQuotaExhaustedMessage` above, the client fell through to its
 * generic failure banner.
 *
 * That is HH-124's lesson one layer down — a limit WE set, rendered as an error
 * the user caused — so the recognition lives here beside the ceiling matcher,
 * and the functions test asserts both sentences errorForRate can produce are
 * matched.
 *
 * Deliberately NOT folded into isQuotaExhaustedMessage: a ceiling means "come
 * back later" and parks the work, a rate limit means "in nine seconds", and
 * parking those would queue work the user is about to redo by hand.
 */
export function isRateLimitMessage(message: string | null | undefined): boolean {
  if (!message) return false
  return /catching up with your last few actions|that's a lot of requests at once|a lot of requests at once/i.test(
    message,
  )
}

/**
 * How long the server asked us to wait, read from its own sentence.
 *
 * The structured `details` a callable carries do not survive every client
 * transport — that is why recognition is done on text at all — so the number is
 * parsed from the message we can actually see. Falls back to 15s: long enough
 * that an automatic retry does not immediately re-trip the window, short enough
 * that nobody gives up waiting.
 */
export function retryAfterFromMessage(message: string | null | undefined): number {
  const m = message?.match(/(\d+)\s*second/i)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) && n > 0 && n <= 120 ? n : 15
}
