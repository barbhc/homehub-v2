/**
 * The legacy-Storage migration (scripts/ops/migrate-legacy-storage.ts), proven
 * end to end against the Auth + Firestore + Storage emulators:
 *
 *   dry run → counts/bytes, mutates nothing, prints no token
 *   apply, interrupted twice (once mid-copies, once mid-references) → resumed
 *     with the same manifest, nothing copied twice
 *   bytes, content type and custom metadata identical; every reference moved;
 *     every original still there
 *   idempotent re-run → nothing to do
 *   the app's REAL client services, signed in as a member, still resolve and
 *     fetch every migrated photo, receipt, manual and diagram (storage.rules
 *     enforcing); a member of another home and a former member are refused
 *   rollback → every reference back, copies left in place
 *
 * Fixture ids all carry "mig-" so the suite can share an emulator namespace
 * with the e2e seed (the client pins demo-homehub) without either touching the
 * other: apply runs with --home scoped to the fixture homes, and assertions read
 * only fixture rows.
 *
 * Run: npm run test:migration:emu
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { signInWithEmailAndPassword, signOut } from "firebase/auth"
import { getDownloadURL, ref as clientRef } from "firebase/storage"
import { auth as clientAuth, resolveStorageUrl, storage as clientStorage } from "@/integrations/firebase"
import { getItemUnit } from "@/modules/items/services/itemService"
import { getManualsByItem } from "@/modules/knowledge/services/manualDocumentService"
import { getChunksByManual } from "@/modules/knowledge/services/knowledgeService"
import { resolveManualUrl } from "@/hooks/useManualManagement"
import { manualSource } from "./functions/src/parse/manualSource"
import {
  isTenantPath,
  manifestState,
  parseManifest,
  planMigration,
  summarize,
  type MigrationPlan,
} from "../scripts/ops/storageLegacyMigration"
import { formatListing, formatSummary } from "../scripts/ops/storageLegacyMigrationCli"
import {
  applyPlan,
  discover,
  Manifest,
  planFromLive,
  rollback,
  verifyManifest,
  type Bucket,
} from "../scripts/ops/storageLegacyMigrationRunner"

const PROJECT = "demo-homehub"
const BUCKET_NAME = `${PROJECT}.appspot.com`
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080"
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199"
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099"
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST

if (getApps().length === 0) initializeApp({ projectId: PROJECT, storageBucket: BUCKET_NAME })
const db = getFirestore()
const bucket: Bucket = getStorage().bucket(BUCKET_NAME)

const H1 = "mig-h1"
const H2 = "mig-h2"
const FIXTURE_HOMES = new Set([H1, H2])
const PASSWORD = "mig-test-password"
const USERS = {
  a: { uid: "mig-ua", email: "mig-ua@example.test", home: H1 },
  b: { uid: "mig-ub", email: "mig-ub@example.test", home: H2 },
  former: { uid: "mig-uf", email: "mig-uf@example.test", home: H1 },
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from("mig-photo-bytes"), 0xff, 0xd9])
const PDF = Buffer.from("%PDF-1.4\n% mig manual\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n")
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Buffer.from("mig-png")])

/** Legacy objects (pre-2026-08-18 shapes) and what references them. */
const OBJ = {
  photo: "photos/mig-ua/mig-i1/photo.jpg", // v1 / pre-rekey v2 item photo
  receipt: "receipts/mig-i1/1700000000000-Best_Buy.pdf", // receipt
  manual: "mig-ua/mig-i1/manual_1700000000000.pdf", // v1 manual {uid}/{itemId}/…
  oldManual: "mig-i2/manual_1600000000000.pdf", // older v1 manual with no uid segment
  diagram: "images/mig-m1/page_3.jpg", // diagram render, referenced by token URL
  shared: "photos/mig-i3/photo.png", // referenced from BOTH homes → ambiguous
  h2Receipt: "receipts/mig-i20/1700000000001-r.jpg", // the other home's own legacy file
  orphan: "mig-orphan/old-export.bin", // nothing references it
  tenant: `homes/${H1}/photos/mig-ua/mig-i5/photo.jpg`, // already tenant-scoped
}
const MISSING = "photos/mig-ua/mig-i4/photo.jpg" // referenced, never uploaded
const DIAGRAM_TOKEN = "mig-diagram-token-SECRET"

const emuUrl = (path: string, token?: string) =>
  `http://${STORAGE_HOST}/v0/b/${BUCKET_NAME}/o/${encodeURIComponent(path)}?alt=media${token ? `&token=${token}` : ""}`

async function seed(): Promise<void> {
  const put = (name: string, bytes: Buffer, contentType: string, custom: Record<string, string> = {}) =>
    bucket.file(name).save(bytes, { contentType, resumable: false, metadata: { cacheControl: "private, max-age=300", metadata: custom } })
  await put(OBJ.photo, JPEG, "image/jpeg", { firebaseStorageDownloadTokens: "mig-photo-token" })
  await put(OBJ.receipt, PDF, "application/pdf", { firebaseStorageDownloadTokens: "mig-receipt-token" })
  await put(OBJ.manual, PDF, "application/pdf", { sha256: "mig-sha", firebaseStorageDownloadTokens: "mig-manual-token" })
  await put(OBJ.oldManual, PDF, "application/pdf")
  await put(OBJ.diagram, JPEG, "image/jpeg", { firebaseStorageDownloadTokens: DIAGRAM_TOKEN })
  await put(OBJ.shared, PNG, "image/png")
  await put(OBJ.h2Receipt, JPEG, "image/jpeg")
  await put(OBJ.orphan, Buffer.from("orphan"), "application/octet-stream")
  await put(OBJ.tenant, JPEG, "image/jpeg")

  const adminAuth = getAuth()
  for (const u of Object.values(USERS)) {
    await adminAuth.createUser({ uid: u.uid, email: u.email, password: PASSWORD, emailVerified: true })
    await db.doc(`homes/${u.home}/members/${u.uid}`).set({ uid: u.uid, role: u === USERS.a ? "owner" : "member", isPrimary: true })
  }
  const stamp = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), deletedAt: null }
  await db.doc(`homes/${H1}`).set({ name: "Mig Home One", createdBy: USERS.a.uid, ...stamp })
  await db.doc(`homes/${H2}`).set({ name: "Mig Home Two", createdBy: USERS.b.uid, ...stamp })
  const item = (id: string, extra: Record<string, unknown>) => ({ displayName: `Item ${id}`, homeId: H1, status: "active", ...stamp, ...extra })
  await db.doc(`homes/${H1}/items/mig-i1`).set(item("mig-i1", { photoPath: OBJ.photo, receiptPath: OBJ.receipt }))
  await db.doc(`homes/${H1}/items/mig-i2`).set(item("mig-i2", { photoPath: null }))
  await db.doc(`homes/${H1}/items/mig-i3`).set(item("mig-i3", { photoPath: OBJ.shared }))
  await db.doc(`homes/${H1}/items/mig-i4`).set(item("mig-i4", { photoPath: MISSING }))
  await db.doc(`homes/${H1}/items/mig-i5`).set(item("mig-i5", { photoPath: OBJ.tenant }))
  await db.doc(`homes/${H2}/items/mig-i9`).set(item("mig-i9", { homeId: H2, photoPath: OBJ.shared }))
  await db.doc(`homes/${H2}/items/mig-i20`).set(item("mig-i20", { homeId: H2, receiptPath: OBJ.h2Receipt }))
  const manual = (itemUnitId: string, sourceRef: string) => ({
    itemUnitId, title: "Owner's manual", sourceType: "upload", sourceRef, role: "primary", ...stamp,
  })
  await db.doc(`homes/${H1}/manuals/mig-m1`).set(manual("mig-i1", OBJ.manual))
  await db.doc(`homes/${H1}/manuals/mig-m2`).set(manual("mig-i2", OBJ.oldManual))
  await db.doc(`homes/${H1}/manuals/mig-m1/chunks/mig-c1`).set({
    manualId: "mig-m1", chunkType: "how_to", title: "Filter", content: "Lift the filter out.", ...stamp,
    metadata: { diagram_pages: [{ page: 3, caption: "Filter" }], diagram_image_urls: [{ url: emuUrl(OBJ.diagram, DIAGRAM_TOKEN), page: 3, caption: "Filter" }] },
  })
  await db.doc(`homes/${H1}/taskTemplates/mig-t1`).set({
    title: "Clean the filter", itemUnitId: "mig-i1", ...stamp,
    metadata: {
      diagram_image_urls: [
        { url: emuUrl(OBJ.diagram), page: 3, caption: "Filter" }, // tokenless (pre-lockdown v2)
        { url: "https://abc.supabase.co/storage/v1/object/public/Manuals/images/mig-m1/page_9.jpg", page: 9, caption: "dead v1" },
      ],
    },
  })
}

/** Every array in a plan, narrowed to the fixture's rows. */
function scoped(plan: MigrationPlan): MigrationPlan {
  const mine = (s: string) => s.includes("mig-")
  return {
    ...plan,
    copies: plan.copies.filter((c) => mine(c.src)),
    refUpdates: plan.refUpdates.filter((u) => mine(u.docPath)),
    ambiguous: plan.ambiguous.filter((a) => mine(a.objectPath)),
    missing: plan.missing.filter((m) => mine(m.docPath)),
    conflicts: plan.conflicts.filter((c) => mine(c.src)),
    unreferenced: plan.unreferenced.filter((o) => mine(o.name)),
    migratedOriginals: plan.migratedOriginals.filter((o) => mine(o.name)),
    outOfScope: plan.outOfScope.filter((o) => mine(o.objectPath)),
    crossHomeTenantRefs: plan.crossHomeTenantRefs.filter((r) => mine(r.docPath)),
    missingTenantRefs: plan.missingTenantRefs.filter((r) => mine(r.docPath)),
    v1Urls: plan.v1Urls.filter((v) => mine(v.docPath)),
    allRefs: plan.allRefs.filter((r) => mine(r.docPath)),
    objects: plan.objects.filter((o) => mine(o.name)),
  }
}

async function fixtureState(): Promise<{ docs: Record<string, unknown>; objects: Record<string, string> }> {
  const docs: Record<string, unknown> = {}
  const d = await discover(db, bucket)
  for (const r of d.refs.filter((x) => x.docPath.includes("mig-"))) docs[`${r.docPath}#${JSON.stringify(r.fieldPath)}`] = r.value
  const objects: Record<string, string> = {}
  for (const o of d.objects.filter((x) => x.name.includes("mig-"))) objects[o.name] = `${o.size}:${o.md5Hash}`
  return { docs, objects }
}

async function generations(names: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const n of names) out[n] = String((await bucket.file(n).getMetadata())[0].generation)
  return out
}

async function signInAs(u: { email: string }): Promise<void> {
  await signOut(clientAuth)
  await signInWithEmailAndPassword(clientAuth, u.email, PASSWORD)
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const dst = (homeId: string, path: string) => `homes/${homeId}/legacy/${path}`
let workDir: string
let manifestPath: string
let before: Awaited<ReturnType<typeof fixtureState>>

/** Remove every fixture object and document, so a run starts (and leaves)
 *  the shared namespace exactly as it found it. Only "mig-" rows are touched. */
async function clearFixture(): Promise<void> {
  const [files] = await bucket.getFiles()
  await Promise.all(files.filter((f) => f.name.includes("mig-")).map((f) => f.delete({ ignoreNotFound: true })))
  for (const h of FIXTURE_HOMES) await db.recursiveDelete(db.doc(`homes/${h}`))
  // Absent on a fresh emulator — deleting nothing is the goal, not a failure.
  for (const u of Object.values(USERS)) await getAuth().deleteUser(u.uid).catch(() => undefined)
}

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "mig-manifest-"))
  manifestPath = join(workDir, "manifest.jsonl")
  await clearFixture()
  await seed()
  before = await fixtureState()
})

afterAll(async () => {
  // Signing out of a session a failed test never opened is not worth a red.
  await signOut(clientAuth).catch(() => undefined)
  await clearFixture()
  rmSync(workDir, { recursive: true, force: true })
})

describe("dry run", () => {
  it("resolves each reference to one home, or reports it — and counts bytes", async () => {
    const { plan: live } = await planFromLive(db, bucket)
    const plan = scoped(live)

    expect(plan.copies.map((c) => [c.src, c.dst]).sort()).toEqual(
      [
        [OBJ.diagram, dst(H1, OBJ.diagram)],
        [OBJ.manual, dst(H1, OBJ.manual)],
        [OBJ.oldManual, dst(H1, OBJ.oldManual)],
        [OBJ.photo, dst(H1, OBJ.photo)],
        [OBJ.receipt, dst(H1, OBJ.receipt)],
        [OBJ.h2Receipt, dst(H2, OBJ.h2Receipt)],
      ].sort(),
    )
    expect(plan.refUpdates.map((u) => u.category).sort()).toEqual(
      [
        "items.photoPath",
        "items.receiptPath",
        "items.receiptPath",
        "manuals.sourceRef",
        "manuals.sourceRef",
        "manuals/chunks.metadata.diagram_image_urls[].url",
        "taskTemplates.metadata.diagram_image_urls[].url",
      ].sort(),
    )
    expect(plan.ambiguous.map((a) => [a.objectPath, a.reason, a.homes])).toEqual([[OBJ.shared, "multiple-homes", [H1, H2]]])
    expect(plan.missing.map((m) => [m.docPath, m.objectPath])).toEqual([[`homes/${H1}/items/mig-i4`, MISSING]])
    expect(plan.unreferenced.map((o) => o.name)).toEqual([OBJ.orphan])
    expect(plan.v1Urls).toHaveLength(1)
    expect(plan.crossHomeTenantRefs).toHaveLength(0)

    const s = summarize(plan)
    expect(s.refs.tokenUrlsTotal).toBe(1)
    expect(s.objects.legacyWithDownloadToken.count).toBe(4)
    expect(s.plan.byHome[H1]).toEqual({ objects: 5, bytes: JPEG.length * 2 + PDF.length * 3, refUpdates: 6 })
    expect(s.plan.byHome[H2]).toEqual({ objects: 1, bytes: JPEG.length, refUpdates: 1 })
    expect(s.ambiguous.multipleHomes).toEqual({ count: 1, bytes: PNG.length })

    // Nothing private in what a run prints.
    const printed = [...formatSummary(summarize(live)), ...formatListing(live)].join("\n")
    for (const secret of [DIAGRAM_TOKEN, "mig-photo-token", "mig-receipt-token", "%PDF", "token="]) {
      expect(printed).not.toContain(secret)
    }
  })

  it("changed nothing", async () => {
    expect(await fixtureState()).toEqual(before)
  })
})

describe("apply — interrupted, resumed, verified, idempotent", () => {
  it("a crash part-way through the copies leaves a resumable manifest", async () => {
    const { plan } = await planFromLive(db, bucket, FIXTURE_HOMES)
    let copies = 0
    await expect(
      applyPlan(db, bucket, plan, new Manifest(manifestPath), { project: PROJECT }, {
        beforeMutation: (kind) => {
          if (kind === "copy" && ++copies === 3) throw new Error("simulated crash")
        },
      }),
    ).rejects.toThrow("simulated crash")
    const st = manifestState(parseManifest(readFileSync(manifestPath, "utf8")))
    expect(st.copiesDone.size).toBe(2)
    expect(st.refIntents).toHaveLength(0) // no reference was touched before its copy was verified
    const now = await fixtureState()
    expect(now.docs).toEqual(before.docs)
  })

  it("a second crash, part-way through the references, also resumes", async () => {
    const copiedSoFar = manifestState(parseManifest(readFileSync(manifestPath, "utf8"))).copiesDone
    const gensBefore = await generations([...copiedSoFar].map((src) => dst(src.startsWith("receipts/mig-i20") ? H2 : H1, src)))
    const { plan } = await planFromLive(db, bucket, FIXTURE_HOMES)
    let refs = 0
    await expect(
      applyPlan(db, bucket, plan, new Manifest(manifestPath), { project: PROJECT }, {
        beforeMutation: (kind) => {
          if (kind === "ref" && ++refs === 3) throw new Error("simulated crash")
        },
      }),
    ).rejects.toThrow("simulated crash")
    // The copies done before the first crash were not made again.
    expect(await generations(Object.keys(gensBefore))).toEqual(gensBefore)
  })

  it("the resumed run finishes: same bytes, same metadata, every reference moved, every original kept", async () => {
    const { plan } = await planFromLive(db, bucket, FIXTURE_HOMES)
    const res = await applyPlan(db, bucket, plan, new Manifest(manifestPath), { project: PROJECT })
    expect(res.copyFailed).toEqual([])
    expect(res.fieldConflicts).toEqual([])

    const pairs: Array<[string, string]> = [
      [OBJ.photo, dst(H1, OBJ.photo)],
      [OBJ.receipt, dst(H1, OBJ.receipt)],
      [OBJ.manual, dst(H1, OBJ.manual)],
      [OBJ.oldManual, dst(H1, OBJ.oldManual)],
      [OBJ.diagram, dst(H1, OBJ.diagram)],
      [OBJ.h2Receipt, dst(H2, OBJ.h2Receipt)],
    ]
    for (const [src, to] of pairs) {
      const [[a], [b]] = await Promise.all([bucket.file(src).download(), bucket.file(to).download()])
      expect(b.equals(a)).toBe(true)
      const [[ma], [mb]] = await Promise.all([bucket.file(src).getMetadata(), bucket.file(to).getMetadata()])
      expect([mb.md5Hash, mb.crc32c, mb.contentType, mb.cacheControl, mb.metadata]).toEqual([ma.md5Hash, ma.crc32c, ma.contentType, ma.cacheControl, ma.metadata])
    }

    const item1 = (await db.doc(`homes/${H1}/items/mig-i1`).get()).data()!
    expect(item1.photoPath).toBe(dst(H1, OBJ.photo))
    expect(item1.receiptPath).toBe(dst(H1, OBJ.receipt))
    expect(item1.displayName).toBe("Item mig-i1")
    expect(item1.updatedAt.toDate().toISOString()).toBe("2026-01-02T00:00:00.000Z") // a file move is not a user edit
    expect((await db.doc(`homes/${H1}/manuals/mig-m1`).get()).get("sourceRef")).toBe(dst(H1, OBJ.manual))
    expect((await db.doc(`homes/${H1}/manuals/mig-m2`).get()).get("sourceRef")).toBe(dst(H1, OBJ.oldManual))
    const chunkUrl = (await db.doc(`homes/${H1}/manuals/mig-m1/chunks/mig-c1`).get()).get("metadata").diagram_image_urls[0].url
    expect(chunkUrl).toBe(emuUrl(dst(H1, OBJ.diagram), DIAGRAM_TOKEN))
    const tplImages = (await db.doc(`homes/${H1}/taskTemplates/mig-t1`).get()).get("metadata").diagram_image_urls
    expect(tplImages[0].url).toBe(emuUrl(dst(H1, OBJ.diagram)))
    expect(tplImages[1].url).toContain("supabase.co") // dead v1 URL: reported, untouched
    expect((await db.doc(`homes/${H2}/items/mig-i20`).get()).get("receiptPath")).toBe(dst(H2, OBJ.h2Receipt))

    // Skipped, untouched: the ambiguous object's two references and the missing one.
    expect((await db.doc(`homes/${H1}/items/mig-i3`).get()).get("photoPath")).toBe(OBJ.shared)
    expect((await db.doc(`homes/${H2}/items/mig-i9`).get()).get("photoPath")).toBe(OBJ.shared)
    expect((await db.doc(`homes/${H1}/items/mig-i4`).get()).get("photoPath")).toBe(MISSING)

    const v = await verifyManifest(db, bucket, new Manifest(manifestPath))
    expect(v).toMatchObject({ refsChecked: 7, refsPointingAtNew: 7, refsNotUpdated: [], destinationsMissing: [], originalsMissing: [] })
    for (const name of Object.values(OBJ)) expect((await bucket.file(name).exists())[0]).toBe(true)

    // Each object was copied exactly once across all three runs.
    const entries = parseManifest(readFileSync(manifestPath, "utf8"))
    const done = entries.filter((e) => e.t === "copy-done").map((e) => (e as { src: string }).src)
    expect(done.sort()).toEqual(pairs.map(([s]) => s).sort())
  })

  it("a second apply changes nothing", async () => {
    const legacy = Object.values(OBJ).filter((n) => !isTenantPath(n) && n !== OBJ.shared && n !== OBJ.orphan)
    const gens = await generations([...legacy, ...legacy.map((n) => dst(n === OBJ.h2Receipt ? H2 : H1, n))])
    const stateBefore = await fixtureState()
    const { plan: live } = await planFromLive(db, bucket, FIXTURE_HOMES)
    const plan = scoped(live)
    expect(plan.copies).toEqual([])
    expect(plan.refUpdates).toEqual([])
    expect(plan.migratedOriginals.map((o) => o.name).sort()).toEqual(
      [OBJ.photo, OBJ.receipt, OBJ.manual, OBJ.oldManual, OBJ.diagram, OBJ.h2Receipt].sort(),
    )
    const res = await applyPlan(db, bucket, live, new Manifest(manifestPath), { project: PROJECT })
    expect(res).toMatchObject({ copied: 0, fieldsWritten: 0, docsUpdated: 0 })
    expect(await fixtureState()).toEqual(stateBefore)
    expect(await generations(Object.keys(gens))).toEqual(gens)
  })
})

describe("the app's own read paths after migration (real client services, rules enforcing)", () => {
  it("a member reads every migrated photo, receipt, manual and diagram", async () => {
    await signInAs(USERS.a)
    const item = (await getItemUnit(H1, "mig-i1")).data!
    expect(item.photo_storage_ref).toBe(dst(H1, OBJ.photo))
    expect((await fetchBytes((await resolveStorageUrl(item.photo_storage_ref))!)).equals(JPEG)).toBe(true)
    expect((await fetchBytes((await resolveStorageUrl(item.receipt_storage_path))!)).equals(PDF)).toBe(true)

    for (const [itemId, expected] of [["mig-i1", OBJ.manual], ["mig-i2", OBJ.oldManual]] as const) {
      const [manual] = (await getManualsByItem(H1, itemId)).data!
      expect(manual.source_ref).toBe(dst(H1, expected))
      const url = await resolveManualUrl(manual.source_type, manual.source_ref)
      expect((await fetchBytes(url!)).equals(PDF)).toBe(true)
      // The server reads the same field: manualSource admits it for this home
      // (and only this one), and storagePdf downloads it via the Admin SDK.
      const source = manualSource(H1, manual.source_type, manual.source_ref)
      expect(source).not.toBeNull()
      expect(manualSource(H2, manual.source_type, manual.source_ref)).toBeNull()
      const [buf] = await bucket.file(source!.sourceRef).download()
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-")
    }

    // Diagram renders, as useResolvedDiagramImages resolves them: the chunk's
    // token URL (token carried over with the copy) and the template's tokenless one.
    const [chunk] = (await getChunksByManual(H1, "mig-m1")).data!
    const images = (chunk.metadata as { diagram_image_urls: Array<{ url: string }> }).diagram_image_urls
    expect((await fetchBytes((await resolveStorageUrl(images[0].url))!)).equals(JPEG)).toBe(true)
    const tpl = (await db.doc(`homes/${H1}/taskTemplates/mig-t1`).get()).get("metadata").diagram_image_urls[0].url
    expect((await fetchBytes((await resolveStorageUrl(tpl))!)).equals(JPEG)).toBe(true)

    // Untouched rows still resolve as before: an already tenant-scoped photo.
    expect((await fetchBytes((await resolveStorageUrl((await getItemUnit(H1, "mig-i5")).data!.photo_storage_ref))!)).equals(JPEG)).toBe(true)
  })

  it("a member of ANOTHER home cannot read the migrated copies, even knowing the paths", async () => {
    await signInAs(USERS.b)
    for (const p of [OBJ.photo, OBJ.receipt, OBJ.manual, OBJ.diagram]) {
      await expect(getDownloadURL(clientRef(clientStorage, dst(H1, p)))).rejects.toMatchObject({ code: "storage/unauthorized" })
    }
    // …and reads their own home's migrated receipt.
    expect((await fetchBytes(await getDownloadURL(clientRef(clientStorage, dst(H2, OBJ.h2Receipt))))).equals(JPEG)).toBe(true)
    // The ORIGINAL legacy path is still readable to them — the live rule this
    // PR deliberately does not change (the cutover closes it).
    await expect(getDownloadURL(clientRef(clientStorage, OBJ.photo))).resolves.toContain("token=")
  })

  it("a former member loses access the moment their membership row goes", async () => {
    await signInAs(USERS.former)
    await expect(getDownloadURL(clientRef(clientStorage, dst(H1, OBJ.photo)))).resolves.toContain("token=")
    await db.doc(`homes/${H1}/members/${USERS.former.uid}`).delete()
    await expect(getDownloadURL(clientRef(clientStorage, dst(H1, OBJ.photo)))).rejects.toMatchObject({ code: "storage/unauthorized" })
    await expect(getItemUnit(H1, "mig-i1")).resolves.toMatchObject({ data: null, error: expect.anything() })
  })
})

describe("rollback", () => {
  it("restores every reference the manifest rewrote; copies stay; legacy reads still work", async () => {
    const res = await rollback(db, new Manifest(manifestPath))
    expect(res.conflicts).toEqual([])
    expect(res.restored).toBe(7)
    expect((await fixtureState()).docs).toEqual(before.docs)
    for (const name of [dst(H1, OBJ.photo), dst(H2, OBJ.h2Receipt)]) expect((await bucket.file(name).exists())[0]).toBe(true)

    await signInAs(USERS.a)
    const item = (await getItemUnit(H1, "mig-i1")).data!
    expect(item.photo_storage_ref).toBe(OBJ.photo)
    expect((await fetchBytes((await resolveStorageUrl(item.photo_storage_ref))!)).equals(JPEG)).toBe(true)
  })

  it("a field changed after the migration is left alone by rollback", async () => {
    // Re-apply (the copies are reused — nothing is copied again), then a user
    // replaces the photo, then roll back.
    const { plan } = await planFromLive(db, bucket, FIXTURE_HOMES)
    expect(scoped(plan).copies.every((c) => c.alreadyCopied)).toBe(true)
    const again = await applyPlan(db, bucket, plan, new Manifest(manifestPath), { project: PROJECT })
    expect(again.copied).toBe(0)
    expect(again.fieldsWritten).toBe(7)
    const replaced = `homes/${H1}/photos/${USERS.a.uid}/mig-i1/photo.jpg`
    await db.doc(`homes/${H1}/items/mig-i1`).update({ photoPath: replaced })

    const res = await rollback(db, new Manifest(manifestPath))
    expect(res.conflicts).toEqual([{ docPath: `homes/${H1}/items/mig-i1`, fieldPath: ["photoPath"] }])
    expect((await db.doc(`homes/${H1}/items/mig-i1`).get()).get("photoPath")).toBe(replaced)
    expect((await db.doc(`homes/${H1}/items/mig-i1`).get()).get("receiptPath")).toBe(OBJ.receipt)
  })
})

describe("planMigration over the live fixture agrees with the pure rules", () => {
  it("discover() feeds planMigration the same facts the unit suite assumes", async () => {
    const d = await discover(db, bucket)
    const plan = scoped(planMigration({ objects: d.objects, refs: d.refs, v1Urls: d.v1Urls }))
    expect(plan.objects.find((o) => o.name === OBJ.diagram)?.hasDownloadToken).toBe(true)
    expect(plan.allRefs.find((r) => r.docPath.endsWith("mig-c1"))?.hasToken).toBe(true)
  })
})
