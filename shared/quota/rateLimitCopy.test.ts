/**
 * A throttled request must never be reported as a failure.
 *
 * HH-145: a tester scanned a manual and saw "The scan failed" printed directly
 * above the app reading that manual perfectly well. A second request inside the
 * same 60-second window had been throttled, and neither sentence errorForRate
 * can produce appeared in the ceiling matcher — so the client fell through to
 * its loudest wording for something that only needed a few seconds.
 *
 * This is HH-124's lesson one layer down: a limit WE set, rendered as an error
 * the user caused.
 */
import { describe, it, expect } from "vitest"
import { isQuotaExhaustedMessage, isRateLimitMessage, retryAfterFromMessage } from "./refusal"

// Verbatim from errorForRate() in firebase/functions/src/lib/quota.ts.
const BURST = "Homehub is catching up with your last few actions — please wait about 24 seconds and try again."
const ENDPOINT = "That's a lot of requests at once — please wait about 9 seconds and try again."
// Verbatim from errorForVerdict().
const DAILY = "You've used your daily AI limit."
const GLOBAL = "Homehub has hit its monthly AI budget. This isn't something you did — your work is saved and queued."

describe("rate limits are recognised", () => {
  it("matches both sentences the server can send", () => {
    expect(isRateLimitMessage(BURST)).toBe(true)
    expect(isRateLimitMessage(ENDPOINT)).toBe(true)
  })

  it("does not match a real failure", () => {
    // The exact regression: this used to fall through to "The scan failed".
    expect(isRateLimitMessage("The scan failed")).toBe(false)
    expect(isRateLimitMessage("Could not read the PDF")).toBe(false)
    expect(isRateLimitMessage(null)).toBe(false)
  })

  it("stays separate from a CEILING, which means something else entirely", () => {
    // A ceiling parks the work for later; a rate limit retries in seconds.
    // Conflating them would queue work the user is about to redo by hand.
    expect(isRateLimitMessage(DAILY)).toBe(false)
    expect(isRateLimitMessage(GLOBAL)).toBe(false)
    expect(isQuotaExhaustedMessage(BURST)).toBe(false)
    expect(isQuotaExhaustedMessage(DAILY)).toBe(true)
  })
})

describe("the wait comes from the server's own sentence", () => {
  it("reads the number the server named", () => {
    expect(retryAfterFromMessage(BURST)).toBe(24)
    expect(retryAfterFromMessage(ENDPOINT)).toBe(9)
  })

  it("falls back rather than retrying instantly", () => {
    // An immediate retry re-trips the same window — the pause has to be real.
    expect(retryAfterFromMessage("please wait a second and try again")).toBe(15)
    expect(retryAfterFromMessage(undefined)).toBe(15)
  })

  it("refuses an absurd wait", () => {
    expect(retryAfterFromMessage("wait about 99999 seconds")).toBe(15)
  })
})
