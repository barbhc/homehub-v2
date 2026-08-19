/**
 * Per-household data export.
 *
 * Two jobs, and they pull in the same direction:
 *   · trust — the household's data is theirs, and they can take it out
 *   · support — when someone reports "this looks wrong", the export is the
 *     fastest way to see what they actually have without reaching into their
 *     Firestore by hand
 *
 * Reads run as the SIGNED-IN USER, not the Admin SDK, so firestore.rules is
 * what scopes the export: a caller who is not a member of `homeId` gets
 * permission-denied from Firestore itself rather than a check this file could
 * forget. That is deliberate — the export must never become a second, weaker
 * copy of the membership rule.
 *
 * A subcollection the caller cannot read is reported in `partial` rather than
 * failing the whole export or being silently dropped. Half an export that
 * claims to be whole is the failure mode worth avoiding: someone reconciling a
 * support question would read the gap as "the data isn't there".
 */
import { collection, getDocs, Timestamp, type DocumentData } from "firebase/firestore"
import { db } from "@/integrations/firebase"

/** Every subcollection under homes/{homeId} that holds household data.
 *  `invites` is deliberately excluded: live invite TOKENS are credentials, and
 *  an export is a file that gets emailed around. */
export const EXPORTED_COLLECTIONS = [
  "items",
  "rooms",
  "taskTemplates",
  "taskInstances",
  "manuals",
  "careNotes",
  "houseRules",
  "serviceProviders",
  "shoppingList",
  "chatFaqs",
  "members",
] as const

export type ExportedCollection = (typeof EXPORTED_COLLECTIONS)[number]

export type HomeExport = {
  formatVersion: 1
  homeId: string
  exportedAt: string
  /** Collections that could not be read, with the reason. Empty on a clean run. */
  partial: { collection: string; reason: string }[]
  counts: Record<string, number>
  data: Record<string, Record<string, unknown>[]>
}

/** Firestore Timestamps are not JSON — without this they serialise to
 *  `{"seconds":…,"nanoseconds":…}`, which is unreadable in the one place this
 *  file is meant to be readable. Nested objects and arrays are walked too. */
export function toJsonSafe(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(toJsonSafe)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toJsonSafe(v)
    return out
  }
  return value
}

function rowsOf(docs: { id: string; data: () => DocumentData }[]): Record<string, unknown>[] {
  return docs.map((d) => ({ id: d.id, ...(toJsonSafe(d.data()) as Record<string, unknown>) }))
}

/**
 * Reads every exportable subcollection for `homeId`. Never throws on a single
 * unreadable collection — that lands in `partial`.
 */
export async function buildHomeExport(homeId: string, now: Date = new Date()): Promise<HomeExport> {
  const partial: { collection: string; reason: string }[] = []
  const data: Record<string, Record<string, unknown>[]> = {}
  const counts: Record<string, number> = {}

  const results = await Promise.all(
    EXPORTED_COLLECTIONS.map(async (name) => {
      try {
        const snap = await getDocs(collection(db, `homes/${homeId}/${name}`))
        return { name, rows: rowsOf(snap.docs), reason: null as string | null }
      } catch (e) {
        return { name, rows: null, reason: e instanceof Error ? e.message : "read failed" }
      }
    }),
  )

  for (const r of results) {
    if (r.rows === null) {
      partial.push({ collection: r.name, reason: r.reason ?? "read failed" })
      continue
    }
    data[r.name] = r.rows
    counts[r.name] = r.rows.length
  }

  return {
    formatVersion: 1,
    homeId,
    exportedAt: now.toISOString(),
    partial,
    counts,
    data,
  }
}

/** Hands the export to the browser as a download. Split from the read so the
 *  read is testable without a DOM. */
export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Defer revoke so the click finishes before the URL is freed.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportFilename(homeId: string, now: Date = new Date()): string {
  return `homehub-export-${homeId}-${now.toISOString().slice(0, 10)}.json`
}
