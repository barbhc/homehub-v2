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
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"
import { looksLikePdf, looksLikeHtml, PARSE_ERR } from "../../../../shared/parse/parseErrors.js"
import type { FetchPdf } from "./parseTypes.js"

export function makeFetchPdf(): FetchPdf {
  return async (sourceType, sourceRef) => {
    if (sourceType === "url") {
      if (!isAllowedUrl(sourceRef)) throw new Error(`blocked URL (SSRF guard): ${sourceRef}`)
      const res = await fetch(sourceRef)
      if (!res.ok) throw new Error(PARSE_ERR.fetchBlocked(res.status))
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
