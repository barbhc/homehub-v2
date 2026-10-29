/**
 * The RULES of the legacy-Storage migration (docs/storage-legacy-migration.md):
 * what counts as a reference to a Storage object, which home an object belongs
 * to, where it moves, and how a reference is rewritten. Pure and
 * firebase-free, so the unit run gates it; the CLI that reads and writes
 * (migrate-legacy-storage.ts, via storageLegacyMigrationRunner.ts) is proven
 * against the emulators in firebase/storage-migration.emu.test.ts.
 *
 * THE OWNERSHIP RULE. An object's household is decided ONLY by the Firestore
 * documents that reference it: every reference must sit under the same
 * homes/{homeId}/… document tree. Never by the object's name — v1 paths carry a
 * uid or an item id, never a home, and a uid can belong to several homes. An
 * object referenced from two homes, or from a document outside any home, is
 * AMBIGUOUS and is reported, never copied. An unreferenced object is reported,
 * never moved.
 *
 * THE DESTINATION. A resolved object is COPIED (the original stays) to
 *   homes/{homeId}/legacy/{originalPath}
 * — one rule for every shape, so nothing is inferred from the old path's
 * layout, the original is recoverable from the new name, and no two originals
 * can collide. Under the live storage.rules any member of that home can read it
 * and nobody can write or delete it from a client (no write clause matches).
 */

/** A Firestore field location: top-level key, then nested keys / array indices. */
export type FieldPath = Array<string | number>

/** What the migration needs to know about one Storage object (metadata only —
 *  the bytes are never downloaded to plan). */
export interface StorageObjectFacts {
  name: string
  size: number
  md5Hash: string | null
  crc32c: string | null
  contentType: string | null
  /** True when the object carries a Firebase download token: a URL holding it
   *  reads the object with no auth at all, whatever the rules say. */
  hasDownloadToken: boolean
}

export type RefForm = "path" | "url"

/** One string in one Firestore document that points at a Storage object. */
export interface StorageRef {
  docPath: string
  /** The home whose document tree holds the reference; null outside homes/. */
  homeId: string | null
  fieldPath: FieldPath
  /** The stored value, exactly. NEVER printed — URLs can carry tokens. */
  value: string
  objectPath: string
  form: RefForm
  /** URL form only: the URL carries `token=` (a bearer capability). */
  hasToken: boolean
  /** e.g. "items.photoPath", "manuals/chunks.metadata.diagram_image_urls[].url". */
  category: string
}

/** A dead v1 Supabase Storage URL (that backend is paused): reported, never rewritten. */
export interface V1UrlRef {
  docPath: string
  homeId: string | null
  fieldPath: FieldPath
  category: string
  /** The object path inside the v1 bucket. 30-storage.ts copied the v1 bucket
   *  preserving paths, so the same name may exist in this bucket. */
  objectPath: string
}

/** A Firebase/GCS URL naming a DIFFERENT bucket than the one being migrated —
 *  reported, never rewritten. A wrong --bucket would make every URL land here,
 *  so a large count is the census saying "check the bucket name". */
export interface ForeignBucketUrlRef {
  docPath: string
  homeId: string | null
  fieldPath: FieldPath
  category: string
  bucket: string
}

/** A declared path field (item photo / receipt, uploaded manual's source)
 *  holding something this migration cannot resolve: gs://, an outside URL,
 *  junk. Reported so the census shows what the cutover would leave alone. */
export interface UnrecognisedRef {
  docPath: string
  homeId: string | null
  fieldPath: FieldPath
  category: string
  kind: "gs-url" | "other-url" | "other"
}

export type Classified =
  | { form: "path"; objectPath: string }
  | { form: "url"; objectPath: string; hasToken: boolean }
  | { form: "v1-url"; objectPath: string }
  | { form: "foreign-bucket"; bucket: string }
  | null

export const LEGACY_DEST_SEGMENT = "legacy"

/**
 * Homes that belong to someone other than the operator, denied by default.
 * "My House" is Sonia's test home (a friend of the owner): its files are hers,
 * and nothing may move them without her agreement. Lifting the deny takes BOTH
 * `--include-home <id>` and `--sonia-agreed` (storageLegacyMigrationCli.ts).
 */
export const PROTECTED_HOMES: ReadonlyMap<string, string> = new Map([
  ["a3ba0e21-4bd2-481b-99b8-088d5a90c668", "My House (Sonia's home — needs her agreement)"],
])

export function isTenantPath(objectPath: string): boolean {
  return objectPath.startsWith("homes/")
}

/** The homeId a tenant path is keyed under, or null for a legacy path. */
export function tenantHomeOf(objectPath: string): string | null {
  if (!isTenantPath(objectPath)) return null
  return objectPath.split("/")[1] || null
}

/** Where a legacy object that belongs to `homeId` is copied. */
export function legacyDestination(homeId: string, objectPath: string): string {
  if (!homeId || homeId.includes("/")) throw new Error(`invalid homeId ${JSON.stringify(homeId)}`)
  if (isTenantPath(objectPath)) throw new Error(`not a legacy path: ${objectPath}`)
  return `homes/${homeId}/${LEGACY_DEST_SEGMENT}/${objectPath}`
}

/** The original path a migrated copy came from, or null if `objectPath` is not one. */
export function originalOfMigrated(objectPath: string): { homeId: string; original: string } | null {
  const m = objectPath.match(/^homes\/([^/]+)\/legacy\/(.+)$/)
  return m ? { homeId: m[1], original: m[2] } : null
}

/** homes/{homeId}/… → homeId; anything else → null. */
export function homeIdOfDoc(docPath: string): string | null {
  const segs = docPath.split("/")
  return segs[0] === "homes" && segs.length >= 2 ? segs[1] : null
}

/** "items.photoPath", "manuals/chunks.metadata.diagram_image_urls[].url",
 *  "users(no home).avatarUrl" — the reporting bucket for a reference. */
export function categoryFor(docPath: string, fieldPath: FieldPath): string {
  const segs = docPath.split("/")
  let collections: string
  if (segs[0] === "homes") {
    const names = segs.filter((_, i) => i >= 2 && i % 2 === 0)
    collections = names.length > 0 ? names.join("/") : "home"
  } else {
    collections = `${segs.filter((_, i) => i % 2 === 0).join("/")}(no home)`
  }
  let field = ""
  for (const p of fieldPath) field += typeof p === "number" ? "[]" : field ? `.${p}` : p
  return `${collections}.${field}`
}

/**
 * Fields whose value IS a Storage path by contract, even when no object exists
 * at that name (so a dangling one is reported as MISSING rather than ignored):
 * an item's photo and receipt, and an uploaded manual's source. Every other
 * string only counts when it names an object that exists, or is a Storage URL.
 */
export function isDeclaredPathField(docPath: string, fieldPath: FieldPath, doc: Record<string, unknown>): boolean {
  if (fieldPath.length !== 1) return false
  const segs = docPath.split("/")
  if (segs[0] !== "homes" || segs.length !== 4) return false
  const [field] = fieldPath
  if (segs[2] === "items") return field === "photoPath" || field === "receiptPath"
  if (segs[2] === "manuals") return field === "sourceRef" && doc.sourceType === "upload"
  return false
}

const V0_PATH = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/
const EMULATOR_HOSTS = new Set(["127.0.0.1", "localhost"])
const V1_PATH = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/

/**
 * Is `value` a reference to an object in `bucket`?
 *   - a Firebase download URL (prod host, or the local emulator) for THIS bucket
 *   - a storage.googleapis.com URL for this bucket
 *   - a dead v1 Supabase Storage URL (reported only)
 *   - a bare object path — when `declaredPath` says the field holds one, or the
 *     name matches an object that exists (`knownObjects`)
 */
export function classifyRefString(
  value: string,
  opts: { bucket: string; knownObjects: ReadonlySet<string>; declaredPath: boolean },
): Classified {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) {
    let u: URL
    try {
      u = new URL(value)
    } catch {
      return null
    }
    const v0 = u.pathname.match(V0_PATH)
    const firebaseHost =
      (u.protocol === "https:" && u.hostname === "firebasestorage.googleapis.com") ||
      (u.protocol === "http:" && EMULATOR_HOSTS.has(u.hostname))
    if (v0 && firebaseHost) {
      const b = decodeURIComponent(v0[1])
      if (b !== opts.bucket) return { form: "foreign-bucket", bucket: b }
      return { form: "url", objectPath: decodeURIComponent(v0[2]), hasToken: u.searchParams.has("token") }
    }
    if (u.protocol === "https:" && u.hostname === "storage.googleapis.com") {
      const [, b, ...rest] = u.pathname.split("/")
      if (rest.length === 0 || !rest.join("")) return null
      if (b !== opts.bucket) return { form: "foreign-bucket", bucket: b }
      return { form: "url", objectPath: rest.map(decodeURIComponent).join("/"), hasToken: false }
    }
    if (u.hostname.endsWith(".supabase.co")) {
      const m = u.pathname.match(V1_PATH)
      if (m) return { form: "v1-url", objectPath: m[2].split("/").map(decodeURIComponent).join("/") }
    }
    return null
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null // gs:, blob:, data:… — not a reference this migration rewrites
  if (opts.declaredPath || opts.knownObjects.has(value)) return { form: "path", objectPath: value }
  return null
}

/** Rewrite one stored reference to point at `newObjectPath`, keeping its FORM:
 *  a path stays a path; a URL keeps its host, bucket and query (a download
 *  token included — the copy carries the same token, see the runner). */
export function rewriteRef(value: string, form: RefForm, newObjectPath: string): string {
  if (form === "path") return newObjectPath
  const u = new URL(value)
  const v0 = u.pathname.match(V0_PATH)
  if (v0) {
    u.pathname = `/v0/b/${v0[1]}/o/${encodeURIComponent(newObjectPath)}`
    return u.toString()
  }
  if (u.hostname === "storage.googleapis.com") {
    const bucket = u.pathname.split("/")[1]
    u.pathname = `/${bucket}/${newObjectPath.split("/").map(encodeURIComponent).join("/")}`
    return u.toString()
  }
  throw new Error("rewriteRef: not a Storage URL this migration understands")
}

/** Replace a URL's token (and any other signature-like parameter) for display. */
export function redact(value: string): string {
  return value.replace(/([?&](?:token|X-Goog-Signature|X-Goog-Credential|signature)=)[^&#]*/gi, "$1REDACTED")
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** Every string in a document, with where it sits. Only plain objects and
 *  arrays are entered — Timestamps, references and other class instances are
 *  values, not containers (a DocumentReference would walk into its Firestore). */
export function* walkStrings(value: unknown, path: FieldPath = []): Generator<{ fieldPath: FieldPath; value: string }> {
  if (typeof value === "string") {
    yield { fieldPath: path, value }
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* walkStrings(value[i], [...path, i])
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value).sort()) yield* walkStrings(value[key], [...path, key])
  }
}

export function getAt(root: unknown, fieldPath: FieldPath): unknown {
  let cur: unknown = root
  for (const p of fieldPath) {
    if (typeof p === "number") {
      if (!Array.isArray(cur)) return undefined
      cur = cur[p]
    } else {
      if (!isPlainObject(cur)) return undefined
      cur = cur[p]
    }
  }
  return cur
}

/** A copy of `root` with `value` at `fieldPath`. Copies only the containers on
 *  the path; everything else (Timestamps included) is shared as-is. */
export function setAt<T>(root: T, fieldPath: FieldPath, value: unknown): T {
  if (fieldPath.length === 0) return value as T
  const [head, ...rest] = fieldPath
  if (typeof head === "number") {
    if (!Array.isArray(root)) throw new Error(`setAt: expected an array at index ${head}`)
    const copy = [...root]
    copy[head] = setAt(copy[head], rest, value)
    return copy as T
  }
  if (!isPlainObject(root)) throw new Error(`setAt: expected a map at key ${JSON.stringify(head)}`)
  return { ...root, [head]: setAt(root[head], rest, value) } as T
}

export function fieldPathKey(fieldPath: FieldPath): string {
  return JSON.stringify(fieldPath)
}

export interface FoundRefs {
  refs: StorageRef[]
  v1Urls: V1UrlRef[]
  foreignBucketUrls: ForeignBucketUrlRef[]
  unrecognised: UnrecognisedRef[]
}

function unrecognisedKind(value: string): UnrecognisedRef["kind"] {
  if (/^gs:\/\//i.test(value)) return "gs-url"
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "other-url"
  return "other"
}

/** Find every Storage reference in one document. */
export function findRefs(
  docPath: string,
  data: Record<string, unknown>,
  opts: { bucket: string; knownObjects: ReadonlySet<string> },
): FoundRefs {
  const out: FoundRefs = { refs: [], v1Urls: [], foreignBucketUrls: [], unrecognised: [] }
  const homeId = homeIdOfDoc(docPath)
  for (const { fieldPath, value } of walkStrings(data)) {
    const declaredPath = isDeclaredPathField(docPath, fieldPath, data)
    const c = classifyRefString(value, { ...opts, declaredPath })
    const category = categoryFor(docPath, fieldPath)
    if (!c) {
      if (declaredPath && value.trim()) out.unrecognised.push({ docPath, homeId, fieldPath, category, kind: unrecognisedKind(value) })
      continue
    }
    if (c.form === "v1-url") {
      out.v1Urls.push({ docPath, homeId, fieldPath, category, objectPath: c.objectPath })
      continue
    }
    if (c.form === "foreign-bucket") {
      out.foreignBucketUrls.push({ docPath, homeId, fieldPath, category, bucket: c.bucket })
      continue
    }
    out.refs.push({
      docPath,
      homeId,
      fieldPath,
      value,
      objectPath: c.objectPath,
      form: c.form,
      hasToken: c.form === "url" && c.hasToken,
      category,
    })
  }
  return out
}

// ── the plan ─────────────────────────────────────────────────────────────────

export interface CopyStep {
  src: string
  dst: string
  homeId: string
  size: number
  md5Hash: string | null
  crc32c: string | null
  /** The destination already holds identical bytes (an earlier run copied it). */
  alreadyCopied: boolean
}

export interface RefUpdate {
  docPath: string
  fieldPath: FieldPath
  prev: string
  next: string
  src: string
  dst: string
  category: string
}

export type AmbiguityReason = "multiple-homes" | "referenced-outside-a-home"

export interface MigrationPlan {
  copies: CopyStep[]
  refUpdates: RefUpdate[]
  /** Legacy objects whose household cannot be decided — reported, skipped. */
  ambiguous: Array<{ objectPath: string; size: number; reason: AmbiguityReason; homes: string[]; refs: StorageRef[] }>
  /** References to a legacy name with no object behind it — reported, skipped. */
  missing: StorageRef[]
  /** The destination exists with DIFFERENT bytes — reported, skipped, never overwritten. */
  conflicts: Array<{ src: string; dst: string; refs: StorageRef[] }>
  /** Legacy objects nothing references (and no migrated copy exists for). */
  unreferenced: StorageObjectFacts[]
  /** Legacy originals whose copy exists under homes/{homeId}/legacy/ — awaiting the owner's cleanup decision. */
  migratedOriginals: StorageObjectFacts[]
  /** Resolved, but the home is outside --home: left for a later run. */
  outOfScope: Array<{ objectPath: string; homeId: string; refs: number }>
  /** Resolved to a PROTECTED home (another person's — see PROTECTED_HOMES) whose
   *  owner has not agreed: never scheduled, whatever --home says. */
  protectedSkipped: Array<{ objectPath: string; homeId: string; refs: number }>
  /** A tenant path referenced from a DIFFERENT home's document — already broken for that home's members. */
  crossHomeTenantRefs: StorageRef[]
  /** A tenant path with no object behind it — a pre-existing broken reference, not this migration's. */
  missingTenantRefs: StorageRef[]
  v1Urls: V1UrlRef[]
  foreignBucketUrls: ForeignBucketUrlRef[]
  unrecognised: UnrecognisedRef[]
  /** Every Storage reference found, for the per-field census. */
  allRefs: StorageRef[]
  objects: StorageObjectFacts[]
}

export function planMigration(input: {
  objects: StorageObjectFacts[]
  refs: StorageRef[]
  v1Urls?: V1UrlRef[]
  foreignBucketUrls?: ForeignBucketUrlRef[]
  unrecognised?: UnrecognisedRef[]
  /** Only these homes' objects are scheduled (others → outOfScope). Ambiguity is
   *  still judged across ALL homes. */
  homeFilter?: ReadonlySet<string> | null
  /** Homes never scheduled, even when named in homeFilter (→ protectedSkipped). */
  protectedHomes?: ReadonlySet<string>
}): MigrationPlan {
  const byName = new Map(input.objects.map((o) => [o.name, o]))
  const plan: MigrationPlan = {
    copies: [],
    refUpdates: [],
    ambiguous: [],
    missing: [],
    conflicts: [],
    unreferenced: [],
    migratedOriginals: [],
    outOfScope: [],
    protectedSkipped: [],
    crossHomeTenantRefs: [],
    missingTenantRefs: [],
    v1Urls: input.v1Urls ?? [],
    foreignBucketUrls: input.foreignBucketUrls ?? [],
    unrecognised: input.unrecognised ?? [],
    allRefs: input.refs,
    objects: input.objects,
  }

  const legacyRefs = new Map<string, StorageRef[]>()
  for (const r of input.refs) {
    if (isTenantPath(r.objectPath)) {
      if (r.homeId !== tenantHomeOf(r.objectPath)) plan.crossHomeTenantRefs.push(r)
      if (!byName.has(r.objectPath)) plan.missingTenantRefs.push(r)
      continue
    }
    const list = legacyRefs.get(r.objectPath) ?? []
    list.push(r)
    legacyRefs.set(r.objectPath, list)
  }

  for (const objectPath of [...legacyRefs.keys()].sort()) {
    const refs = legacyRefs.get(objectPath)!
    const obj = byName.get(objectPath)
    if (!obj) {
      plan.missing.push(...refs)
      continue
    }
    const homes = [...new Set(refs.map((r) => r.homeId).filter((h): h is string => h !== null))].sort()
    if (refs.some((r) => r.homeId === null)) {
      plan.ambiguous.push({ objectPath, size: obj.size, reason: "referenced-outside-a-home", homes, refs })
      continue
    }
    if (homes.length !== 1) {
      plan.ambiguous.push({ objectPath, size: obj.size, reason: "multiple-homes", homes, refs })
      continue
    }
    const homeId = homes[0]
    if (input.protectedHomes?.has(homeId)) {
      plan.protectedSkipped.push({ objectPath, homeId, refs: refs.length })
      continue
    }
    if (input.homeFilter && !input.homeFilter.has(homeId)) {
      plan.outOfScope.push({ objectPath, homeId, refs: refs.length })
      continue
    }
    const dst = legacyDestination(homeId, objectPath)
    const existing = byName.get(dst)
    let alreadyCopied = false
    if (existing) {
      if (!sameBytes(obj, existing)) {
        plan.conflicts.push({ src: objectPath, dst, refs })
        continue
      }
      alreadyCopied = true
    }
    plan.copies.push({ src: objectPath, dst, homeId, size: obj.size, md5Hash: obj.md5Hash, crc32c: obj.crc32c, alreadyCopied })
    for (const r of refs) {
      plan.refUpdates.push({
        docPath: r.docPath,
        fieldPath: r.fieldPath,
        prev: r.value,
        next: rewriteRef(r.value, r.form, dst),
        src: objectPath,
        dst,
        category: r.category,
      })
    }
  }

  const migratedFrom = new Set<string>()
  for (const o of input.objects) {
    const m = originalOfMigrated(o.name)
    if (m) migratedFrom.add(m.original)
  }
  for (const o of input.objects) {
    if (isTenantPath(o.name) || legacyRefs.has(o.name)) continue
    if (migratedFrom.has(o.name)) plan.migratedOriginals.push(o)
    else plan.unreferenced.push(o)
  }
  return plan
}

/** Same bytes, judged on size plus every hash both sides carry. With no hash
 *  on either side it is NOT judged the same — a size match alone proves nothing. */
export function sameBytes(
  a: Pick<StorageObjectFacts, "size" | "md5Hash" | "crc32c">,
  b: Pick<StorageObjectFacts, "size" | "md5Hash" | "crc32c">,
): boolean {
  if (a.size !== b.size) return false
  let compared = 0
  if (a.md5Hash && b.md5Hash) {
    if (a.md5Hash !== b.md5Hash) return false
    compared++
  }
  if (a.crc32c && b.crc32c) {
    if (a.crc32c !== b.crc32c) return false
    compared++
  }
  return compared > 0
}

// ── the census (counts and bytes only — never a value) ──────────────────────

export interface Tally {
  count: number
  bytes: number
}

const add = (t: Record<string, Tally>, key: string, bytes: number) => {
  const cur = (t[key] ??= { count: 0, bytes: 0 })
  cur.count++
  cur.bytes += bytes
}

/** "photos/", "receipts/", "images/", "{a}/{b}/{file} (v1 manual shape)", … */
export function objectFamily(objectPath: string): string {
  if (isTenantPath(objectPath)) {
    const m = originalOfMigrated(objectPath)
    if (m) return "homes/*/legacy/ (migrated copies)"
    return `homes/*/${objectPath.split("/")[2] ?? ""}/`
  }
  const segs = objectPath.split("/")
  if (["photos", "receipts", "images"].includes(segs[0])) return `${segs[0]}/`
  if (segs.length === 3) return "{uid}/{itemId}/{file} (v1 manual shape)"
  if (segs.length === 2) return "{itemId}/{file} (v1 manual, no uid)"
  return "other shape"
}

export interface MigrationSummary {
  objects: { tenant: Tally; legacy: Tally; legacyByFamily: Record<string, Tally>; legacyWithDownloadToken: Tally }
  refs: {
    byCategory: Record<string, { total: number; legacy: number; tenant: number; tokenUrls: number }>
    legacyTotal: number
    tokenUrlsTotal: number
    v1UrlsByCategory: Record<string, number>
  }
  plan: {
    toCopy: Tally
    alreadyCopied: Tally
    refUpdates: number
    refUpdatesByCategory: Record<string, number>
    byHome: Record<string, { objects: number; bytes: number; refUpdates: number }>
  }
  ambiguous: { multipleHomes: Tally; referencedOutsideAHome: Tally }
  missing: { refs: number; byCategory: Record<string, number> }
  conflicts: number
  outOfScope: { objects: number; byHome: Record<string, number> }
  protectedSkipped: { objects: number; byHome: Record<string, number> }
  foreignBucketUrls: { total: number; byBucket: Record<string, number>; byCategory: Record<string, number> }
  unrecognised: { total: number; byCategory: Record<string, Record<string, number>> }
  unreferencedLegacy: Tally & { byFamily: Record<string, Tally> }
  migratedOriginals: Tally
  crossHomeTenantRefs: number
  missingTenantRefs: number
}

export function summarize(plan: MigrationPlan): MigrationSummary {
  const s: MigrationSummary = {
    objects: { tenant: { count: 0, bytes: 0 }, legacy: { count: 0, bytes: 0 }, legacyByFamily: {}, legacyWithDownloadToken: { count: 0, bytes: 0 } },
    refs: { byCategory: {}, legacyTotal: 0, tokenUrlsTotal: 0, v1UrlsByCategory: {} },
    plan: { toCopy: { count: 0, bytes: 0 }, alreadyCopied: { count: 0, bytes: 0 }, refUpdates: plan.refUpdates.length, refUpdatesByCategory: {}, byHome: {} },
    ambiguous: { multipleHomes: { count: 0, bytes: 0 }, referencedOutsideAHome: { count: 0, bytes: 0 } },
    missing: { refs: plan.missing.length, byCategory: {} },
    conflicts: plan.conflicts.length,
    outOfScope: { objects: plan.outOfScope.length, byHome: {} },
    protectedSkipped: { objects: plan.protectedSkipped.length, byHome: {} },
    foreignBucketUrls: { total: plan.foreignBucketUrls.length, byBucket: {}, byCategory: {} },
    unrecognised: { total: plan.unrecognised.length, byCategory: {} },
    unreferencedLegacy: { count: 0, bytes: 0, byFamily: {} },
    migratedOriginals: { count: 0, bytes: 0 },
    crossHomeTenantRefs: plan.crossHomeTenantRefs.length,
    missingTenantRefs: plan.missingTenantRefs.length,
  }
  for (const o of plan.objects) {
    if (isTenantPath(o.name)) {
      s.objects.tenant.count++
      s.objects.tenant.bytes += o.size
      continue
    }
    s.objects.legacy.count++
    s.objects.legacy.bytes += o.size
    add(s.objects.legacyByFamily, objectFamily(o.name), o.size)
    if (o.hasDownloadToken) {
      s.objects.legacyWithDownloadToken.count++
      s.objects.legacyWithDownloadToken.bytes += o.size
    }
  }
  for (const r of plan.allRefs) {
    const c = (s.refs.byCategory[r.category] ??= { total: 0, legacy: 0, tenant: 0, tokenUrls: 0 })
    c.total++
    if (isTenantPath(r.objectPath)) c.tenant++
    else {
      c.legacy++
      s.refs.legacyTotal++
    }
    if (r.hasToken) {
      c.tokenUrls++
      s.refs.tokenUrlsTotal++
    }
  }
  for (const v of plan.v1Urls) s.refs.v1UrlsByCategory[v.category] = (s.refs.v1UrlsByCategory[v.category] ?? 0) + 1
  for (const c of plan.copies) {
    const t = c.alreadyCopied ? s.plan.alreadyCopied : s.plan.toCopy
    t.count++
    t.bytes += c.size
    const h = (s.plan.byHome[c.homeId] ??= { objects: 0, bytes: 0, refUpdates: 0 })
    h.objects++
    h.bytes += c.size
  }
  for (const u of plan.refUpdates) {
    s.plan.refUpdatesByCategory[u.category] = (s.plan.refUpdatesByCategory[u.category] ?? 0) + 1
    const h = s.plan.byHome[u.dst.split("/")[1]]
    if (h) h.refUpdates++
  }
  for (const a of plan.ambiguous) {
    const t = a.reason === "multiple-homes" ? s.ambiguous.multipleHomes : s.ambiguous.referencedOutsideAHome
    t.count++
    t.bytes += a.size
  }
  for (const m of plan.missing) s.missing.byCategory[m.category] = (s.missing.byCategory[m.category] ?? 0) + 1
  for (const o of plan.outOfScope) s.outOfScope.byHome[o.homeId] = (s.outOfScope.byHome[o.homeId] ?? 0) + 1
  for (const o of plan.protectedSkipped) s.protectedSkipped.byHome[o.homeId] = (s.protectedSkipped.byHome[o.homeId] ?? 0) + 1
  for (const f of plan.foreignBucketUrls) {
    s.foreignBucketUrls.byBucket[f.bucket] = (s.foreignBucketUrls.byBucket[f.bucket] ?? 0) + 1
    s.foreignBucketUrls.byCategory[f.category] = (s.foreignBucketUrls.byCategory[f.category] ?? 0) + 1
  }
  for (const u of plan.unrecognised) {
    const c = (s.unrecognised.byCategory[u.category] ??= {})
    c[u.kind] = (c[u.kind] ?? 0) + 1
  }
  for (const o of plan.unreferenced) {
    s.unreferencedLegacy.count++
    s.unreferencedLegacy.bytes += o.size
    add(s.unreferencedLegacy.byFamily, objectFamily(o.name), o.size)
  }
  for (const o of plan.migratedOriginals) {
    s.migratedOriginals.count++
    s.migratedOriginals.bytes += o.size
  }
  return s
}

// ── the manifest (JSON Lines, append-only, written BEFORE each mutation) ─────

export type ManifestEntry =
  | { t: "header"; version: 1; project: string; bucket: string; startedAt: string; homes: string[] | null }
  | { t: "copy-intent"; src: string; dst: string; homeId: string; size: number; md5Hash: string | null; crc32c: string | null; at: string }
  | { t: "copy-done"; src: string; dst: string; at: string }
  | { t: "copy-failed"; src: string; dst: string; reason: string; at: string }
  | { t: "ref-intent"; docPath: string; updates: Array<Pick<RefUpdate, "fieldPath" | "prev" | "next" | "src" | "dst">>; at: string }
  | { t: "ref-done"; docPath: string; applied: number; already: number; conflicts: FieldPath[]; at: string }
  | { t: "rollback-done"; docPath: string; restored: number; already: number; conflicts: FieldPath[]; at: string }

/** The --home scope a manifest is bound to: sorted ids, or null for "all
 *  homes" (emulator only — production --apply requires --home). */
export function manifestHomes(homes: readonly string[]): string[] | null {
  return homes.length > 0 ? [...new Set(homes)].sort() : null
}

/** Refuse a manifest whose header does not match this run — a different
 *  project, bucket or --home scope means a different migration. */
export function checkManifestHeader(
  header: Extract<ManifestEntry, { t: "header" }> | null,
  run: { project: string; bucket: string; homes: string[] | null },
  path: string,
): void {
  if (!header) return
  if (header.version !== 1 || typeof header.project !== "string" || typeof header.bucket !== "string") {
    throw new Error(`${path}: header is not a version-1 migration manifest header`)
  }
  if (header.project !== run.project || header.bucket !== run.bucket) {
    throw new Error(`${path} belongs to ${header.project}/${header.bucket}, not ${run.project}/${run.bucket}`)
  }
  const recorded = Array.isArray(header.homes) ? header.homes : null
  if (JSON.stringify(recorded) !== JSON.stringify(run.homes)) {
    const show = (h: string[] | null) => (h ? h.join(", ") : "all homes")
    throw new Error(`${path} was started for --home ${show(recorded)}; this run is for ${show(run.homes)}. Use a separate manifest per home scope.`)
  }
}

export function parseManifest(text: string): ManifestEntry[] {
  const out: ManifestEntry[] = []
  const lines = text.split("\n")
  lines.forEach((line, i) => {
    if (!line.trim()) return
    try {
      out.push(JSON.parse(line) as ManifestEntry)
    } catch (e) {
      // A torn LAST line is what a crash mid-append leaves; it was never acted
      // on (each entry is fsynced before its mutation), so it is safe to drop.
      // A torn line anywhere else means the file was edited — refuse.
      if (lines.slice(i + 1).some((l) => l.trim())) {
        throw new Error(`manifest line ${i + 1} is not JSON (${e instanceof Error ? e.message : String(e)})`)
      }
    }
  })
  return out
}

/** A non-empty manifest must start with a header — anything else is not one
 *  of ours (or was truncated at the front), and resuming from it is unsafe. */
export function requireHeader(entries: ManifestEntry[], path: string): void {
  if (entries.length === 0) return
  const h = entries[0]
  if (h.t !== "header" || h.version !== 1 || typeof h.project !== "string" || typeof h.bucket !== "string") {
    throw new Error(`${path} is not empty and does not start with a migration manifest header — refusing to use it`)
  }
}

export interface ManifestState {
  header: Extract<ManifestEntry, { t: "header" }> | null
  copiesDone: Set<string>
  copiesFailed: Map<string, string>
  /** Every reference update ever intended, in order — what --rollback reverses. */
  refIntents: Array<Extract<ManifestEntry, { t: "ref-intent" }>>
  refsDone: Set<string>
}

export function manifestState(entries: ManifestEntry[]): ManifestState {
  const st: ManifestState = { header: null, copiesDone: new Set(), copiesFailed: new Map(), refIntents: [], refsDone: new Set() }
  for (const e of entries) {
    if (e.t === "header") st.header ??= e
    else if (e.t === "copy-done") {
      st.copiesDone.add(e.src)
      st.copiesFailed.delete(e.src)
    } else if (e.t === "copy-failed") st.copiesFailed.set(e.src, e.reason)
    else if (e.t === "ref-intent") st.refIntents.push(e)
    else if (e.t === "ref-done") st.refsDone.add(e.docPath)
  }
  return st
}

/** What to do with one field inside a transaction. */
export type FieldDecision = "write" | "already" | "conflict"

/** Apply direction: current === prev → write next; current === next → nothing
 *  to do (an earlier or interrupted run already wrote it); anything else means
 *  someone changed the field since the plan — leave it alone. Rollback calls
 *  this with prev/next swapped. */
export function decideField(current: unknown, prev: string, next: string): FieldDecision {
  if (current === next) return "already"
  if (current === prev) return "write"
  return "conflict"
}
