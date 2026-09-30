/**
 * What proxyPdf may relay, and in what shape — the decisions, separated from
 * the HTTP handler so they are testable without a network.
 *
 * proxyPdf exists because pdf.js cannot load a cross-origin PDF whose host
 * sends no CORS headers. It relayed ANY public URL, of ANY content type, for
 * any signed-in member of any home (audit C7b): an open, authenticated,
 * 50 MB-per-call relay out of Cloud Functions egress.
 *
 * What the manual viewer actually sends it (src/integrations/firebase/
 * pdfProxy.ts routes every cross-origin URL; the URL comes from
 * resolveManualUrl in src/hooks/useManualManagement.ts):
 *   - an UPLOADED manual → a Firebase Storage download URL for this
 *     project's bucket;
 *   - a LINKED manual → the manual's own `sourceRef` (the manufacturer URL
 *     the user attached, often via findManual).
 * So those are the two things it now relays — and nothing else.
 */
import type { Firestore } from "firebase-admin/firestore"
import { looksLikePdf } from "../../../../shared/parse/parseErrors.js"

/** The project's Storage bucket names, from the runtime's own config. */
export function projectBuckets(env: Record<string, string | undefined> = process.env): Set<string> {
  const out = new Set<string>()
  const add = (projectId: string | undefined) => {
    if (!projectId) return
    out.add(`${projectId}.firebasestorage.app`)
    out.add(`${projectId}.appspot.com`)
  }
  if (env.FIREBASE_CONFIG) {
    try {
      const cfg = JSON.parse(env.FIREBASE_CONFIG) as { storageBucket?: unknown; projectId?: unknown }
      if (typeof cfg.storageBucket === "string" && cfg.storageBucket) out.add(cfg.storageBucket)
      if (typeof cfg.projectId === "string") add(cfg.projectId)
    } catch (e) {
      // The runtime always sets this; a malformed one leaves the project-id
      // fallback below, and is worth knowing about.
      console.error("[proxyPdf] FIREBASE_CONFIG is not JSON:", e instanceof Error ? e.message : e)
    }
  }
  add(env.GCLOUD_PROJECT)
  return out
}

/**
 * A Firebase Storage URL for one of this project's buckets:
 *   https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{object}
 *   https://storage.googleapis.com/{bucket}/{object}
 */
export function isProjectStorageUrl(url: string, buckets: Set<string>): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false
  const segments = u.pathname.split("/")
  if (u.hostname === "firebasestorage.googleapis.com") {
    // ["", "v0", "b", bucket, "o", object…]
    return segments[1] === "v0" && segments[2] === "b" && buckets.has(segments[3] ?? "") && segments[4] === "o" && !!segments[5]
  }
  if (u.hostname === "storage.googleapis.com") {
    // ["", bucket, object…]
    return buckets.has(segments[1] ?? "") && !!segments[2]
  }
  return false
}

/**
 * Is `url` the source of a (non-deleted) manual in a home `uid` belongs to?
 *
 * Reads the caller's memberships (the `members.uid` collection-group index
 * that already exists) and then, per home, an equality query on `sourceRef`
 * (an automatic single-field index) — no new index to deploy. A user belongs
 * to a handful of homes, so this is a few reads per viewer open.
 */
export async function ownManualUrl(db: Firestore, uid: string, url: string): Promise<"yes" | "no" | "not-member"> {
  const memberships = await db.collectionGroup("members").where("uid", "==", uid).get()
  const homeIds = memberships.docs
    .map((d) => d.ref.parent.parent)
    .filter((h): h is NonNullable<typeof h> => !!h && h.parent.id === "homes")
    .map((h) => h.id)
  if (homeIds.length === 0) return "not-member"
  for (const homeId of homeIds) {
    const hits = await db.collection(`homes/${homeId}/manuals`).where("sourceRef", "==", url).limit(5).get()
    if (hits.docs.some((d) => d.get("deletedAt") == null)) return "yes"
  }
  return "no"
}

/** Declared types a PDF is served under in the wild. The bytes are checked
 *  either way — a declared type is a claim, not evidence. */
const PDF_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/acrobat",
  // CDNs and Storage objects uploaded without a type.
  "application/octet-stream",
  "binary/octet-stream",
  "application/download",
  "application/force-download",
])

/** Would a PDF plausibly be served with this Content-Type? (Absent counts.) */
export function acceptableContentType(contentType: string | null): boolean {
  if (!contentType) return true
  return PDF_TYPES.has(contentType.split(";")[0].trim().toLowerCase())
}

export type PdfRead =
  | { ok: true; bytes: Buffer }
  | { ok: false; status: 413 | 415; error: string }

/** How much of the head must be seen before judging "is this a PDF". */
const HEAD_BYTES = 1024

/**
 * Read an upstream response as a PDF, or refuse it: wrong declared type (415),
 * bytes that do not start like a PDF (415, decided on the first KB — the rest
 * is never downloaded), or bigger than `maxBytes` (413, by Content-Length or
 * by the running total, since Content-Length can lie or be absent).
 */
export async function readPdfResponse(upstream: Response, maxBytes: number): Promise<PdfRead> {
  if (!acceptableContentType(upstream.headers.get("content-type"))) {
    return { ok: false, status: 415, error: "That link is not a PDF." }
  }
  const declared = Number(upstream.headers.get("content-length") ?? 0)
  if (declared > maxBytes) return { ok: false, status: 413, error: "File too large to proxy." }

  const chunks: Buffer[] = []
  let total = 0
  let judged = false
  if (upstream.body) {
    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength
      if (total > maxBytes) return { ok: false, status: 413, error: "File too large to proxy." }
      chunks.push(Buffer.from(chunk))
      if (!judged && total >= HEAD_BYTES) {
        judged = true
        if (!looksLikePdf(Buffer.concat(chunks))) return { ok: false, status: 415, error: "That link is not a PDF." }
      }
    }
  }
  const bytes = Buffer.concat(chunks)
  if (!judged && !looksLikePdf(bytes)) return { ok: false, status: 415, error: "That link is not a PDF." }
  return { ok: true, bytes }
}
