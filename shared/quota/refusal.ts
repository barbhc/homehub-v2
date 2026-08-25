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
