/**
 * The legacy-Storage migration's rules (storageLegacyMigration.ts) and its CLI
 * guard (storageLegacyMigrationCli.ts). What moves, where, who owns it, and
 * whether a run may touch production at all are decided here; the I/O is proven
 * against the emulators in firebase/storage-migration.emu.test.ts.
 */
import { describe, expect, it } from "vitest"
import {
  PROTECTED_HOMES,
  categoryFor,
  checkManifestHeader,
  classifyRefString,
  decideField,
  findRefs,
  getAt,
  legacyDestination,
  manifestState,
  parseManifest,
  planMigration,
  redact,
  requireHeader,
  rewriteRef,
  sameBytes,
  setAt,
  summarize,
  walkStrings,
  type StorageObjectFacts,
  type StorageRef,
} from "./storageLegacyMigration.js"
import {
  PROD_BUCKETS,
  applyExitCode,
  deniedProtectedHomes,
  formatListing,
  formatSummary,
  homeGate,
  parseArgs,
  progressLine,
  resolveTarget,
} from "./storageLegacyMigrationCli.js"

const BUCKET = "demo-homehub.appspot.com"
const obj = (name: string, size = 100, md5 = `md5-${name}`, token = false): StorageObjectFacts => ({
  name,
  size,
  md5Hash: md5,
  crc32c: `crc-${md5}`,
  contentType: "application/octet-stream",
  hasDownloadToken: token,
})
const known = (...names: string[]) => new Set(names)
const tokenUrl = (path: string, token = "SECRET-TOKEN") =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`

function refsOf(docPath: string, data: Record<string, unknown>, objects: string[]): StorageRef[] {
  return findRefs(docPath, data, { bucket: BUCKET, knownObjects: known(...objects) }).refs
}

describe("what counts as a reference", () => {
  it("a bare path counts in a declared path field even with no object behind it (so it can be reported missing)", () => {
    const refs = refsOf("homes/h1/items/i1", { photoPath: "photos/u1/i1/photo.jpg", name: "Fridge" }, [])
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({ homeId: "h1", form: "path", objectPath: "photos/u1/i1/photo.jpg", category: "items.photoPath" })
  })

  it("a bare path elsewhere counts only when it names an object that exists", () => {
    expect(refsOf("homes/h1/careNotes/n1", { body: "receipts/x/1-a.jpg" }, [])).toHaveLength(0)
    expect(refsOf("homes/h1/careNotes/n1", { body: "receipts/x/1-a.jpg" }, ["receipts/x/1-a.jpg"])).toHaveLength(1)
  })

  it("a manual's sourceRef is a path only for uploads — a linked manual's URL is someone else's", () => {
    expect(refsOf("homes/h1/manuals/m1", { sourceType: "upload", sourceRef: "u1/i1/manual_1.pdf" }, [])).toHaveLength(1)
    expect(refsOf("homes/h1/manuals/m1", { sourceType: "url", sourceRef: "https://example.com/m.pdf" }, [])).toHaveLength(0)
  })

  it("Firebase download URLs for THIS bucket count — prod host, emulator host, storage.googleapis.com — with token noted", () => {
    const emu = `http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent("images/m1/page_2.jpg")}?alt=media`
    const gcs = `https://storage.googleapis.com/${BUCKET}/images/m1/page_3.jpg`
    const other = `https://firebasestorage.googleapis.com/v0/b/other-bucket/o/x?alt=media&token=t`
    const refs = refsOf(
      "homes/h1/manuals/m1/chunks/c1",
      { metadata: { diagram_image_urls: [{ url: tokenUrl("images/m1/page_1.jpg"), page: 1 }, { url: emu }, { url: gcs }, { url: other }] } },
      [],
    )
    expect(refs.map((r) => [r.objectPath, r.form, r.hasToken])).toEqual([
      ["images/m1/page_1.jpg", "url", true],
      ["images/m1/page_2.jpg", "url", false],
      ["images/m1/page_3.jpg", "url", false],
    ])
    expect(refs[0].category).toBe("manuals/chunks.metadata.diagram_image_urls[].url")
  })

  it("dead v1 Supabase URLs are reported separately, never rewritten", () => {
    const found = findRefs(
      "homes/h1/taskTemplates/t1",
      { metadata: { diagram_image_urls: [{ url: "https://abc.supabase.co/storage/v1/object/public/Manuals/images/m1/page_1.jpg" }] } },
      { bucket: BUCKET, knownObjects: known() },
    )
    expect(found.refs).toHaveLength(0)
    expect(found.v1Urls).toEqual([expect.objectContaining({ objectPath: "images/m1/page_1.jpg", homeId: "h1" })])
  })

  it("references outside homes/ carry no home", () => {
    const refs = refsOf("users/u1", { avatarUrl: tokenUrl("avatars/u1.jpg") }, [])
    expect(refs[0]).toMatchObject({ homeId: null, category: "users(no home).avatarUrl" })
  })

  it("walks only plain maps and arrays — class instances (Timestamps, references) are values", () => {
    class Ts {
      seconds = 1
      label = "photos/u/i/p.jpg"
    }
    const strings = [...walkStrings({ a: new Ts(), b: ["x", { c: "y" }] })].map((s) => s.value)
    expect(strings).toEqual(["x", "y"])
  })

  it("non-http schemes and junk are ignored", () => {
    expect(classifyRefString("gs://b/x", { bucket: BUCKET, knownObjects: known("gs://b/x"), declaredPath: true })).toBeNull()
    expect(classifyRefString("https://exa mple", { bucket: BUCKET, knownObjects: known(), declaredPath: true })).toBeNull()
    expect(classifyRefString("", { bucket: BUCKET, knownObjects: known(), declaredPath: true })).toBeNull()
  })

  it("categories name the collection chain and the field, indices folded", () => {
    expect(categoryFor("homes/h/items/i", ["receiptPath"])).toBe("items.receiptPath")
    expect(categoryFor("homes/h", ["coverPhoto"])).toBe("home.coverPhoto")
    expect(categoryFor("homes/h/taskInstances/t", ["completionPhotos", 0])).toBe("taskInstances.completionPhotos[]")
  })
})

describe("who owns a legacy object — references decide, never the name", () => {
  const objects = [
    obj("photos/u1/i1/photo.jpg", 1000),
    obj("receipts/i1/1-r.jpg", 2000, "md5-r", true),
    obj("u1/i1/manual_1.pdf", 5000),
    obj("shared/manual.pdf", 300),
    obj("orphan/thing.bin", 50),
    obj("homes/h1/photos/u1/i9/photo.jpg", 70),
  ]
  const refs: StorageRef[] = [
    ...refsOf("homes/h1/items/i1", { photoPath: "photos/u1/i1/photo.jpg", receiptPath: "receipts/i1/1-r.jpg" }, []),
    ...refsOf("homes/h1/manuals/m1", { sourceType: "upload", sourceRef: "u1/i1/manual_1.pdf" }, []),
    ...refsOf("homes/h1/items/i2", { photoPath: "photos/u1/gone/photo.jpg" }, []),
    // The same object referenced from two homes → ambiguous.
    ...refsOf("homes/h1/manuals/m2", { sourceType: "upload", sourceRef: "shared/manual.pdf" }, []),
    ...refsOf("homes/h2/manuals/m3", { sourceType: "upload", sourceRef: "shared/manual.pdf" }, []),
    // A tenant object referenced from another home → pre-existing anomaly.
    ...refsOf("homes/h2/items/i9", { photoPath: "homes/h1/photos/u1/i9/photo.jpg" }, []),
  ]
  const plan = planMigration({ objects, refs })

  it("one home → copied to homes/{homeId}/legacy/{originalPath}, every reference rewritten", () => {
    expect(plan.copies.map((c) => [c.src, c.dst])).toEqual([
      ["photos/u1/i1/photo.jpg", "homes/h1/legacy/photos/u1/i1/photo.jpg"],
      ["receipts/i1/1-r.jpg", "homes/h1/legacy/receipts/i1/1-r.jpg"],
      ["u1/i1/manual_1.pdf", "homes/h1/legacy/u1/i1/manual_1.pdf"],
    ])
    expect(plan.refUpdates.map((u) => [u.docPath, u.fieldPath, u.next])).toEqual([
      ["homes/h1/items/i1", ["photoPath"], "homes/h1/legacy/photos/u1/i1/photo.jpg"],
      ["homes/h1/items/i1", ["receiptPath"], "homes/h1/legacy/receipts/i1/1-r.jpg"],
      ["homes/h1/manuals/m1", ["sourceRef"], "homes/h1/legacy/u1/i1/manual_1.pdf"],
    ])
  })

  it("two homes → ambiguous, skipped, nothing copied", () => {
    expect(plan.ambiguous).toEqual([expect.objectContaining({ objectPath: "shared/manual.pdf", reason: "multiple-homes", homes: ["h1", "h2"] })])
    expect(plan.copies.some((c) => c.src === "shared/manual.pdf")).toBe(false)
  })

  it("a reference outside any home makes the object ambiguous too", () => {
    const p = planMigration({
      objects: [obj("avatars/u1.jpg")],
      refs: [...refsOf("homes/h1/items/i1", { photoPath: "avatars/u1.jpg" }, []), ...refsOf("users/u1", { avatarUrl: "avatars/u1.jpg" }, ["avatars/u1.jpg"])],
    })
    expect(p.ambiguous[0]).toMatchObject({ reason: "referenced-outside-a-home" })
    expect(p.copies).toHaveLength(0)
  })

  it("no object behind the reference → missing, skipped", () => {
    expect(plan.missing.map((m) => m.docPath)).toEqual(["homes/h1/items/i2"])
  })

  it("nothing references it → unreferenced, left in place", () => {
    expect(plan.unreferenced.map((o) => o.name)).toEqual(["orphan/thing.bin"])
  })

  it("tenant anomalies are reported, not touched", () => {
    expect(plan.crossHomeTenantRefs.map((r) => r.docPath)).toEqual(["homes/h2/items/i9"])
    expect(plan.missingTenantRefs).toHaveLength(0)
  })

  it("--home narrows what is scheduled, but ambiguity is still judged across every home", () => {
    const p = planMigration({ objects, refs, homeFilter: new Set(["h2"]) })
    expect(p.copies).toHaveLength(0)
    expect(p.outOfScope.map((o) => o.homeId)).toEqual(["h1", "h1", "h1"])
    expect(p.ambiguous).toHaveLength(1)
  })

  it("a destination with the same bytes is 'already copied'; with different bytes it is a conflict, never overwritten", () => {
    const same = planMigration({ objects: [...objects, obj("homes/h1/legacy/photos/u1/i1/photo.jpg", 1000, "md5-photos/u1/i1/photo.jpg")], refs })
    expect(same.copies.find((c) => c.src === "photos/u1/i1/photo.jpg")?.alreadyCopied).toBe(true)
    const diff = planMigration({ objects: [...objects, obj("homes/h1/legacy/photos/u1/i1/photo.jpg", 1000, "md5-OTHER")], refs })
    expect(diff.conflicts.map((c) => c.src)).toEqual(["photos/u1/i1/photo.jpg"])
    expect(diff.refUpdates.some((u) => u.src === "photos/u1/i1/photo.jpg")).toBe(false)
  })

  it("after a full apply the originals read as 'migrated', and a re-plan has nothing to do", () => {
    const after = planMigration({
      objects: [...objects, ...plan.copies.map((c) => obj(c.dst, c.size, c.md5Hash!))],
      refs: refs.map((r) => {
        const u = plan.refUpdates.find((x) => x.docPath === r.docPath && x.fieldPath.join() === r.fieldPath.join())
        return u ? { ...r, value: u.next, objectPath: u.dst } : r
      }),
    })
    expect(after.copies).toHaveLength(0)
    expect(after.refUpdates).toHaveLength(0)
    expect(after.migratedOriginals.map((o) => o.name).sort()).toEqual(plan.copies.map((c) => c.src).sort())
  })

  it("the census counts and sizes, and never contains a stored value or token", () => {
    const withToken = planMigration({
      objects: [obj("images/m1/page_1.jpg", 10, "m", true)],
      refs: refsOf("homes/h1/manuals/m1/chunks/c1", { metadata: { diagram_image_urls: [{ url: tokenUrl("images/m1/page_1.jpg") }] } }, []),
    })
    const s = summarize(withToken)
    expect(s.refs.tokenUrlsTotal).toBe(1)
    expect(s.plan.toCopy).toEqual({ count: 1, bytes: 10 })
    const text = JSON.stringify(s) + formatSummary(s).join("\n") + formatListing(withToken).join("\n")
    expect(text).not.toContain("SECRET-TOKEN")
    expect(text).not.toContain("firebasestorage.googleapis.com")

    const full = summarize(plan)
    expect(full.plan.byHome.h1).toEqual({ objects: 3, bytes: 8000, refUpdates: 3 })
    expect(full.ambiguous.multipleHomes).toEqual({ count: 1, bytes: 300 })
    expect(full.unreferencedLegacy.count).toBe(1)
    expect(full.objects.legacyWithDownloadToken.count).toBe(1)
  })
})

describe("rewriting a reference keeps its form", () => {
  it("path → path", () => {
    expect(rewriteRef("photos/u/i/p.jpg", "path", "homes/h/legacy/photos/u/i/p.jpg")).toBe("homes/h/legacy/photos/u/i/p.jpg")
  })
  it("download URL → same host, bucket and query (token kept), new object", () => {
    const next = rewriteRef(tokenUrl("images/m1/page_1.jpg", "t-1"), "url", "homes/h/legacy/images/m1/page_1.jpg")
    const u = new URL(next)
    expect(u.hostname).toBe("firebasestorage.googleapis.com")
    expect(u.searchParams.get("token")).toBe("t-1")
    expect(decodeURIComponent(u.pathname.split("/o/")[1])).toBe("homes/h/legacy/images/m1/page_1.jpg")
  })
  it("storage.googleapis.com URL → same form", () => {
    expect(rewriteRef(`https://storage.googleapis.com/${BUCKET}/a/b.jpg`, "url", "homes/h/legacy/a/b.jpg")).toBe(
      `https://storage.googleapis.com/${BUCKET}/homes/h/legacy/a/b.jpg`,
    )
  })
  it("the destination rule refuses tenant sources and slashy home ids", () => {
    expect(() => legacyDestination("h", "homes/h/x")).toThrow()
    expect(() => legacyDestination("a/b", "x")).toThrow()
  })
  it("redact hides tokens and signatures", () => {
    expect(redact(tokenUrl("x", "abc"))).toContain("token=REDACTED")
    expect(redact("https://x/y?X-Goog-Signature=s&z=1")).toBe("https://x/y?X-Goog-Signature=REDACTED&z=1")
  })
})

describe("field edits are checked against what the plan expected", () => {
  it("prev → write, next → already, anything else → conflict (someone changed it)", () => {
    expect(decideField("old", "old", "new")).toBe("write")
    expect(decideField("new", "old", "new")).toBe("already")
    expect(decideField("user-changed", "old", "new")).toBe("conflict")
    expect(decideField(undefined, "old", "new")).toBe("conflict")
  })
  it("setAt copies only the containers on the path", () => {
    const shared = { keep: true }
    const root = { metadata: { diagram_image_urls: [{ url: "a" }, { url: "b" }], other: shared }, top: 1 }
    const next = setAt(root, ["metadata", "diagram_image_urls", 1, "url"], "B")
    expect(getAt(next, ["metadata", "diagram_image_urls", 1, "url"])).toBe("B")
    expect(getAt(root, ["metadata", "diagram_image_urls", 1, "url"])).toBe("b")
    expect(next.metadata.other).toBe(shared)
  })
  it("sameBytes needs at least one hash on both sides", () => {
    expect(sameBytes({ size: 1, md5Hash: null, crc32c: null }, { size: 1, md5Hash: null, crc32c: null })).toBe(false)
    expect(sameBytes({ size: 1, md5Hash: "a", crc32c: null }, { size: 1, md5Hash: "a", crc32c: "c" })).toBe(true)
    expect(sameBytes({ size: 1, md5Hash: "a", crc32c: "c" }, { size: 2, md5Hash: "a", crc32c: "c" })).toBe(false)
  })
})

describe("the manifest", () => {
  it("tolerates a torn LAST line (a crash mid-append) but not a torn line in the middle", () => {
    const good = JSON.stringify({ t: "copy-done", src: "a", dst: "b", at: "x" })
    expect(parseManifest(`${good}\n{"t":"ref-in`)).toHaveLength(1)
    expect(() => parseManifest(`{"t":"ref-in\n${good}\n`)).toThrow(/line 1/)
  })
  it("state: done copies, every ref intent in order", () => {
    const st = manifestState(
      parseManifest(
        [
          { t: "header", version: 1, project: "p", bucket: "b", startedAt: "x" },
          { t: "copy-failed", src: "a", dst: "A", reason: "r", at: "x" },
          { t: "copy-done", src: "a", dst: "A", at: "x" },
          { t: "ref-intent", docPath: "homes/h/items/i", updates: [], at: "x" },
        ]
          .map((e) => JSON.stringify(e))
          .join("\n"),
      ),
    )
    expect(st.header?.project).toBe("p")
    expect([...st.copiesDone]).toEqual(["a"])
    expect(st.copiesFailed.size).toBe(0)
    expect(st.refIntents).toHaveLength(1)
  })
})

describe("the production guard", () => {
  const env = {}
  it("defaults to the emulator, dry run", () => {
    const a = parseArgs([])
    expect(a.apply).toBe(false)
    expect(resolveTarget(a, env)).toEqual({ kind: "emulator", project: "demo-homehub", bucket: "demo-homehub.appspot.com" })
  })
  it("refuses production without the explicit approval flag", () => {
    expect(() => resolveTarget(parseArgs(["--project", "homehub-2068d", "--bucket", "b"]), env)).toThrow(/i-have-owner-approval/)
  })
  it("refuses any other real project, even with approval", () => {
    expect(() => resolveTarget(parseArgs(["--project", "someone-else", "--i-have-owner-approval"]), env)).toThrow(/Refusing/)
  })
  it("production with approval is still a DRY RUN unless --apply is added", () => {
    const a = parseArgs(["--project", "homehub-2068d", "--i-have-owner-approval", "--bucket", "homehub-2068d.firebasestorage.app"])
    expect(a.apply).toBe(false)
    expect(resolveTarget(a, env).kind).toBe("production")
  })
  it("production needs an explicit bucket, no emulator env, and --home for --apply", () => {
    expect(() => resolveTarget(parseArgs(["--project", "homehub-2068d", "--i-have-owner-approval"]), env)).toThrow(/--bucket/)
    expect(() =>
      resolveTarget(parseArgs(["--project", "homehub-2068d", "--i-have-owner-approval", "--bucket", "b"]), { FIRESTORE_EMULATOR_HOST: "x" }),
    ).toThrow(/emulator env/)
    expect(() =>
      resolveTarget(
        parseArgs(["--project", "homehub-2068d", "--i-have-owner-approval", "--bucket", "homehub-2068d.appspot.com", "--apply", "--manifest", "m"]),
        env,
      ),
    ).toThrow(/--home/)
  })
  it("--apply needs a manifest; modes are exclusive", () => {
    expect(() => parseArgs(["--apply"])).toThrow(/--manifest/)
    expect(() => parseArgs(["--apply", "--manifest", "m", "--rollback", "m"])).toThrow(/Pick one/)
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown/)
  })
})

// ── gate-1 review follow-ups ─────────────────────────────────────────────────

const SONIA = "a3ba0e21-4bd2-481b-99b8-088d5a90c668"
const PROD = ["--project", "homehub-2068d", "--i-have-owner-approval"]

describe("a wrong bucket cannot hide references", () => {
  it("production only accepts the project's own buckets", () => {
    for (const b of PROD_BUCKETS) expect(resolveTarget(parseArgs([...PROD, "--bucket", b]), {}).bucket).toBe(b)
    expect(() => resolveTarget(parseArgs([...PROD, "--bucket", "homehub-2068d.appspot"]), {})).toThrow(/not this project's bucket/)
    expect(() => resolveTarget(parseArgs([...PROD, "--bucket", "someone-else.appspot.com"]), {})).toThrow(/not this project's bucket/)
  })

  it("Firebase URLs for another bucket are counted as foreign-bucket, never silently dropped", () => {
    const data = { metadata: { diagram_image_urls: [{ url: tokenUrl("images/m1/page_1.jpg") }] }, gcs: `https://storage.googleapis.com/${BUCKET}/a.jpg` }
    const right = findRefs("homes/h1/taskTemplates/t1", data, { bucket: BUCKET, knownObjects: known() })
    expect(right.refs).toHaveLength(2)
    expect(right.foreignBucketUrls).toHaveLength(0)
    // The same document scanned with a mistyped bucket: every URL lands in the
    // visible foreign-bucket count instead of vanishing.
    const wrong = findRefs("homes/h1/taskTemplates/t1", data, { bucket: "typo.appspot.com", knownObjects: known() })
    expect(wrong.refs).toHaveLength(0)
    expect(wrong.foreignBucketUrls.map((f) => f.bucket)).toEqual([BUCKET, BUCKET])
    const s = summarize(planMigration({ objects: [], refs: [], foreignBucketUrls: wrong.foreignBucketUrls }))
    expect(s.foreignBucketUrls).toMatchObject({ total: 2, byBucket: { [BUCKET]: 2 } })
    expect(formatSummary(s).join("\n")).toMatch(/Foreign-bucket Storage URLs .*: 2/)
  })
})

describe("declared path fields holding something unrecognisable are reported", () => {
  it("gs://, outside URLs and junk in photo / receipt / uploaded-manual fields count as unrecognised", () => {
    const item = findRefs("homes/h1/items/i1", { photoPath: `gs://${BUCKET}/photos/x.jpg`, receiptPath: "https://shop.example/r.pdf", notes: "gs://not-declared" }, {
      bucket: BUCKET,
      knownObjects: known(),
    })
    expect(item.refs).toHaveLength(0)
    expect(item.unrecognised.map((u) => [u.category, u.kind])).toEqual([
      ["items.photoPath", "gs-url"],
      ["items.receiptPath", "other-url"],
    ])
    const manual = findRefs("homes/h1/manuals/m1", { sourceType: "upload", sourceRef: "data:application/pdf;base64,AAAA" }, { bucket: BUCKET, knownObjects: known() })
    expect(manual.unrecognised.map((u) => u.kind)).toEqual(["other-url"])
    // A LINKED manual's URL is not a declared path — not reported.
    expect(findRefs("homes/h1/manuals/m2", { sourceType: "url", sourceRef: "https://maker.example/m.pdf" }, { bucket: BUCKET, knownObjects: known() }).unrecognised).toEqual([])
    const s = summarize(planMigration({ objects: [], refs: [], unrecognised: item.unrecognised }))
    expect(s.unrecognised).toEqual({ total: 2, byCategory: { "items.photoPath": { "gs-url": 1 }, "items.receiptPath": { "other-url": 1 } } })
    expect(formatSummary(s).join("\n")).toMatch(/Unrecognised values .*: 2/)
  })
})

describe("protected homes (Sonia's \"My House\")", () => {
  it("is protected by default", () => {
    expect(PROTECTED_HOMES.has(SONIA)).toBe(true)
    expect(deniedProtectedHomes(parseArgs([]))).toEqual(new Set([SONIA]))
  })
  it("naming it with --home is refused without the lift", () => {
    expect(() => deniedProtectedHomes(parseArgs(["--home", SONIA]))).toThrow(/sonia-agreed/)
  })
  it("the lift needs BOTH --include-home <id> and --sonia-agreed", () => {
    expect(() => deniedProtectedHomes(parseArgs(["--include-home", SONIA]))).toThrow(/--sonia-agreed/)
    expect(() => deniedProtectedHomes(parseArgs(["--sonia-agreed"]))).toThrow(/lifts nothing/)
    expect(() => deniedProtectedHomes(parseArgs(["--include-home", "c1d91d18", "--sonia-agreed"]))).toThrow(/not a protected home/)
    expect(deniedProtectedHomes(parseArgs(["--home", SONIA, "--include-home", SONIA, "--sonia-agreed"]))).toEqual(new Set())
  })
  it("a protected home's objects are never scheduled, even when --home names it", () => {
    const refs = refsOf(`homes/${SONIA}/items/i1`, { photoPath: "photos/s/i1/photo.jpg" }, [])
    const p = planMigration({ objects: [obj("photos/s/i1/photo.jpg")], refs, homeFilter: new Set([SONIA]), protectedHomes: new Set([SONIA]) })
    expect(p.copies).toEqual([])
    expect(p.protectedSkipped).toEqual([{ objectPath: "photos/s/i1/photo.jpg", homeId: SONIA, refs: 1 }])
    expect(formatSummary(summarize(p)).join("\n")).toContain(`Skipped — protected home (needs --include-home + --sonia-agreed): 1 (${SONIA}: 1)`)
  })
})

describe("--home is checked against the target before anything runs", () => {
  it("unknown ids are refused; known ones print name and member count", () => {
    expect(() => homeGate([{ id: "nope", exists: false, name: null, members: 0 }])).toThrow(/Unknown --home id\(s\): nope/)
    expect(homeGate([{ id: "c1", exists: true, name: "SF Condo", members: 2 }])).toEqual(['  --home c1  "SF Condo"  2 member(s)'])
  })
})

describe("the manifest is bound to one migration", () => {
  const header = { t: "header" as const, version: 1 as const, project: "p", bucket: "b", startedAt: "x", homes: ["h1"] }
  it("a different --home scope, project or bucket is refused", () => {
    expect(() => checkManifestHeader(header, { project: "p", bucket: "b", homes: ["h1"] }, "m")).not.toThrow()
    expect(() => checkManifestHeader(header, { project: "p", bucket: "b", homes: ["h2"] }, "m")).toThrow(/started for --home h1; this run is for h2/)
    expect(() => checkManifestHeader(header, { project: "p", bucket: "b", homes: null }, "m")).toThrow(/all homes/)
    expect(() => checkManifestHeader(header, { project: "q", bucket: "b", homes: ["h1"] }, "m")).toThrow(/belongs to p\/b/)
    expect(() => checkManifestHeader(null, { project: "p", bucket: "b", homes: null }, "m")).not.toThrow()
  })
  it("a non-empty manifest that does not start with a header is refused", () => {
    expect(() => requireHeader([], "m")).not.toThrow()
    expect(() => requireHeader([{ t: "copy-done", src: "a", dst: "b", at: "x" }], "m")).toThrow(/does not start with a migration manifest header/)
    expect(() => requireHeader([header], "m")).not.toThrow()
  })
})

describe("apply's exit code and progress", () => {
  const clean = { refsNotUpdated: [], destinationsMissing: [], originalsMissing: [] }
  it("any reference not holding its new value fails the run", () => {
    expect(applyExitCode({ copyFailed: [], fieldConflicts: [] }, clean)).toBe(0)
    expect(applyExitCode({ copyFailed: [], fieldConflicts: [] }, { ...clean, refsNotUpdated: [{}] })).toBe(2)
    expect(applyExitCode({ copyFailed: [{}], fieldConflicts: [] }, clean)).toBe(2)
    expect(applyExitCode({ copyFailed: [], fieldConflicts: [] }, { ...clean, originalsMissing: ["x"] })).toBe(2)
  })
  it("prints a progress line every 25 items and on the last", () => {
    expect(progressLine({ phase: "copy", done: 0, total: 60 })).toBe("  … copying objects 1/60")
    expect(progressLine({ phase: "copy", done: 1, total: 60 })).toBeNull()
    expect(progressLine({ phase: "copy", done: 25, total: 60 })).toBe("  … copying objects 26/60")
    expect(progressLine({ phase: "ref", done: 59, total: 60 })).toBe("  … rewriting documents 60/60")
    expect(progressLine({ phase: "ref", done: 0, total: 0 })).toBeNull()
  })
})
