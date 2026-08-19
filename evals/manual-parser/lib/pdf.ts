/**
 * Corpus PDF resolution, with an on-disk cache.
 *
 * Strictly read-only against the live project: one Firestore metadata read and
 * one Storage download per manual, never a write. The cache matters — a corpus
 * manual runs to 12MB and a before/after comparison re-reads every one of them.
 *
 * The PDFs are NOT committed. Roughly 80MB of appliance manuals does not belong
 * in git, and they are other people's uploads. What IS committed is the run
 * output in runs/, which is what makes the score reproducible offline.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { PDF_CACHE, firebase } from "./env.js"

export class UnrecoverablePdf extends Error {}

export function cachedPath(manualId: string): string {
  return join(PDF_CACHE, `${manualId}.pdf`)
}

export function isCached(manualId: string): boolean {
  return existsSync(cachedPath(manualId))
}

/** Corpus PDF → base64. Downloads and caches on first use. */
export async function loadPdfBase64(homeId: string, manualId: string): Promise<string> {
  const cached = cachedPath(manualId)
  if (existsSync(cached)) return readFileSync(cached).toString("base64")

  const { db, bucket } = firebase()
  const snap = await db.doc(`homes/${homeId}/manuals/${manualId}`).get()
  if (!snap.exists) throw new UnrecoverablePdf(`manual not found: homes/${homeId}/manuals/${manualId}`)
  const sourceType = String(snap.get("sourceType") ?? "")
  const sourceRef = String(snap.get("sourceRef") ?? "")
  if (!sourceRef) throw new UnrecoverablePdf("manual has no sourceRef")

  let buf: Buffer
  if (sourceType === "upload") {
    const [exists] = await bucket.file(sourceRef).exists()
    if (!exists) throw new UnrecoverablePdf(`storage object missing: ${sourceRef}`)
    ;[buf] = await bucket.file(sourceRef).download()
  } else {
    // The v1 Supabase project was deleted; a sourceRef pointing at it is a
    // permanently dead link, not a transient failure. Saying so by name is what
    // stopped the previous harness from looking merely "flaky" for a month.
    if (/supabase\.co/.test(sourceRef)) {
      throw new UnrecoverablePdf("sourceRef points at the deleted v1 Supabase project — PDF unrecoverable")
    }
    const res = await fetch(sourceRef, { redirect: "follow" })
    if (!res.ok) throw new UnrecoverablePdf(`PDF fetch failed: HTTP ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
  }

  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new UnrecoverablePdf("downloaded bytes are not a PDF (probably an HTML error page)")
  }
  mkdirSync(PDF_CACHE, { recursive: true })
  writeFileSync(cached, buf)
  return buf.toString("base64")
}
