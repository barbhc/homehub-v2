/**
 * Production PDF fetcher for the worker. `upload` manuals come from Cloud
 * Storage (v1 path conventions preserved); `url` manuals are fetched over HTTPS
 * behind the SSRF guard (invariant 8). Returned as base64 for the Claude
 * document block.
 *
 * Bytes are VALIDATED here, before any API call. Manufacturer sites answer
 * login/bot-check pages with status 200, and shipping that HTML to Claude as a
 * "PDF" produced a raw 400 in a tester's face. If it isn't a PDF, fail now,
 * in words the person who pasted the link can act on.
 */
import { getStorage } from "firebase-admin/storage"
import { isAllowedUrl, fetchGuarded } from "../../../../shared/parse/ssrf.js"
import { looksLikePdf, looksLikeHtml, PARSE_ERR } from "../../../../shared/parse/parseErrors.js"
import { PdfFetchError } from "./errorClass.js"
import type { FetchPdf } from "./parseTypes.js"

/**
 * A manufacturer download gets five minutes, all redirect hops included. It
 * had no bound at all, and the parse worker's 30-minute attempt is shared with
 * the Claude call — a stalled download must end as a retryable timeout, not
 * eat the attempt.
 */
const URL_FETCH_TIMEOUT_MS = 5 * 60_000

export function makeFetchPdf(): FetchPdf {
  return async (sourceType, sourceRef) => {
    if (sourceType === "url") {
      if (!isAllowedUrl(sourceRef)) throw new Error(`blocked URL (SSRF guard): ${sourceRef}`)
      // Redirects are re-validated per hop — `fetch` alone would have followed a
      // manufacturer-site 302 into the internal network.
      const res = await fetchGuarded(sourceRef, { signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS) })
      // Typed, so the worker can tell a site that is down (503: try again)
      // from one that refuses us (403: it will refuse again). Same sentence.
      if (!res.ok) throw new PdfFetchError(PARSE_ERR.fetchBlocked(res.status), res.status)
      const buf = Buffer.from(await res.arrayBuffer())
      if (!looksLikePdf(buf)) {
        throw new Error(looksLikeHtml(buf) ? PARSE_ERR.urlNotPdf : PARSE_ERR.uploadNotPdf)
      }
      return buf.toString("base64")
    }
    // upload / email → Cloud Storage object path (bucket default).
    const [buf] = await getStorage().bucket().file(sourceRef).download()
    if (!looksLikePdf(buf)) throw new Error(PARSE_ERR.uploadNotPdf)
    return buf.toString("base64")
  }
}
