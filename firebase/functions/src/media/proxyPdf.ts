/**
 * proxyPdf — port of v1 proxy-pdf. Fetches a PDF server-side (no browser CORS)
 * and returns the bytes so pdfjs-dist can render PDFs hosted on CDNs that block
 * cross-origin fetches. onRequest (not onCall) because the client needs raw
 * bytes; verifies the Firebase ID token itself. SSRF-guarded (invariant 8).
 *
 * Usage: GET proxyPdf?url=https://...  (Authorization: Bearer <idToken>)
 *
 * Since 2026-09-30 (audit C7b) it relays only what the manual viewer asks it
 * for — this project's Storage objects and the caller's own linked manuals —
 * only bytes that are actually a PDF, and at most 10 calls a minute / 100 a day
 * per user (enforceCallLimits, the same usage doc and rate rule as the AI
 * calls). It used to relay any public URL of any content type for any member,
 * echoing the upstream Content-Type from our own origin. See proxyPolicy.ts.
 */
import { onRequest, HttpsError } from "firebase-functions/v2/https"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { isAllowedUrl, fetchGuarded } from "../../../../shared/parse/ssrf.js"
import { hasAnyMembership } from "../lib/membership.js"
import { enforceCallLimits } from "../lib/quota.js"
import { isProjectStorageUrl, ownManualUrl, projectBuckets, readPdfResponse } from "./proxyPolicy.js"

const REGION = "us-central1"
/** Response cap — matches the client's MAX_UPLOAD_BYTES; stops the proxy being
 *  used to relay arbitrarily large files. */
const MAX_BYTES = 50 * 1024 * 1024
/** Inside the function's 60 s: a stalled upstream ends as a 504, not a kill. */
const UPSTREAM_TIMEOUT_MS = 50_000
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

  const url = typeof req.query.url === "string" ? req.query.url : ""
  if (!url) {
    res.status(400).json({ error: "url param required" })
    return
  }
  if (!isAllowedUrl(url)) {
    res.status(403).json({ error: "URL not allowed: private or internal addresses are blocked" })
    return
  }

  const db = getFirestore()

  // Limits before any read or byte that costs anything.
  try {
    await enforceCallLimits(db, uid, "proxyPdf")
  } catch (e) {
    if (e instanceof HttpsError) {
      const kind = (e.details as { kind?: string } | undefined)?.kind
      res.status(429).json({
        error: kind === "call_cap" ? "You've opened a lot of manuals today — viewing more resumes within a day." : e.message,
      })
    } else {
      console.error(`[proxyPdf] rate-limit bookkeeping failed for ${uid}:`, e)
      res.status(503).json({ error: "Couldn't open that manual just now. Please try again." })
    }
    return
  }

  // Only what the manual viewer sends: this project's Storage objects, or the
  // source of one of the caller's own linked manuals. Membership of some home
  // is still required either way (anonymous / home-less tokens get nothing).
  if (isProjectStorageUrl(url, projectBuckets())) {
    if (!(await hasAnyMembership(db, uid))) {
      res.status(403).json({ error: "Forbidden" })
      return
    }
  } else {
    const own = await ownManualUrl(db, uid, url)
    if (own === "not-member") {
      res.status(403).json({ error: "Forbidden" })
      return
    }
    if (own === "no") {
      res.status(403).json({ error: "Only your own manuals can be opened here." })
      return
    }
  }

  try {
    // fetchGuarded, not fetch: every redirect hop is re-checked against
    // isAllowedUrl. With redirect:"follow" only the URL the caller typed was
    // ever validated, so a 302 to 169.254.169.254 or an RFC1918 host was
    // followed on their behalf and the body proxied straight back to them.
    const upstream = await fetchGuarded(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Homehub/1.0)" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!upstream.ok) {
      res.status(502).json({ error: `Upstream returned ${upstream.status}` })
      return
    }
    const read = await readPdfResponse(upstream, MAX_BYTES)
    if (!read.ok) {
      res.status(read.status).json({ error: read.error })
      return
    }
    // Always application/pdf from here — never the upstream's claim. Echoing
    // it served whatever a third party said (text/html included) from our own
    // origin; nosniff stops a browser second-guessing the type.
    res.set("Content-Type", "application/pdf")
    res.set("X-Content-Type-Options", "nosniff")
    // private: the request carries a user's token; a shared cache must not
    // keep it. A day in the browser's own cache spares re-fetching the same
    // manual on every open.
    res.set("Cache-Control", "private, max-age=86400")
    res.status(200).send(read.bytes)
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
    res.status(timedOut ? 504 : 502).json({ error: err instanceof Error ? err.message : "Fetch failed" })
  }
})
