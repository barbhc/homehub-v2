/**
 * proxyPdf relays only what the manual viewer asks for (C7b).
 *
 * The viewer sends two kinds of URL (src/integrations/firebase/pdfProxy.ts via
 * resolveManualUrl): this project's Storage download URLs for uploaded
 * manuals, and a linked manual's own sourceRef. The proxy used to relay any
 * public URL of any type; these tests pin what it relays now — and, because
 * breaking the viewer is the failure to avoid, that both real kinds still pass.
 *
 * Run via `npm run test:worker:emu` (compiles first; FIRESTORE_EMULATOR_HOST set).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import {
  acceptableContentType,
  isProjectStorageUrl,
  ownManualUrl,
  projectBuckets,
  readPdfResponse,
} from "../lib/firebase/functions/src/media/proxyPolicy.js"

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST must be set (run via emulators:exec)")
if (getApps().length === 0) initializeApp({ projectId: "demo-homehub" })
const db = getFirestore()

const BUCKETS = projectBuckets({ FIREBASE_CONFIG: JSON.stringify({ projectId: "homehub-2068d", storageBucket: "homehub-2068d.firebasestorage.app" }) })

test("the project's buckets come from the runtime's own config", () => {
  assert.ok(BUCKETS.has("homehub-2068d.firebasestorage.app"))
  assert.ok(BUCKETS.has("homehub-2068d.appspot.com"))
  assert.ok(projectBuckets({ GCLOUD_PROJECT: "p1" }).has("p1.firebasestorage.app"))
  assert.equal(projectBuckets({}).size, 0)
})

test("Storage URLs for THIS project's bucket are relayed — the uploaded-manual viewer path", () => {
  // The shape getDownloadURL returns for an uploaded manual.
  assert.equal(
    isProjectStorageUrl("https://firebasestorage.googleapis.com/v0/b/homehub-2068d.firebasestorage.app/o/manuals%2Fhome1%2Fm.pdf?alt=media&token=abc", BUCKETS),
    true,
  )
  assert.equal(isProjectStorageUrl("https://storage.googleapis.com/homehub-2068d.appspot.com/manuals/m.pdf", BUCKETS), true)
})

test("…and no other bucket, host, scheme or shape", () => {
  for (const url of [
    "https://firebasestorage.googleapis.com/v0/b/someone-elses-bucket.appspot.com/o/x.pdf?alt=media",
    "https://firebasestorage.googleapis.com/v0/b/homehub-2068d.firebasestorage.app.evil.com/o/x.pdf",
    "https://firebasestorage.googleapis.com/v0/b/homehub-2068d.firebasestorage.app/o/", // no object
    "https://storage.googleapis.com/other-bucket/x.pdf",
    "http://firebasestorage.googleapis.com/v0/b/homehub-2068d.firebasestorage.app/o/x.pdf", // not https
    "https://user:pw@storage.googleapis.com/homehub-2068d.appspot.com/x.pdf",
    "https://firebasestorage.googleapis.com.evil.com/v0/b/homehub-2068d.firebasestorage.app/o/x.pdf",
    "https://media3.bosch-home.com/Documents/manual.pdf",
    "not a url",
  ]) {
    assert.equal(isProjectStorageUrl(url, BUCKETS), false, url)
  }
})

let n = 0
const fresh = (label) => `proxy-${label}-${Date.now()}-${n++}`

async function seedHomeWithManual({ homeId, uid, sourceRef, deletedAt = null }) {
  await db.doc(`homes/${homeId}`).set({ name: "Proxy home" })
  await db.doc(`homes/${homeId}/members/${uid}`).set({ uid, role: "owner" })
  await db.doc(`homes/${homeId}/manuals/m1`).set({ sourceType: "url", sourceRef, itemUnitId: "i1", deletedAt })
}

test("a member's own LINKED manual is relayed — the linked-manual viewer path", async () => {
  const homeId = fresh("home"), uid = fresh("uid")
  const url = `https://media3.bosch-home.com/Documents/${homeId}.pdf`
  await seedHomeWithManual({ homeId, uid, sourceRef: url })
  assert.equal(await ownManualUrl(db, uid, url), "yes")
})

test("someone else's manual link is not relayed for you", async () => {
  const homeId = fresh("home"), owner = fresh("owner")
  const otherHome = fresh("other"), stranger = fresh("stranger")
  const url = `https://media3.bosch-home.com/Documents/${homeId}.pdf`
  await seedHomeWithManual({ homeId, uid: owner, sourceRef: url })
  await seedHomeWithManual({ homeId: otherHome, uid: stranger, sourceRef: "https://example.com/theirs.pdf" })
  assert.equal(await ownManualUrl(db, stranger, url), "no")
})

test("an arbitrary public URL is not relayed, even for a member", async () => {
  const homeId = fresh("home"), uid = fresh("uid")
  await seedHomeWithManual({ homeId, uid, sourceRef: "https://example.com/mine.pdf" })
  assert.equal(await ownManualUrl(db, uid, "https://example.com/anything-else.pdf"), "no")
})

test("a deleted manual's link is not relayed", async () => {
  const homeId = fresh("home"), uid = fresh("uid")
  const url = `https://example.com/${homeId}.pdf`
  await seedHomeWithManual({ homeId, uid, sourceRef: url, deletedAt: new Date() })
  assert.equal(await ownManualUrl(db, uid, url), "no")
})

test("an account in no home gets nothing", async () => {
  assert.equal(await ownManualUrl(db, fresh("nobody"), "https://example.com/x.pdf"), "not-member")
})

// ─── what comes back must be a PDF ───────────────────────────────────────────

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2048, 0x20), Buffer.from("\n%%EOF")])
const respond = (body, headers = {}) => new Response(body, { status: 200, headers })

test("content types: the PDF family and untyped downloads pass; everything else is refused", () => {
  for (const ok of ["application/pdf", "application/pdf; charset=binary", "Application/PDF", "application/x-pdf", "application/octet-stream", "binary/octet-stream", null]) {
    assert.equal(acceptableContentType(ok), true, String(ok))
  }
  for (const bad of ["text/html", "text/html; charset=utf-8", "image/png", "application/json", "text/plain"]) {
    assert.equal(acceptableContentType(bad), false, bad)
  }
})

test("a real PDF is relayed byte for byte", async () => {
  const read = await readPdfResponse(respond(PDF, { "content-type": "application/pdf" }), 50 * 1024 * 1024)
  assert.equal(read.ok, true)
  assert.equal(Buffer.compare(read.bytes, PDF), 0)
})

test("an octet-stream download is relayed when the bytes ARE a PDF", async () => {
  const read = await readPdfResponse(respond(PDF, { "content-type": "application/octet-stream" }), 50 * 1024 * 1024)
  assert.equal(read.ok, true)
})

test("the login page a manufacturer site returns with status 200 is refused", async () => {
  const html = "<!doctype html><html><body>Please sign in</body></html>".padEnd(4096, " ")
  const asHtml = await readPdfResponse(respond(html, { "content-type": "text/html" }), 50 * 1024 * 1024)
  assert.deepEqual([asHtml.ok, asHtml.status], [false, 415])
  // …and when it lies about its type, the bytes give it away.
  const lying = await readPdfResponse(respond(html, { "content-type": "application/pdf" }), 50 * 1024 * 1024)
  assert.deepEqual([lying.ok, lying.status], [false, 415])
})

test("a short non-PDF body is refused too (judged at the end when under 1 KB)", async () => {
  const read = await readPdfResponse(respond("GIF89a tiny", { "content-type": "application/octet-stream" }), 50 * 1024 * 1024)
  assert.deepEqual([read.ok, read.status], [false, 415])
})

test("over the cap: refused by Content-Length, or by the running total when that lies", async () => {
  const declared = await readPdfResponse(respond(PDF, { "content-type": "application/pdf", "content-length": String(100) }), 50)
  assert.deepEqual([declared.ok, declared.status], [false, 413])
  const streamed = await readPdfResponse(respond(PDF, { "content-type": "application/pdf" }), 1500)
  assert.deepEqual([streamed.ok, streamed.status], [false, 413])
})
