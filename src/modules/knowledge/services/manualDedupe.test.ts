/**
 * HH-154 — adding the same manual twice must not mint a second record.
 *
 * Owner, 2026-09-05: "Why is the rice cooker saved 4 times here?" — four
 * documents for one appliance, one scanned and three stuck at "Not scanned"
 * forever, with no way to remove them. Every add called createManualDocument,
 * which always created. A retried upload became a duplicate instead of a
 * replacement.
 *
 * The first fix matched uploads on their STORAGE PATH, and its test used one
 * fixed path for every add. Real uploads never repeat a path — each lands at
 * `manual_<timestamp>.pdf` — so the owner's case sailed straight past it. These
 * use a fresh path per upload, as the app does: only the CONTENT repeats, and
 * the content (its SHA-256) is what is matched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

type Data = Record<string, unknown>
type Clause = { f: string; op: string; v: unknown }

/** The emulated manuals collection: id → fields. */
const store = new Map<string, Data>()
/** The emulated manualHashes collection (Codex finding 4): claim id → fields. */
const claims = new Map<string, Data>()
let nextId = 1
const snapOf = (id: string, from: Map<string, Data> = store) => {
  const data = from.get(id) ?? {}
  return { id, ref: { id }, exists: () => from.has(id), data: () => data, get: (k: string) => data[k] }
}
type Ref = { id: string; path: string }
const isClaim = (ref: Ref) => ref.path.includes("/manualHashes/")

const getDocs = vi.fn(async (q: { q: [unknown, ...Clause[]] }) => {
  const clauses = q.q.slice(1) as Clause[]
  const ids = [...store.keys()].filter((id) => clauses.every((c) => (store.get(id)![c.f] ?? null) === c.v))
  return { docs: ids.map((id) => snapOf(id)) }
})
const set = vi.fn((ref: { id: string }, data: Data) => { store.set(ref.id, { ...data }); return batch })
const update = vi.fn((ref: { id: string }, data: Data) => { store.set(ref.id, { ...store.get(ref.id), ...data }); return batch })
const batch = { set, update, commit: vi.fn(async () => undefined) }

/**
 * Firestore runs transactions as if one at a time — a transaction whose reads
 * went stale is retried — so the emulation runs them strictly in turn. That is
 * the guarantee the claim relies on; the real concurrent pair runs against the
 * emulator in firebase/rules.test.ts.
 */
let txChain: Promise<unknown> = Promise.resolve()
const runTransaction = vi.fn((_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    get: async (ref: Ref) => (isClaim(ref) ? snapOf(ref.id, claims) : snapOf(ref.id)),
    set: (ref: Ref, data: Data) => { if (isClaim(ref)) claims.set(ref.id, { ...data }); else set(ref, data); return tx },
  }
  const run = txChain.then(() => fn(tx))
  txChain = run.catch(() => undefined)
  return run
})

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  // doc(db, "a/b/id") and doc(collectionRef, "id") name a doc; doc(collectionRef) mints one.
  doc: (parent: { path?: string }, path?: string) => {
    if (path) return { id: path.split("/").pop()!, path: parent.path ? `${parent.path}/${path}` : path }
    const id = `new-${nextId++}`
    return { id, path: `${parent.path}/${id}` }
  },
  runTransaction: (db: unknown, fn: (tx: unknown) => Promise<unknown>) => runTransaction(db, fn),
  query: (...a: unknown[]) => ({ q: a }),
  where: (f: string, op: string, v: unknown) => ({ f, op, v }),
  getDocs: (q: { q: [unknown, ...Clause[]] }) => getDocs(q),
  getDoc: async (ref: { id: string }) => snapOf(ref.id),
  writeBatch: () => batch,
  serverTimestamp: () => "ts",
  Timestamp: class { toDate() { return new Date() } },
}))

const getMetadata = vi.fn()
vi.mock("firebase/storage", () => ({
  ref: (_s: unknown, path: string) => ({ path }),
  getMetadata: (...a: unknown[]) => getMetadata(...a),
}))
vi.mock("@/integrations/firebase", () => ({ db: {}, storage: {}, callable: () => vi.fn() }))

const removeManualPdf = vi.fn<(path: string) => Promise<{ data: true; error: null }>>(async () => ({ data: true, error: null }))
vi.mock("@/modules/inventory/services/storageService", () => ({
  MANUAL_HASH_METADATA_KEY: "sha256",
  removeManualPdf: (path: string) => removeManualPdf(path),
}))

const { createManualDocument } = await import("./manualDocumentService")

const RICE = "a".repeat(64)
/** The nth upload of a file: its own timestamped path, as uploadManualPdf makes it. */
const upload = (n: number, over: Data = {}) => ({
  item_unit_id: "rice-cooker",
  title: "Rice Cooker.pdf",
  source_type: "upload" as const,
  source_ref: `homes/h1/manuals/u1/rice-cooker/manual_17590000000${n}.pdf`,
  content_hash: RICE,
  ...over,
})
const live = () => [...store.values()].filter((d) => d.deletedAt == null)

beforeEach(() => {
  vi.clearAllMocks()
  store.clear()
  claims.clear()
  nextId = 1
})

describe("an upload is the same manual when its CONTENT is (HH-154)", () => {
  it("four uploads of the same PDF, each at a new path, leave ONE record — the owner's case", async () => {
    const ids = new Set<string>()
    for (const n of [1, 2, 3, 4]) {
      const res = await createManualDocument("h1", upload(n))
      expect(res.error).toBeNull()
      ids.add(res.data!.manual_id)
    }
    expect(ids.size).toBe(1)
    expect(live()).toHaveLength(1)
    expect(set).toHaveBeenCalledTimes(1)
    // The three redundant copies are removed; the record keeps its own file.
    expect(removeManualPdf.mock.calls.map((c) => c[0])).toEqual([
      upload(2).source_ref, upload(3).source_ref, upload(4).source_ref,
    ])
    expect(live()[0].sourceRef).toBe(upload(1).source_ref)
  })

  it("the record is reused AS IT IS — its scan is still right for the same bytes", async () => {
    store.set("read-1", {
      itemUnitId: "rice-cooker", sourceType: "upload", sourceRef: upload(1).source_ref, contentHash: RICE,
      parsedAt: "2026-09-05T10:00:00Z", parse: { stage: "done" }, draft: null, deletedAt: null,
    })
    const res = await createManualDocument("h1", upload(2))
    expect(res.data?.manual_id).toBe("read-1")
    expect(res.data?.parsed_at).toBe("2026-09-05T10:00:00Z")
    expect(res.data?.parse_stage).toBe("done")
    expect(update).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it("a new record carries its hash, so the next upload of it is recognised", async () => {
    const res = await createManualDocument("h1", upload(1))
    expect(res.data?.content_hash).toBe(RICE)
    expect(set.mock.calls[0][1]).toMatchObject({ contentHash: RICE, sourceRef: upload(1).source_ref })
  })

  it("a DIFFERENT file on the same item still gets its own record", async () => {
    await createManualDocument("h1", upload(1))
    await createManualDocument("h1", upload(2, { title: "Quick start.pdf", content_hash: "b".repeat(64) }))
    expect(live()).toHaveLength(2)
    expect(removeManualPdf).not.toHaveBeenCalled()
  })

  it("the same file on a DIFFERENT item is that item's manual, not a duplicate", async () => {
    await createManualDocument("h1", upload(1))
    await createManualDocument("h1", upload(2, { item_unit_id: "second-rice-cooker" }))
    expect(live()).toHaveLength(2)
  })

  it("a removed manual does not swallow a fresh upload of the same file", async () => {
    store.set("gone", { itemUnitId: "rice-cooker", sourceType: "upload", sourceRef: upload(1).source_ref, contentHash: RICE, deletedAt: "2026-09-06" })
    const res = await createManualDocument("h1", upload(2))
    expect(res.data?.manual_id).not.toBe("gone")
    expect(set).toHaveBeenCalledTimes(1)
  })

  it("a caller that hands over only the path (the item page) is recognised through the upload's metadata", async () => {
    await createManualDocument("h1", upload(1))
    getMetadata.mockResolvedValue({ customMetadata: { sha256: RICE } })
    const res = await createManualDocument("h1", upload(2, { content_hash: undefined }))
    expect(getMetadata).toHaveBeenCalledWith({ path: upload(2).source_ref })
    expect(live()).toHaveLength(1)
    expect(res.data?.manual_id).toBe("new-1")
  })

  it("an upload whose hash cannot be read is still attached — only the dedupe is lost", async () => {
    getMetadata.mockRejectedValue(new Error("storage/unauthorized"))
    const res = await createManualDocument("h1", upload(1, { content_hash: undefined }))
    expect(res.error).toBeNull()
    expect(set).toHaveBeenCalledTimes(1)
    // Absent, not null: nothing is stored that claims to be a hash.
    expect(set.mock.calls[0][1]).not.toHaveProperty("contentHash")
  })

  it("a file the browser could not hash: no metadata read, NO contentHash stored, and its path still dedupes", async () => {
    // uploadManualPdf returns contentHash null when Web Crypto is missing (and
    // logs it). That null is the caller saying "no hash", not "go look".
    const unhashed = upload(1, { content_hash: null })
    const first = await createManualDocument("h1", unhashed)
    expect(first.error).toBeNull()
    expect(getMetadata).not.toHaveBeenCalled()
    expect(set.mock.calls[0][1]).not.toHaveProperty("contentHash")
    expect(first.data?.content_hash).toBeNull()

    // The same stored file offered again falls back to the path match: still one manual.
    const again = await createManualDocument("h1", unhashed)
    expect(again.data?.manual_id).toBe(first.data?.manual_id)
    expect(set).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
    expect(live()).toHaveLength(1)
  })

  it("a failed duplicate check does not block the add — it falls through to creating", async () => {
    getDocs.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"))
    const res = await createManualDocument("h1", upload(1))
    expect(res.error).toBeNull()
    expect(set).toHaveBeenCalledTimes(1)
  })
})

describe("two adds of the same file at the same moment (Codex finding 4)", () => {
  // Both adds query before either has written, so both see "no twin" — the
  // review's case: two tabs, or two household members, adding one PDF. Before
  // the claim, both created a manual and both started a paid read.
  it("leave ONE manual; the second add gets the first one's record and its upload is removed", async () => {
    const [a, b] = await Promise.all([
      createManualDocument("h1", upload(1)),
      createManualDocument("h1", upload(2)),
    ])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(b.data?.manual_id).toBe(a.data?.manual_id)
    expect(live()).toHaveLength(1)
    expect(set).toHaveBeenCalledTimes(1)
    expect(removeManualPdf.mock.calls.map((c) => c[0])).toEqual([upload(2).source_ref])
  })

  it("the claim names the manual it was taken for", async () => {
    const res = await createManualDocument("h1", upload(1))
    expect(claims.get(`rice-cooker_${RICE}`)).toMatchObject({
      manualId: res.data?.manual_id, itemUnitId: "rice-cooker", contentHash: RICE,
    })
  })

  it("a claim left by a REMOVED manual is taken over — removing stays a soft delete", async () => {
    store.set("gone", { itemUnitId: "rice-cooker", sourceRef: upload(1).source_ref, contentHash: RICE, deletedAt: "2026-09-06" })
    claims.set(`rice-cooker_${RICE}`, { manualId: "gone", itemUnitId: "rice-cooker", contentHash: RICE })
    const res = await createManualDocument("h1", upload(2))
    expect(res.data?.manual_id).not.toBe("gone")
    expect(claims.get(`rice-cooker_${RICE}`)?.manualId).toBe(res.data?.manual_id)
    // The removed manual is left exactly as it was.
    expect(store.get("gone")?.deletedAt).toBe("2026-09-06")
  })

  it("a claim that cannot be taken (offline, refused) never blocks the add", async () => {
    runTransaction.mockRejectedValueOnce(new Error("permission-denied"))
    const res = await createManualDocument("h1", upload(1))
    expect(res.error).toBeNull()
    expect(live()).toHaveLength(1)
  })

  it("a link is never claimed — it has no content hash", async () => {
    await createManualDocument("h1", { item_unit_id: "rice-cooker", title: "x", source_type: "url", source_ref: "https://example.com/r.pdf" })
    expect(runTransaction).not.toHaveBeenCalled()
  })
})

describe("a link is the same manual when its URL is", () => {
  const link = {
    item_unit_id: "rice-cooker",
    title: "https://example.com/rice.pdf",
    source_type: "url" as const,
    source_ref: "https://example.com/rice.pdf",
  }

  it("REUSES the record, and resets its read — what a URL serves can change", async () => {
    await createManualDocument("h1", link)
    store.set("new-1", { ...store.get("new-1"), parsedAt: "2026-09-05T10:00:00Z", parse: { stage: "done" } })
    const res = await createManualDocument("h1", link)
    expect(res.data?.manual_id).toBe("new-1")
    expect(set).toHaveBeenCalledTimes(1)
    const patch = update.mock.calls[0][1] as Data
    expect(patch.parsedAt).toBeNull()
    expect(patch.parse).toBeNull()
    // Links are never hashed or read back from Storage, and carry no hash field.
    expect(getMetadata).not.toHaveBeenCalled()
    expect(set.mock.calls[0][1]).not.toHaveProperty("contentHash")
  })
})
