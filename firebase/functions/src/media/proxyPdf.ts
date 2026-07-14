/**
 * proxyPdf — port of v1 proxy-pdf. Fetches a PDF from an external URL server-side
 * (no browser CORS) and returns the bytes so pdfjs-dist can render PDFs hosted on
 * CDNs that block cross-origin fetches. onRequest (not onCall) because the client
 * needs raw bytes; verifies the Firebase ID token itself. SSRF-guarded (invariant 8).
 *
 * Usage: GET proxyPdf?url=https://...  (Authorization: Bearer <idToken>)
 */
import { onRequest } from "firebase-functions/v2/https"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"
import { hasAnyMembership } from "../lib/membership.js"

const REGION = "us-central1"
/** Response cap — matches the client's MAX_UPLOAD_BYTES; stops the proxy being
 *  used to relay arbitrarily large files. */
const MAX_BYTES = 50 * 1024 * 1024
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

export const proxyPdf = onRequest({ region: REGION, timeoutSeconds: 60, memory: "256MiB" }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.set(CORS).status(204).send("")
    return
  }
  for (const [k, v] of Object.entries(CORS)) res.set(k, v)

  const token = (req.get("authorization") ?? "").startsWith("Bearer ") ? req.get("authorization")!.slice(7) : ""
  if (!token) {
    res.status(401).json({ error: "Authentication required." })
    return
  }
  let uid: string
  try {
    uid = (await getAuth().verifyIdToken(token)).uid
  } catch {
    res.status(401).json({ error: "Invalid or expired session." })
    return
  }
  // Member-of-any-home gate (onRequest → plain 403, not HttpsError).
  if (!(await hasAnyMembership(getFirestore(), uid))) {
    res.status(403).json({ error: "Forbidden" })
    return
  }

  const url = typeof req.query.url === "string" ? req.query.url : ""
  if (!url) {
    res.status(400).json({ error: "url param required" })
    return
  }
  if (!isAllowedUrl(url)) {
    res.status(403).json({ error: "URL not allowed: private or internal addresses are blocked" })
    return
  }

  try {
    const upstream = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Homehub/1.0)" }, redirect: "follow" })
    if (!upstream.ok) {
      res.status(502).json({ error: `Upstream returned ${upstream.status}` })
      return
    }
    const declared = Number(upstream.headers.get("content-length") ?? 0)
    if (declared > MAX_BYTES) {
      res.status(413).json({ error: "File too large to proxy." })
      return
    }
    // Stream with a running total — Content-Length can lie or be absent.
    const chunks: Buffer[] = []
    let total = 0
    if (upstream.body) {
      for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength
        if (total > MAX_BYTES) {
          res.status(413).json({ error: "File too large to proxy." })
          return
        }
        chunks.push(Buffer.from(chunk))
      }
    }
    res.set("Content-Type", upstream.headers.get("content-type") ?? "application/pdf")
    res.set("Cache-Control", "public, max-age=86400")
    res.status(200).send(Buffer.concat(chunks))
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Fetch failed" })
  }
})
