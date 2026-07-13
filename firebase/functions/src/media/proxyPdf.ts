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
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"

const REGION = "us-central1"
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
  try {
    await getAuth().verifyIdToken(token)
  } catch {
    res.status(401).json({ error: "Invalid or expired session." })
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
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.set("Content-Type", upstream.headers.get("content-type") ?? "application/pdf")
    res.set("Cache-Control", "public, max-age=86400")
    res.status(200).send(buf)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Fetch failed" })
  }
})
