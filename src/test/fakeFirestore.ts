/**
 * An in-memory stand-in for the slice of `firebase/firestore` the data layer
 * uses — enough to run REAL service code against a fixture and count what it
 * reads. Install it with:
 *
 *   vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).fakeFirestoreModule)
 *
 * Query semantics follow Firestore wherever the difference could change a
 * result, because a fake that is looser than the server hides exactly the bugs
 * a read-narrowing change can introduce:
 *  · where(f, "==", null) matches only documents where `f` is PRESENT and null;
 *  · range filters (<, <=, >, >=) and orderBy skip documents whose value is
 *    missing or of another type — a Timestamp bound never matches null;
 *  · "in" is equality against each value;
 *  · results are ordered by the orderBy fields, then by document id, which is
 *    the order the SDK hands back (no orderBy → document id).
 *
 * `reads` is the point: every getDocs/getDoc call and the documents it returned
 * (a query that matches nothing still costs one read, as Firestore bills it).
 */

type Data = Record<string, unknown>

export class Timestamp {
  readonly seconds: number
  readonly nanoseconds: number
  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }
  static fromMillis(ms: number): Timestamp {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6)
  }
  static fromDate(d: Date): Timestamp {
    return Timestamp.fromMillis(d.getTime())
  }
  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now())
  }
  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6)
  }
  toDate(): Date {
    return new Date(this.toMillis())
  }
  isEqual(other: Timestamp): boolean {
    return other instanceof Timestamp && other.toMillis() === this.toMillis()
  }
}

const SERVER_TIMESTAMP = Symbol("serverTimestamp")
const DOCUMENT_ID = "__name__"

type Where = { type: "where"; field: string; op: string; value: unknown }
type OrderBy = { type: "orderBy"; field: string; dir: "asc" | "desc" }
type Limit = { type: "limit"; n: number }
type Constraint = Where | OrderBy | Limit
type CollectionRef = { kind: "collection"; path: string; id: string }
type DocRef = { kind: "doc"; path: string; id: string }
type Query = { kind: "query"; path: string; constraints: Constraint[] }

export interface ReadLog {
  /** getDocs() calls. */
  queries: number
  /** getDoc() calls. */
  gets: number
  /** Documents returned, with the one-read minimum for an empty query. */
  docsRead: number
  /** One line per call, in call order — for failure messages. */
  log: string[]
}

const store = new Map<string, Data>()
/** Bumped on every write to a path — what a transaction's reads are checked against at commit. */
const versions = new Map<string, number>()
const reads: ReadLog = { queries: 0, gets: 0, docsRead: 0, log: [] }
const writes: Array<{ path: string; data: Data }> = []
let autoId = 0

/** The fixture + counters the tests drive. */
export const fakeDb = {
  store,
  reads,
  writes,
  /**
   * Answer every query the way the SDK does offline on a cold cache: resolve
   * EMPTY with `fromCache: true` instead of throwing (see src/lib/assertServed.ts).
   */
  offline: false,
  /** When set, every read rejects with it — a network or rules failure. */
  failWith: null as Error | null,
  /**
   * Called after every read has been answered — getDoc, getDocs, and a
   * transaction's get — with what was read ("get <path>" / "query <path>").
   * A test uses it to land ANOTHER device's write in the gap between a
   * service's read and its write. Write with `fakeDb.write` from inside it.
   */
  afterRead: null as ((what: string) => void) | null,
  /** A write from "another device": lands at once, outside any batch or transaction. */
  write(path: string, data: Data, opts?: { merge?: boolean }): void {
    applySet({ kind: "doc", path, id: lastSegment(path) }, data, opts)
  },
  /** How many times runTransaction ran its callback, across the test. */
  transactionAttempts: 0,
  /** Replace the whole database with `docs` (full document path → data) and zero the counters. */
  load(docs: Record<string, Data>): void {
    store.clear()
    for (const [path, data] of Object.entries(docs)) store.set(path, copyData(data))
    fakeDb.resetCounters()
    versions.clear()
    fakeDb.offline = false
    fakeDb.failWith = null
    fakeDb.afterRead = null
    fakeDb.transactionAttempts = 0
    writes.length = 0
    autoId = 0
  },
  resetCounters(): void {
    reads.queries = 0
    reads.gets = 0
    reads.docsRead = 0
    reads.log = []
  },
}

/** Deep copy that keeps Timestamp instances (structuredClone would strip the prototype). */
function copyData(v: unknown): Data {
  const copy = (x: unknown): unknown => {
    if (x instanceof Timestamp) return x
    if (Array.isArray(x)) return x.map(copy)
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, copy(y)]))
    return x
  }
  return copy(v) as Data
}

function lastSegment(path: string): string {
  return path.split("/").pop() ?? ""
}

function getField(data: Data, field: string, id: string): unknown {
  if (field === DOCUMENT_ID) return id
  let cur: unknown = data
  for (const part of field.split(".")) {
    if (cur === null || typeof cur !== "object" || !(part in (cur as Data))) return undefined
    cur = (cur as Data)[part]
  }
  return cur
}

/** Firestore's cross-type order, reduced to the types the app stores. */
function typeRank(v: unknown): number {
  if (v === null) return 0
  if (typeof v === "boolean") return 1
  if (typeof v === "number") return 2
  if (v instanceof Timestamp) return 3
  if (typeof v === "string") return 4
  return 5
}

function compareValues(a: unknown, b: unknown): number {
  const ra = typeRank(a)
  const rb = typeRank(b)
  if (ra !== rb) return ra - rb
  if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() - b.toMillis()
  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b)
  return 0
}

function equalValues(a: unknown, b: unknown): boolean {
  if (a instanceof Timestamp || b instanceof Timestamp) return a instanceof Timestamp && b instanceof Timestamp && a.isEqual(b)
  return a === b
}

function matches(w: Where, data: Data, id: string): boolean {
  const v = getField(data, w.field, id)
  switch (w.op) {
    case "==":
      return v !== undefined && equalValues(v, w.value)
    case "in":
      return v !== undefined && (w.value as unknown[]).some((x) => equalValues(v, x))
    case "array-contains":
      return Array.isArray(v) && v.some((x) => equalValues(x, w.value))
    case "<":
    case "<=":
    case ">":
    case ">=": {
      if (v === undefined || typeRank(v) !== typeRank(w.value)) return false
      const c = compareValues(v, w.value)
      return w.op === "<" ? c < 0 : w.op === "<=" ? c <= 0 : w.op === ">" ? c > 0 : c >= 0
    }
    default:
      throw new Error(`fakeFirestore: where op "${w.op}" is not modelled`)
  }
}

type Snap = { id: string; path: string; data: Data }

function runQuery(q: Query): Snap[] {
  const prefix = `${q.path}/`
  const depth = q.path.split("/").length + 1
  let rows: Snap[] = []
  for (const [path, data] of store) {
    if (!path.startsWith(prefix) || path.split("/").length !== depth) continue
    rows.push({ id: lastSegment(path), path, data })
  }
  const wheres = q.constraints.filter((c): c is Where => c.type === "where")
  const orders = q.constraints.filter((c): c is OrderBy => c.type === "orderBy")
  const lim = q.constraints.find((c): c is Limit => c.type === "limit")
  for (const w of wheres) {
    if (w.op === "in" && (!Array.isArray(w.value) || w.value.length === 0 || w.value.length > 30)) {
      throw new Error(`fakeFirestore: "in" takes 1–30 values, got ${Array.isArray(w.value) ? w.value.length : typeof w.value}`)
    }
  }
  rows = rows.filter((r) => wheres.every((w) => matches(w, r.data, r.id)))
  // An orderBy (explicit, or implied by a range filter) drops documents missing the field.
  const rangeField = wheres.find((w) => ["<", "<=", ">", ">="].includes(w.op))?.field
  const sortFields: OrderBy[] = orders.length > 0 ? orders : rangeField ? [{ type: "orderBy", field: rangeField, dir: "asc" }] : []
  rows = rows.filter((r) => sortFields.every((o) => getField(r.data, o.field, r.id) !== undefined))
  const lastDir = sortFields.length > 0 ? sortFields[sortFields.length - 1].dir : "asc"
  rows.sort((a, b) => {
    for (const o of sortFields) {
      const c = compareValues(getField(a.data, o.field, a.id), getField(b.data, o.field, b.id))
      if (c !== 0) return o.dir === "desc" ? -c : c
    }
    const byId = a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    return lastDir === "desc" ? -byId : byId
  })
  return lim ? rows.slice(0, lim.n) : rows
}

function describeQuery(q: Query): string {
  const parts = q.constraints.map((c) =>
    c.type === "where"
      ? `${c.field} ${c.op} ${JSON.stringify(c.value instanceof Timestamp ? `ts:${c.value.toDate().toISOString()}` : c.value)}`
      : c.type === "orderBy"
        ? `orderBy ${c.field} ${c.dir}`
        : `limit ${c.n}`,
  )
  return `${q.path}${parts.length ? ` [${parts.join(", ")}]` : ""}`
}

function docSnapshot(id: string, path: string, data: Data | undefined) {
  return {
    id,
    ref: { kind: "doc", path, id } as DocRef,
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : copyData(data)),
    get: (field: string) => (data === undefined ? undefined : getField(data, field, id)),
    metadata: { fromCache: false, hasPendingWrites: false },
  }
}

function resolveWrite(data: Data): Data {
  const out: Data = {}
  for (const [k, v] of Object.entries(data)) out[k] = v === SERVER_TIMESTAMP ? Timestamp.now() : v
  return out
}

function applySet(ref: DocRef, data: Data, opts?: { merge?: boolean }): void {
  const next = resolveWrite(data)
  const prev = store.get(ref.path)
  store.set(ref.path, opts?.merge && prev ? { ...prev, ...next } : next)
  versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1)
  writes.push({ path: ref.path, data: next })
}

function applyDelete(ref: DocRef): void {
  store.delete(ref.path)
  versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1)
}

/** How many times the SDK runs a transaction's callback before giving up. */
const MAX_TRANSACTION_ATTEMPTS = 5

export const fakeFirestoreModule = {
  Timestamp,
  getFirestore: () => ({}),
  connectFirestoreEmulator: () => undefined,
  collection: (_db: unknown, path: string, ...segments: string[]): CollectionRef => {
    const full = [path, ...segments].join("/")
    return { kind: "collection", path: full, id: lastSegment(full) }
  },
  collectionGroup: () => {
    throw new Error("fakeFirestore: collectionGroup is not modelled")
  },
  doc: (base: unknown, path?: string, ...segments: string[]): DocRef => {
    if (base && typeof base === "object" && (base as CollectionRef).kind === "collection" && path === undefined) {
      const id = `auto-${String(++autoId).padStart(4, "0")}`
      return { kind: "doc", path: `${(base as CollectionRef).path}/${id}`, id }
    }
    // doc(collectionRef, id): the id is relative to the collection.
    const under = base && typeof base === "object" && (base as CollectionRef).kind === "collection" ? [(base as CollectionRef).path] : []
    const full = [...under, path, ...segments].join("/")
    return { kind: "doc", path: full, id: lastSegment(full) }
  },
  query: (ref: CollectionRef | Query, ...constraints: Constraint[]): Query => ({
    kind: "query",
    path: ref.path,
    constraints: [...((ref as Query).constraints ?? []), ...constraints],
  }),
  where: (field: string, op: string, value: unknown): Where => ({ type: "where", field, op, value }),
  orderBy: (field: string, dir: "asc" | "desc" = "asc"): OrderBy => ({ type: "orderBy", field, dir }),
  limit: (n: number): Limit => ({ type: "limit", n }),
  documentId: () => DOCUMENT_ID,
  serverTimestamp: () => SERVER_TIMESTAMP,
  async getDocs(ref: CollectionRef | Query) {
    const q: Query = ref.kind === "query" ? ref : { kind: "query", path: ref.path, constraints: [] }
    if (fakeDb.failWith) throw fakeDb.failWith
    const rows = fakeDb.offline ? [] : runQuery(q)
    reads.queries++
    reads.docsRead += Math.max(1, rows.length)
    reads.log.push(`query ${describeQuery(q)} → ${rows.length}`)
    const docs = rows.map((r) => docSnapshot(r.id, r.path, r.data))
    fakeDb.afterRead?.(`query ${q.path}`)
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
      metadata: { fromCache: fakeDb.offline, hasPendingWrites: false },
      forEach: (fn: (d: (typeof docs)[number]) => void) => docs.forEach(fn),
    }
  },
  async getDoc(ref: DocRef) {
    if (fakeDb.failWith) throw fakeDb.failWith
    reads.gets++
    reads.docsRead += 1
    reads.log.push(`get ${ref.path}`)
    const snap = docSnapshot(ref.id, ref.path, store.get(ref.path))
    fakeDb.afterRead?.(`get ${ref.path}`)
    return snap
  },
  writeBatch: () => {
    const ops: Array<() => void> = []
    const batch = {
      set(ref: DocRef, data: Data, opts?: { merge?: boolean }) {
        ops.push(() => applySet(ref, data, opts))
        return batch
      },
      update(ref: DocRef, data: Data) {
        ops.push(() => applySet(ref, data, { merge: true }))
        return batch
      },
      delete(ref: DocRef) {
        ops.push(() => applyDelete(ref))
        return batch
      },
      async commit() {
        for (const op of ops) op()
      },
    }
    return batch
  },
  async setDoc(ref: DocRef, data: Data, opts?: { merge?: boolean }) {
    applySet(ref, data, opts)
  },
  async updateDoc(ref: DocRef, data: Data) {
    applySet(ref, data, { merge: true })
  },
  async addDoc(ref: CollectionRef, data: Data) {
    const id = `auto-${String(++autoId).padStart(4, "0")}`
    const docRef: DocRef = { kind: "doc", path: `${ref.path}/${id}`, id }
    applySet(docRef, data)
    return docRef
  },
  /**
   * Optimistic concurrency, as the web SDK does it: the callback's reads are
   * remembered with the version they saw, its writes are held back, and at
   * commit a document that changed since it was read fails the attempt — the
   * callback then runs again from the top against the new state, up to
   * MAX_TRANSACTION_ATTEMPTS. An error THROWN by the callback is not retried:
   * the transaction rejects with it and nothing is written. As in the SDK,
   * every read must come before the first write, and queries are not
   * transactional (a getDocs inside the callback is a plain read).
   */
  async runTransaction<T>(_db: unknown, fn: (tx: unknown) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      fakeDb.transactionAttempts++
      const seen = new Map<string, number>()
      const ops: Array<() => void> = []
      const tx = {
        async get(ref: DocRef) {
          if (ops.length > 0) throw new Error("Firestore transactions require all reads to be executed before all writes.")
          if (fakeDb.failWith) throw fakeDb.failWith
          reads.gets++
          reads.docsRead += 1
          reads.log.push(`tx get ${ref.path}`)
          const version = versions.get(ref.path) ?? 0
          const snap = docSnapshot(ref.id, ref.path, store.get(ref.path))
          if (!seen.has(ref.path)) seen.set(ref.path, version)
          fakeDb.afterRead?.(`get ${ref.path}`)
          return snap
        },
        set(ref: DocRef, data: Data, opts?: { merge?: boolean }) {
          ops.push(() => applySet(ref, data, opts))
          return tx
        },
        update(ref: DocRef, data: Data) {
          ops.push(() => applySet(ref, data, { merge: true }))
          return tx
        },
        delete(ref: DocRef) {
          ops.push(() => applyDelete(ref))
          return tx
        },
      }
      const result = await fn(tx)
      const stale = [...seen].some(([path, version]) => (versions.get(path) ?? 0) !== version)
      if (!stale) {
        for (const op of ops) op()
        return result
      }
      if (attempt >= MAX_TRANSACTION_ATTEMPTS) {
        throw Object.assign(new Error("Transaction failed: a document it read kept changing."), { code: "aborted" })
      }
    }
  },
}
