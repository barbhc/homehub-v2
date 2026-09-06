/**
 * The care library's three verbs — add, dismiss, backstop.
 *
 * The library itself (shared/care/library.ts) is pure and decides WHAT to
 * offer. This file is the only place a suggestion touches Firestore, and each
 * verb is one honest write:
 *
 *   · add       → a real task template (source "cho_generated", provenance in
 *                 externalKey) with its typical cadence, which mints the first
 *                 occurrence. It is a task now; the bell stays a separate choice.
 *   · dismiss   → the entry's key on the item (or the home, for building-level
 *                 entries), so it is never offered again there.
 *   · backstop  → an existing indicator-driven task gains the typical cadence.
 *
 * Nothing here notifies anyone. See design/care-library.md.
 */
import { arrayUnion, doc, serverTimestamp, updateDoc } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { TaskTemplate, ScheduleType } from "@/integrations/types"
import type { CareEntry } from "../../../../shared/care/library"
import { createTaskTemplate, setTaskCadence } from "./taskService"

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: { message: string } }
const err = (e: unknown, fallback: string): { data: null; error: { message: string } } =>
  ({ data: null, error: { message: e instanceof Error ? e.message : fallback } })

/** Provenance stamp: what a task's externalKey reads when it came from the library. */
export const LIBRARY_KEY_PREFIX = "library:"
export const libraryKeyOf = (t: Pick<TaskTemplate, "external_key">): string | null =>
  t.external_key?.startsWith(LIBRARY_KEY_PREFIX) ? t.external_key.slice(LIBRARY_KEY_PREFIX.length) : null

/**
 * Turn a suggestion into a task on an item (or the home when itemUnitId is
 * null). Two writes, deliberately: the template, then its cadence through the
 * same writer every other cadence change uses — so the first occurrence is
 * minted exactly the way a parsed task's would be.
 */
export async function addLibraryTask(homeId: string, itemUnitId: string | null, entry: CareEntry): Promise<ServiceResult<TaskTemplate>> {
  const created = await createTaskTemplate({
    home_id: homeId,
    scope_type: itemUnitId ? "item_unit" : "home",
    item_unit_id: itemUnitId,
    title: entry.title,
    description: entry.why,
    instructions_override: entry.how,
    care_type: entry.careType,
    priority_tier: entry.priorityTier,
    risk_level: entry.riskLevel,
    estimated_minutes: entry.minutes,
    source: "cho_generated",
  })
  if (created.error || !created.data) return { data: null, error: created.error ?? { message: "Could not add the task" } }
  const id = created.data.task_template_id
  try {
    await updateDoc(doc(db, `homes/${homeId}/taskTemplates/${id}`), {
      externalKey: `${LIBRARY_KEY_PREFIX}${entry.key}`,
      metadata: { library: { key: entry.key, source: entry.source, cadenceLabel: entry.cadenceLabel } },
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    return err(e, "Could not record where the task came from")
  }
  const cad = await setTaskCadence(homeId, id, entry.scheduleType as ScheduleType, entry.intervalDays ?? null)
  if (cad.error) return { data: null, error: cad.error }
  return { data: { ...created.data, external_key: `${LIBRARY_KEY_PREFIX}${entry.key}` }, error: null }
}

/** "Not this one": remember the key where the suggestion lived. */
export async function dismissLibrarySuggestion(homeId: string, itemUnitId: string | null, key: string): Promise<ServiceResult<true>> {
  try {
    const ref = itemUnitId ? doc(db, `homes/${homeId}/items/${itemUnitId}`) : doc(db, `homes/${homeId}`)
    await updateDoc(ref, { dismissedCare: arrayUnion(key), updatedAt: serverTimestamp() })
    return { data: true, error: null }
  } catch (e) {
    return err(e, "Could not dismiss the suggestion")
  }
}

/**
 * An indicator-driven task keeps its indicator; this gives it the library's
 * typical cadence as a backstop, so it can remind. Offered, never forced.
 */
export async function applyLibraryBackstop(homeId: string, taskTemplateId: string, entry: CareEntry): Promise<ServiceResult<true>> {
  const res = await setTaskCadence(homeId, taskTemplateId, entry.scheduleType as ScheduleType, entry.intervalDays ?? null)
  if (res.error) return { data: null, error: res.error }
  return { data: true, error: null }
}

/**
 * "Add something the library missed" — a plain home-level task in her own
 * words, on the cadence she picked. Source "user": nothing about it claims
 * a manual or the library, so no externalKey is written.
 */
export async function addCustomHomeTask(homeId: string, title: string, scheduleType: ScheduleType, intervalDays?: number | null): Promise<ServiceResult<TaskTemplate>> {
  const clean = title.trim()
  if (!clean) return { data: null, error: { message: "Give the task a name first" } }
  const created = await createTaskTemplate({
    home_id: homeId,
    scope_type: "home",
    item_unit_id: null,
    title: clean.slice(0, 120),
    care_type: "maintenance",
    priority_tier: "recommended",
    risk_level: "performance",
    source: "user",
  })
  if (created.error || !created.data) return { data: null, error: created.error ?? { message: "Could not create the task" } }
  const cad = await setTaskCadence(homeId, created.data.task_template_id, scheduleType, scheduleType === "every_n_days" ? intervalDays ?? null : null)
  if (cad.error) return { data: null, error: cad.error }
  return { data: created.data, error: null }
}
