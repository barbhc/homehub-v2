/**
 * PDF validation + parse-error copy, shared by the worker and the client.
 *
 * A tester pasted a manual URL, the site answered with a web page (login /
 * bot-check pages return 200), and the worker base64'd those bytes and sent
 * them to Claude as a PDF. The API's 400 — request_id and all — then travelled
 * verbatim into the UI banner: `Manual saved, but parsing failed: 400
 * {"type":"error", … "The PDF specified was not valid." …}`.
 *
 * Two rules fall out of that:
 *  1. Validate the bytes BEFORE the API call — an HTML page must fail as
 *     "that link opened a web page", not as a Claude error.
 *  2. Raw transport/API text is never user copy. The worker stores a
 *     humanized message (raw kept separately as a diagnostic breadcrumb), and
 *     the client humanizes again as a belt for errors stored before this fix.
 *
 * Lives in shared/ (like ssrf.ts) so both sides use the same logic and the
 * app's test runner can pin it. parsePrompt/parseCore stay verbatim-from-v1;
 * this file is a v2 addition, not drift.
 */

/** True when the buffer starts like a real PDF. The spec allows junk before
 *  the header, so scan the first 1KB rather than only offset 0. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024)
  const probe = String.fromCharCode(...bytes.slice(0, limit))
  return probe.includes("%PDF-")
}

/** True when the buffer reads as an HTML document — the login/bot-check/404
 *  page a manufacturer site returns with status 200. */
export function looksLikeHtml(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 512)
  const probe = String.fromCharCode(...bytes.slice(0, limit)).trimStart().toLowerCase()
  return probe.startsWith("<!doctype") || probe.startsWith("<html") || probe.startsWith("<?xml") || probe.startsWith("<head")
}

export const PARSE_ERR = {
  urlNotPdf:
    "That link opened a web page, not a PDF — some sites need a login or a click-through before the download. Open the link in your browser, download the PDF, then upload it here.",
  uploadNotPdf:
    "That file doesn't look like a readable PDF. Try re-downloading it from the source, then upload it again.",
  pdfUnreadable:
    "We couldn't read that PDF — it may be corrupted or protected. Try re-downloading it, or upload a different copy.",
  fetchBlocked: (status: number) =>
    `The site wouldn't let us download that link (HTTP ${status}). Open it in your browser, download the PDF, then upload it here.`,
  generic:
    "Reading the manual failed on our side. Try again in a minute — if it keeps happening, upload the PDF directly instead of a link.",
  /** enqueueParse refused a second scan of a manual that is being read right
   *  now (the scan in flight is not affected). isParseInFlightMessage below
   *  must keep matching it. */
  alreadyReading: "This manual is already being read — it'll be ready in a few minutes.",
  /** The stalled-parse sweep ended a scan whose worker stopped writing. */
  stalled: "This scan stopped partway through on our side. Scanning it again will start it fresh.",
  /** The scan was saved but could not be handed to the worker queue. */
  notStarted: "We couldn't start this scan just now. Try again in a minute.",
  /** A scan the client was following was replaced by a different kind of scan
   *  of the same manual (e.g. a rescan started elsewhere). */
  superseded: "A newer scan of this manual took over from this one.",
} as const

/**
 * Is this the "already being read" refusal? The client uses it to FOLLOW the
 * scan already running instead of reporting a failure (the item page used to
 * start a second, separately billed scan of a manual the add wizard had just
 * started). Matched on the sentence because callable error details do not
 * survive every client transport; the functions test pins the pairing.
 */
export function isParseInFlightMessage(message: string | null | undefined): boolean {
  return !!message && /already being read/i.test(message)
}

/** Does this string read as raw transport/API output rather than a sentence
 *  written for a person? */
function looksLikeRawApiError(message: string): boolean {
  return (
    /"type"\s*:\s*"(invalid_request_)?error"/.test(message) ||
    message.includes("request_id") ||
    /^\d{3}\s*\{/.test(message.trim()) ||
    message.includes("invalid x-api-key") ||
    message.includes("overloaded_error")
  )
}

/**
 * Turn whatever a parse run died with into a sentence a homeowner can act on.
 * Messages that are already human (including everything in PARSE_ERR) pass
 * through untouched.
 */
export function humanizeParseError(raw: string): string {
  if (!raw.trim()) return PARSE_ERR.generic
  // The exact failure the tester hit: Anthropic rejecting the document.
  if (raw.includes("PDF specified was not valid") || (raw.includes("could not process") && raw.toLowerCase().includes("pdf"))) {
    return PARSE_ERR.pdfUnreadable
  }
  if (looksLikeRawApiError(raw)) return PARSE_ERR.generic
  return raw
}
