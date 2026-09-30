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
  constructor(
    readonly seconds: number,
    readonly nanoseconds: number,
  ) {}
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
const reads: ReadLog = { queries: 0, gets: 0, docsRead: 0, log: [] }
const writes: Array<{ path: string; data: Data }> = []
let autoId = 0

/** The fixture + counters the tests drive. */
export const fakeDb = {
  store,
  reads,
  writes,
  /** Replace the whole database with `docs` (full document path → data) and zero the counters. */
  load(docs: Record<string, Data>): void {
    store.clear()
    for (const [path, data] of Object.entries(docs)) store.set(path, copyData(data))
    fakeDb.resetCounters()
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
  writes.push({ path: ref.path, data: next })
}

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
    const full = [path, ...segments].join("/")
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
    const rows = runQuery(q)
    reads.queries++
    reads.docsRead += Math.max(1, rows.length)
    reads.log.push(`query ${describeQuery(q)} → ${rows.length}`)
    const docs = rows.map((r) => docSnapshot(r.id, r.path, r.data))
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
      metadata: { fromCache: false, hasPendingWrites: false },
      forEach: (fn: (d: (typeof docs)[number]) => void) => docs.forEach(fn),
    }
  },
  async getDoc(ref: DocRef) {
    reads.gets++
    reads.docsRead += 1
    reads.log.push(`get ${ref.path}`)
    return docSnapshot(ref.id, ref.path, store.get(ref.path))
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
        ops.push(() => void store.delete(ref.path))
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
  runTransaction: () => {
    throw new Error("fakeFirestore: runTransaction is not modelled")
  },
}
