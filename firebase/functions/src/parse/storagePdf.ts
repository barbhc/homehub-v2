/**
 * Production PDF fetcher for the worker. `upload` manuals come from Cloud
 * Storage (v1 path conventions preserved); `url` manuals are fetched over HTTPS
 * behind the SSRF guard (invariant 8). Returned as base64 for the Claude
 * document block.
 */
import { getStorage } from "firebase-admin/storage"
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"
import type { FetchPdf } from "./parseTypes.js"

export function makeFetchPdf(): FetchPdf {
  return async (sourceType, sourceRef) => {
    if (sourceType === "url") {
      if (!isAllowedUrl(sourceRef)) throw new Error(`blocked URL (SSRF guard): ${sourceRef}`)
      const res = await fetch(sourceRef)
      if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      return buf.toString("base64")
    }
    // upload / email → Cloud Storage object path (bucket default).
    const [buf] = await getStorage().bucket().file(sourceRef).download()
    return buf.toString("base64")
  }
}
