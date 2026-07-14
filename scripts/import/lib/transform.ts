/**
 * Shared row transforms. v1 Postgres columns are snake_case; v2 Firestore docs
 * are camelCase (matching scripts/seed-emulator.ts + docs/firestore-model.md §0):
 *   - instants (timestamptz, v1 `*_at` etc.) → Firestore Timestamp
 *   - calendar dates (v1 `date`, e.g. due_date, purchase_date) → "YYYY-MM-DD" string
 *   - jsonb / arrays / scalars → passed through unchanged
 *
 * `mapRow` is column-driven: it camelCases every key, then applies per-table
 * overrides (drop FK/path columns, rename storage refs, force calendar-date
 * columns to stay strings). This absorbs minor v1 schema drift — unknown columns
 * are carried over camelCased rather than dropped.
 */
import { Timestamp } from "firebase-admin/firestore"

export function toCamel(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

/** ISO string / Date → Timestamp; null/undefined → null. */
export function ts(v: unknown): Timestamp | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d)
}

/** timestamptz string → "YYYY-MM-DD"; a bare date passes through. */
export function ymd(v: unknown): string | null {
  if (v == null) return null
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export interface MapOpts {
  /** snake columns to omit entirely (FK path parents, the PK when it becomes the doc id). */
  drop?: string[]
  /** snake columns that are CALENDAR dates → keep as "YYYY-MM-DD" strings. */
  dates?: string[]
  /** snake → camel/renamed target (e.g. photo_storage_ref → photoPath). */
  renames?: Record<string, string>
  /** extra snake columns (not ending in _at) that are INSTANTS → Timestamp. */
  instants?: string[]
}

const INSTANT_RE = /_at$/

/**
 * Map a v1 row to a v2 doc body. Does NOT set the doc id (caller owns that) and
 * does NOT add createdAt/updatedAt if absent (caller can default them).
 */
export function mapRow(row: Record<string, unknown>, opts: MapOpts = {}): Record<string, unknown> {
  const drop = new Set(opts.drop ?? [])
  const dates = new Set(opts.dates ?? [])
  const instants = new Set(opts.instants ?? [])
  const renames = opts.renames ?? {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (drop.has(k)) continue
    const key = renames[k] ?? toCamel(k)
    if (dates.has(k)) out[key] = ymd(v)
    else if (INSTANT_RE.test(k) || instants.has(k)) out[key] = ts(v)
    else out[key] = v
  }
  return out
}

/**
 * Make an arbitrary (jsonb-sourced) value safe for Firestore:
 *   - `undefined` in a map → dropped; in an array → null
 *   - non-finite numbers (NaN / ±Infinity) → null (Firestore rejects them)
 *   - a NESTED ARRAY (an array directly containing another array — e.g. a chunk's
 *     `metadata.table_data` 2-D grid) → the inner array is wrapped as `{ _list }`,
 *     which is Firestore-legal and lossless. Nothing in the app reads table_data.
 * Timestamps/Dates are returned untouched (never recursed into).
 */
export function firestoreSafe(v: unknown): unknown {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (v instanceof Timestamp || v instanceof Date) return v
  if (Array.isArray(v)) {
    return v.map((el) => {
      const s = firestoreSafe(el)
      if (Array.isArray(s)) return { _list: s }
      return s === undefined ? null : s
    })
  }
  if (typeof v === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const s = firestoreSafe(val)
      if (s !== undefined) out[k] = s
    }
    return out
  }
  return v
}

/** Default createdAt/updatedAt/deletedAt if the source row omitted them. */
export function withStamps(doc: Record<string, unknown>, now: Timestamp): Record<string, unknown> {
  if (doc.createdAt == null) doc.createdAt = now
  if (doc.updatedAt == null) doc.updatedAt = now
  if (!("deletedAt" in doc)) doc.deletedAt = null
  return doc
}
