/**
 * The I/O half of the legacy-Storage migration: discover (read-only), apply
 * (copy → verify → rewrite references, manifest first), rollback, verify.
 * The rules it follows live in storageLegacyMigration.ts; the CLI and its
 * production guard live in migrate-legacy-storage.ts. Exported as functions so
 * firebase/storage-migration.emu.test.ts can drive it in-process — including a
 * crash in the middle of a run.
 *
 * Nothing here prints a stored value, a URL or an object's bytes. Discovery
 * reads object METADATA only; the copy is server-side (GCS rewrite), so the
 * bytes never pass through this process.
 */
import { appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, statSync } from "node:fs"
import { FieldPath as FsFieldPath, type DocumentReference, type Firestore } from "firebase-admin/firestore"
import type { getStorage } from "firebase-admin/storage"
import {
  checkManifestHeader,
  decideField,
  fieldPathKey,
  findRefs,
  getAt,
  manifestState,
  parseManifest,
  planMigration,
  requireHeader,
  sameBytes,
  setAt,
  type FieldPath,
  type ForeignBucketUrlRef,
  type ManifestEntry,
  type MigrationPlan,
  type RefUpdate,
  type StorageObjectFacts,
  type StorageRef,
  type UnrecognisedRef,
  type V1UrlRef,
} from "./storageLegacyMigration.js"

export type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>

/** The custom-metadata key that makes Firebase download URLs work. */
const DOWNLOAD_TOKENS = "firebaseStorageDownloadTokens"

// ── discovery (read-only) ────────────────────────────────────────────────────

export async function listObjects(bucket: Bucket): Promise<StorageObjectFacts[]> {
  const [files] = await bucket.getFiles({ autoPaginate: true })
  return files
    .map((f) => {
      const m = f.metadata
      return {
        name: f.name,
        size: Number(m.size ?? 0),
        md5Hash: typeof m.md5Hash === "string" ? m.md5Hash : null,
        crc32c: typeof m.crc32c === "string" ? m.crc32c : null,
        contentType: typeof m.contentType === "string" ? m.contentType : null,
        hasDownloadToken: Boolean((m.metadata as Record<string, unknown> | undefined)?.[DOWNLOAD_TOKENS]),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Every document in the database, depth-first: each top-level collection,
 *  every document in it (including path-only parents), every subcollection.
 *  `listDocuments` rather than a query, so a document that exists only as the
 *  parent of a subcollection is still descended into. */
export async function forEachDocument(
  db: Firestore,
  visit: (path: string, data: Record<string, unknown>) => void,
  concurrency = 16,
): Promise<number> {
  let scanned = 0
  const walk = async (refs: DocumentReference[]): Promise<void> => {
    for (let i = 0; i < refs.length; i += concurrency) {
      await Promise.all(
        refs.slice(i, i + concurrency).map(async (ref) => {
          const snap = await ref.get()
          if (snap.exists) {
            scanned++
            visit(ref.path, snap.data() ?? {})
          }
          for (const sub of await ref.listCollections()) await walk(await sub.listDocuments())
        }),
      )
    }
  }
  for (const col of await db.listCollections()) await walk(await col.listDocuments())
  return scanned
}

export interface Discovery {
  objects: StorageObjectFacts[]
  refs: StorageRef[]
  v1Urls: V1UrlRef[]
  foreignBucketUrls: ForeignBucketUrlRef[]
  unrecognised: UnrecognisedRef[]
  scannedDocs: number
}

export async function discover(db: Firestore, bucket: Bucket): Promise<Discovery> {
  const objects = await listObjects(bucket)
  const knownObjects = new Set(objects.map((o) => o.name))
  const d: Omit<Discovery, "objects" | "scannedDocs"> = { refs: [], v1Urls: [], foreignBucketUrls: [], unrecognised: [] }
  const scannedDocs = await forEachDocument(db, (path, data) => {
    const found = findRefs(path, data, { bucket: bucket.name, knownObjects })
    d.refs.push(...found.refs)
    d.v1Urls.push(...found.v1Urls)
    d.foreignBucketUrls.push(...found.foreignBucketUrls)
    d.unrecognised.push(...found.unrecognised)
  })
  d.refs.sort((a, b) => a.docPath.localeCompare(b.docPath) || fieldPathKey(a.fieldPath).localeCompare(fieldPathKey(b.fieldPath)))
  return { objects, ...d, scannedDocs }
}

export async function planFromLive(
  db: Firestore,
  bucket: Bucket,
  homeFilter: ReadonlySet<string> | null = null,
  protectedHomes: ReadonlySet<string> = new Set(),
): Promise<{ plan: MigrationPlan; scannedDocs: number }> {
  const d = await discover(db, bucket)
  return {
    plan: planMigration({
      objects: d.objects,
      refs: d.refs,
      v1Urls: d.v1Urls,
      foreignBucketUrls: d.foreignBucketUrls,
      unrecognised: d.unrecognised,
      homeFilter,
      protectedHomes,
    }),
    scannedDocs: d.scannedDocs,
  }
}

export interface HomeFacts {
  id: string
  exists: boolean
  name: string | null
  members: number
}

/** What the operator is about to touch, per --home: does it exist, what is it
 *  called, how many people belong to it. Read-only. */
export async function describeHomes(db: Firestore, ids: readonly string[]): Promise<HomeFacts[]> {
  return Promise.all(
    ids.map(async (id) => {
      const [home, members] = await Promise.all([db.doc(`homes/${id}`).get(), db.collection(`homes/${id}/members`).count().get()])
      const name = home.get("name")
      return { id, exists: home.exists, name: typeof name === "string" ? name : null, members: members.data().count }
    }),
  )
}

// ── the manifest file ────────────────────────────────────────────────────────

export class Manifest {
  readonly path: string
  readonly entries: ManifestEntry[]
  constructor(path: string) {
    this.path = path
    if (existsSync(path)) {
      // It holds previous field values (token URLs among them): owner-only,
      // whoever created it. Tightened rather than refused — the content is
      // already on disk, so refusing would only stop the rollback it enables.
      if ((statSync(path).mode & 0o077) !== 0) chmodSync(path, 0o600)
      this.entries = parseManifest(readFileSync(path, "utf8"))
      requireHeader(this.entries, path)
    } else {
      this.entries = []
    }
  }

  /** Append one entry and fsync it, so the record of an intent is on disk
   *  BEFORE the mutation it describes starts. The file is created 0600: it
   *  holds previous field values, and a previous value can be a token URL. */
  append(entry: ManifestEntry): void {
    const fd = openSync(this.path, "a", 0o600)
    try {
      appendFileSync(fd, `${JSON.stringify(entry)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    this.entries.push(entry)
  }
}

// ── apply ────────────────────────────────────────────────────────────────────

export interface ApplyHooks {
  /** Called before every mutation (a copy, a document write). Throwing here is
   *  how the emulator suite simulates a crash part-way through a run. */
  beforeMutation?: (kind: "copy" | "ref", label: string) => void
  /** Called after each copy and each document, with running totals — the CLI
   *  prints a line from it so a long apply is visibly alive. */
  onProgress?: (p: { phase: "copy" | "ref"; done: number; total: number }) => void
}

export interface ApplyResult {
  copied: number
  copyAlreadyPresent: number
  copyFailed: Array<{ src: string; reason: string }>
  docsUpdated: number
  fieldsWritten: number
  fieldsAlready: number
  fieldConflicts: Array<{ docPath: string; fieldPath: FieldPath }>
  skippedRefsForFailedCopies: number
}

const now = () => new Date().toISOString()

/** The metadata a copy must carry over unchanged (custom metadata includes the
 *  download token, so a token URL rewritten to the new path keeps working). */
function comparableMetadata(m: Record<string, unknown>) {
  return {
    contentType: m.contentType ?? null,
    contentEncoding: m.contentEncoding ?? null,
    contentDisposition: m.contentDisposition ?? null,
    contentLanguage: m.contentLanguage ?? null,
    cacheControl: m.cacheControl ?? null,
    metadata: m.metadata ?? null,
  }
}

function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  )
}

/** Copy src → dst server-side and prove the copy: same size, same hashes, same
 *  content type and custom metadata. Never overwrites an existing destination
 *  (ifGenerationMatch: 0). Returns null on success, else why it failed. */
async function copyAndVerify(bucket: Bucket, src: string, dst: string): Promise<string | null> {
  const srcFile = bucket.file(src)
  const dstFile = bucket.file(dst)
  const [srcMeta] = await srcFile.getMetadata()
  const [dstExists] = await dstFile.exists()
  if (!dstExists) {
    await srcFile.copy(dstFile, { preconditionOpts: { ifGenerationMatch: 0 } })
  }
  const [dstMeta] = await dstFile.getMetadata()
  const a = { size: Number(srcMeta.size ?? -1), md5Hash: (srcMeta.md5Hash as string) ?? null, crc32c: (srcMeta.crc32c as string) ?? null }
  const b = { size: Number(dstMeta.size ?? -2), md5Hash: (dstMeta.md5Hash as string) ?? null, crc32c: (dstMeta.crc32c as string) ?? null }
  if (!sameBytes(a, b)) return `bytes differ after copy (size ${a.size} vs ${b.size}, hashes ${a.md5Hash === b.md5Hash ? "md5 =" : "md5 ≠"} ${a.crc32c === b.crc32c ? "crc32c =" : "crc32c ≠"})`
  if (stableJson(comparableMetadata(srcMeta as Record<string, unknown>)) !== stableJson(comparableMetadata(dstMeta as Record<string, unknown>))) {
    return "metadata differs after copy (content type / custom metadata)"
  }
  return null
}

/** Rewrite one document's references inside a transaction, field by field
 *  against what the plan expected. Returns per-field outcomes. */
async function rewriteDoc(
  db: Firestore,
  docPath: string,
  updates: Array<{ fieldPath: FieldPath; from: string; to: string }>,
): Promise<{ written: number; already: number; conflicts: FieldPath[] }> {
  return db.runTransaction(async (tx) => {
    const ref = db.doc(docPath)
    const snap = await tx.get(ref)
    const data = snap.data()
    if (!snap.exists || !data) return { written: 0, already: 0, conflicts: updates.map((u) => u.fieldPath) }
    let next: Record<string, unknown> = data
    const touchedTop = new Set<string>()
    let written = 0
    let already = 0
    const conflicts: FieldPath[] = []
    for (const u of updates) {
      const decision = decideField(getAt(next, u.fieldPath), u.from, u.to)
      if (decision === "already") already++
      else if (decision === "conflict") conflicts.push(u.fieldPath)
      else {
        next = setAt(next, u.fieldPath, u.to)
        touchedTop.add(String(u.fieldPath[0]))
        written++
      }
    }
    if (touchedTop.size > 0) {
      // FieldPath, not a dotted string: a top-level key may itself contain a
      // dot. Only the touched top-level fields are written; updatedAt is left
      // alone on purpose — moving a file is not a user edit.
      const [firstKey, ...restKeys] = [...touchedTop]
      const rest = restKeys.flatMap((k) => [new FsFieldPath(k), next[k]])
      tx.update(ref, new FsFieldPath(firstKey), next[firstKey], ...rest)
    }
    return { written, already, conflicts }
  })
}

function groupByDoc(updates: RefUpdate[]): Map<string, RefUpdate[]> {
  const m = new Map<string, RefUpdate[]>()
  for (const u of updates) {
    const list = m.get(u.docPath) ?? []
    list.push(u)
    m.set(u.docPath, list)
  }
  return m
}

/**
 * Execute a plan. Order per object: manifest copy-intent → copy → verify →
 * copy-done; then per document: manifest ref-intent → transaction → ref-done.
 * A reference is only rewritten once its object's copy is VERIFIED in this run
 * or recorded as done in the manifest. Re-running with the same manifest after
 * an interruption resumes: a present, identical destination is not copied
 * again, and a field already holding its new value is not written again.
 */
export async function applyPlan(
  db: Firestore,
  bucket: Bucket,
  plan: MigrationPlan,
  manifest: Manifest,
  ctx: { project: string; homes: string[] | null },
  hooks: ApplyHooks = {},
): Promise<ApplyResult> {
  const st = manifestState(manifest.entries)
  checkManifestHeader(st.header, { project: ctx.project, bucket: bucket.name, homes: ctx.homes }, manifest.path)
  if (!st.header) {
    manifest.append({ t: "header", version: 1, project: ctx.project, bucket: bucket.name, startedAt: now(), homes: ctx.homes })
  }

  const res: ApplyResult = {
    copied: 0,
    copyAlreadyPresent: 0,
    copyFailed: [],
    docsUpdated: 0,
    fieldsWritten: 0,
    fieldsAlready: 0,
    fieldConflicts: [],
    skippedRefsForFailedCopies: 0,
  }

  const verified = new Set<string>()
  let copiesSeen = 0
  for (const c of plan.copies) {
    hooks.onProgress?.({ phase: "copy", done: copiesSeen++, total: plan.copies.length })
    if (c.alreadyCopied && st.copiesDone.has(c.src)) {
      verified.add(c.src)
      res.copyAlreadyPresent++
      continue
    }
    manifest.append({ t: "copy-intent", src: c.src, dst: c.dst, homeId: c.homeId, size: c.size, md5Hash: c.md5Hash, crc32c: c.crc32c, at: now() })
    hooks.beforeMutation?.("copy", c.src)
    let failure: string | null
    try {
      failure = await copyAndVerify(bucket, c.src, c.dst)
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e)
    }
    if (failure) {
      manifest.append({ t: "copy-failed", src: c.src, dst: c.dst, reason: failure, at: now() })
      res.copyFailed.push({ src: c.src, reason: failure })
      continue
    }
    manifest.append({ t: "copy-done", src: c.src, dst: c.dst, at: now() })
    verified.add(c.src)
    if (c.alreadyCopied) res.copyAlreadyPresent++
    else res.copied++
  }

  const byDoc = groupByDoc(plan.refUpdates)
  let docsSeen = 0
  for (const [docPath, updates] of byDoc) {
    hooks.onProgress?.({ phase: "ref", done: docsSeen++, total: byDoc.size })
    const ready = updates.filter((u) => verified.has(u.src))
    res.skippedRefsForFailedCopies += updates.length - ready.length
    if (ready.length === 0) continue
    manifest.append({
      t: "ref-intent",
      docPath,
      updates: ready.map(({ fieldPath, prev, next, src, dst }) => ({ fieldPath, prev, next, src, dst })),
      at: now(),
    })
    hooks.beforeMutation?.("ref", docPath)
    const out = await rewriteDoc(db, docPath, ready.map((u) => ({ fieldPath: u.fieldPath, from: u.prev, to: u.next })))
    manifest.append({ t: "ref-done", docPath, applied: out.written, already: out.already, conflicts: out.conflicts, at: now() })
    if (out.written > 0) res.docsUpdated++
    res.fieldsWritten += out.written
    res.fieldsAlready += out.already
    for (const fp of out.conflicts) res.fieldConflicts.push({ docPath, fieldPath: fp })
  }
  return res
}

// ── rollback ─────────────────────────────────────────────────────────────────

export interface RollbackResult {
  docs: number
  restored: number
  already: number
  conflicts: Array<{ docPath: string; fieldPath: FieldPath }>
}

/**
 * Put every reference the manifest says was (or may have been) rewritten back
 * to its previous value — newest first. A field is restored only if it still
 * holds the value the migration wrote; a field someone has changed since is
 * reported, not overwritten. Copies are left in place (deleting is the owner's
 * call, never this script's): with the references restored they are simply
 * unreferenced duplicates.
 */
export async function rollback(db: Firestore, manifest: Manifest): Promise<RollbackResult> {
  const st = manifestState(manifest.entries)
  if (!st.header) throw new Error(`${manifest.path} has no header — not a migration manifest`)
  const res: RollbackResult = { docs: 0, restored: 0, already: 0, conflicts: [] }
  // A field can appear in several intents (an interrupted run re-planned, or a
  // re-apply after a rollback). The NEWEST intent for each field decides.
  const seen = new Set<string>()
  for (const intent of [...st.refIntents].reverse()) {
    const updates = intent.updates.filter((u) => {
      const key = `${intent.docPath}#${fieldPathKey(u.fieldPath)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (updates.length === 0) continue
    const out = await rewriteDoc(db, intent.docPath, updates.map((u) => ({ fieldPath: u.fieldPath, from: u.next, to: u.prev })))
    manifest.append({ t: "rollback-done", docPath: intent.docPath, restored: out.written, already: out.already, conflicts: out.conflicts, at: now() })
    res.docs++
    res.restored += out.written
    res.already += out.already
    for (const fp of out.conflicts) res.conflicts.push({ docPath: intent.docPath, fieldPath: fp })
  }
  return res
}

// ── verify ───────────────────────────────────────────────────────────────────

export interface VerifyResult {
  refsChecked: number
  refsPointingAtNew: number
  refsNotUpdated: Array<{ docPath: string; fieldPath: FieldPath }>
  destinationsMissing: string[]
  originalsMissing: string[]
}

/** After an apply: every rewritten field holds its new value, every new object
 *  exists, and every ORIGINAL still exists (nothing was deleted). */
export async function verifyManifest(db: Firestore, bucket: Bucket, manifest: Manifest): Promise<VerifyResult> {
  const st = manifestState(manifest.entries)
  const res: VerifyResult = { refsChecked: 0, refsPointingAtNew: 0, refsNotUpdated: [], destinationsMissing: [], originalsMissing: [] }
  const pairs = new Map<string, string>()
  const seen = new Set<string>()
  for (const intent of [...st.refIntents].reverse()) {
    const snap = await db.doc(intent.docPath).get()
    for (const u of intent.updates) {
      const key = `${intent.docPath}#${fieldPathKey(u.fieldPath)}`
      if (seen.has(key)) continue // the newest intent for a field decides
      seen.add(key)
      pairs.set(u.src, u.dst)
      res.refsChecked++
      if (getAt(snap.data(), u.fieldPath) === u.next) res.refsPointingAtNew++
      else res.refsNotUpdated.push({ docPath: intent.docPath, fieldPath: u.fieldPath })
    }
  }
  for (const [src, dst] of pairs) {
    if (!(await bucket.file(dst).exists())[0]) res.destinationsMissing.push(dst)
    if (!(await bucket.file(src).exists())[0]) res.originalsMissing.push(src)
  }
  return res
}
