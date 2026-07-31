import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { syncTemplateDenormToInstances } from "./denormSync"
import type { ServiceResult } from "./careNoteService"
import type { PreviewResult, PreviewTask, PreviewChunk, CareType, PriorityTier, RiskLevel, ScheduleType } from "@/modules/knowledge/types/previewTypes"
import { USAGE_TIP_TAG } from "../../../../shared/tasks/taxonomy"
import { isRecurring } from "../../../../shared/tasks/reviewBuckets"

/**
 * Re-review an item's EXISTING tasks through the parse-review wizard.
 *
 * The wizard was built for the moment a manual is parsed, but the tasks already
 * in someone's home came from older parses and could never reach it. On the
 * owner's account that's 210 active tasks across 14 items — the exact set the new
 * bucketing was designed to calm — so without this entry point the improvement
 * only ever applies to appliances added from here on.
 *
 * Loads templates into the sheet's PreviewResult shape, then writes the reviewed
 * result straight back to the templates it came from (matched by id, carried in
 * the title field's prefix) rather than creating duplicates.
 */

/** Templates are round-tripped through PreviewTask, which has no id field — so the
 *  id rides in a parallel map keyed by title, rebuilt on save. Titles are unique
 *  per item in practice (the reconciler enforces it), and a collision only means
 *  one of two identical rows gets the edit. */
export interface ExistingTaskReview {
  preview: PreviewResult
  idByTitle: Map<string, string>
  /** The manual each task came from, so a task converted to a tip can be written
   *  back as a chunk on that manual — the same storage the parse path and the
   *  cleanup sweep already use. No new collection, no new rules. */
  manualByTitle: Map<string, string>
}

const asCareType = (v: unknown): CareType => (v === "cleaning" || v === "mixed" ? v : "maintenance")
const asTier = (v: unknown): PriorityTier => (v === "essential" || v === "optional" ? v : "recommended")
const asRisk = (v: unknown): RiskLevel =>
  v === "safety" || v === "prevent_damage" || v === "performance" ? v : "comfort"

export async function loadItemTasksForReview(homeId: string, itemUnitId: string): Promise<ServiceResult<ExistingTaskReview>> {
  try {
    const snap = await getDocs(
      query(collection(db, `homes/${homeId}/taskTemplates`), where("itemUnitId", "==", itemUnitId), where("deletedAt", "==", null)),
    )
    const tasks: PreviewTask[] = []
    const idByTitle = new Map<string, string>()
    const manualByTitle = new Map<string, string>()
    for (const d of snap.docs) {
      if (d.get("isActive") === false) continue
      const title = String(d.get("title") ?? "")
      if (!title) continue
      idByTitle.set(title, d.id)
      const manualId = d.get("manualId") as string | null
      if (manualId) manualByTitle.set(title, manualId)
      tasks.push({
        title,
        description: (d.get("description") as string | null) ?? null,
        care_type: asCareType(d.get("careType")),
        priority_tier: asTier(d.get("priorityTier")),
        // undefined on every task written before reminders were their own switch;
        // normalized to null so the wizard reads it as "never chose" rather than
        // as an explicit "off".
        remind_enabled: (d.get("remindEnabled") as boolean | null | undefined) ?? null,
        risk_level: asRisk(d.get("riskLevel")),
        estimated_minutes: (d.get("estimatedMinutes") as number | null) ?? null,
        schedule_type: (String(d.get("schedule.scheduleType") ?? "monthly")) as ScheduleType,
        interval_days: (d.get("schedule.intervalDays") as number | null) ?? null,
        instructions_text: (d.get("instructionsOverride") as string | null) ?? null,
        source_page: (d.get("sourcePage") as number | null) ?? null,
        justification: (d.get("justification") as string | null) ?? null,
        symptom_tags: (d.get("symptomTags") as string[] | undefined) ?? [],
        re_check_triggers: [],
      })
    }
    // Existing usage tips aren't re-reviewed here: they live on manual chunks, and
    // reviewing an ITEM's tasks shouldn't silently rewrite its manual's chunks.
    return { data: { preview: { ok: true, tasks, chunks: [] }, idByTitle, manualByTitle }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Could not load tasks" } }
  }
}

export interface SaveItemReviewInput {
  homeId: string
  itemUnitId: string
  idByTitle: Map<string, string>
  manualByTitle: Map<string, string>
  tasks: PreviewTask[]
  /** Rows the reviewer converted to tips or skipped — deactivated, never deleted,
   *  so completion history survives and the choice stays reversible. */
  chunks: PreviewChunk[]
}

export async function saveItemTaskReview(input: SaveItemReviewInput): Promise<ServiceResult<{ updated: number; deactivated: number }>> {
  const { homeId, itemUnitId, idByTitle, manualByTitle, tasks, chunks } = input
  try {
    const now = serverTimestamp()
    const batch = writeBatch(db)
    const templates = collection(db, `homes/${homeId}/taskTemplates`)
    const keptTitles = new Set(tasks.map((t) => t.title))
    let updated = 0

    // One instance query serves every per-template decision below (open lookup,
    // zombie cleanup, seed-check) instead of a query per task.
    const allInstSnap = await getDocs(
      query(collection(db, `homes/${homeId}/taskInstances`), where("itemUnitId", "==", itemUnitId), where("deletedAt", "==", null)),
    )
    const openByTemplate = new Map<string, { id: string }[]>()
    for (const d of allInstSnap.docs) {
      const status = d.get("status")
      if (status !== "scheduled" && status !== "snoozed") continue
      const tid = String(d.get("taskTemplateId"))
      const arr = openByTemplate.get(tid) ?? []
      arr.push({ id: d.id })
      openByTemplate.set(tid, arr)
    }
    const todayStr = new Date().toISOString().slice(0, 10)

    for (const t of tasks) {
      const id = idByTitle.get(t.title)
      if (!id) continue // a title the reviewer renamed — leave the original alone
      batch.set(
        doc(templates, id),
        {
          careType: t.care_type,
          priorityTier: t.priority_tier,
          remindEnabled: t.remind_enabled ?? null,
          // NESTED object, not "schedule.scheduleType" string keys: set(merge)
          // treats a dotted key as a literal field NAME (path semantics belong
          // to update()), so the original write created a junk field with a dot
          // in it and left the real schedule untouched — every cadence change
          // saved through this path was silently dropped. A green build and a
          // passing save; only reading the document back caught it. merge:true
          // deep-merges maps, so anchorDate/season/window keys survive.
          schedule: {
            scheduleType: t.schedule_type,
            intervalDays: t.interval_days ?? null,
          },
          isActive: true,
          userModifiedAt: now,
          updatedAt: now,
        },
        { merge: true },
      )
      // The agenda reads the instance's denormalized copy, not the template — skip
      // this and the whole review is invisible on Home (see denormSync).
      await syncTemplateDenormToInstances(batch, homeId, id, {
        careType: t.care_type,
        priorityTier: t.priority_tier,
        scheduleType: t.schedule_type,
      })

      const open = openByTemplate.get(id) ?? []
      if (!isRecurring(t.schedule_type)) {
        // Moved OFF the schedule (→ setup / as-needed): its open instances are now
        // meaningless, and leaving them makes Home keep showing a due date for a
        // task the user just said has none — the same zombie class as the denorm
        // drift bug. Done instances stay; they're history.
        for (const inst of open) {
          batch.set(doc(db, `homes/${homeId}/taskInstances/${inst.id}`), { deletedAt: now, updatedAt: now }, { merge: true })
        }
      } else if (open.length === 0) {
        // Moved ONTO a schedule with nothing open: seed one instance, due today,
        // exactly as commitDraft does for a fresh parse. Never-completed past-due
        // renders as calm "Start anytime", and rollForward re-anchors from there —
        // it only fixes existing instances, it never creates one, so without this
        // "Put on a schedule" would change the template and nothing visible.
        batch.set(doc(collection(db, `homes/${homeId}/taskInstances`)), {
          homeId,
          taskTemplateId: id,
          itemUnitId,
          status: "scheduled",
          dueDate: todayStr,
          snoozedUntil: null,
          priorityScore: t.priority_tier === "essential" ? 3 : t.priority_tier === "optional" ? 1 : 2,
          isSafetyCritical: t.risk_level === "safety",
          completedAt: null,
          completionNotes: null,
          completionPhotos: [],
          assignedTo: null,
          title: t.title,
          priorityTier: t.priority_tier,
          careType: t.care_type,
          scopeType: "item_unit",
          estimatedMinutes: t.estimated_minutes ?? null,
          scheduleType: t.schedule_type,
          itemName: null,
          roomName: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
      }
      updated++
    }

    // Anything not kept as a task is deactivated. Its open instances go too, or the
    // agenda keeps showing a row whose template is no longer active.
    const tipTitles = new Set(chunks.filter((c) => (c.tags ?? []).includes(USAGE_TIP_TAG)).map((c) => c.title ?? ""))
    let deactivated = 0
    for (const [title, id] of idByTitle) {
      if (keptTitles.has(title)) continue
      batch.set(doc(templates, id), { isActive: false, deletedAt: now, updatedAt: now }, { merge: true })
      deactivated++
      for (const inst of openByTemplate.get(id) ?? []) {
        batch.set(doc(db, `homes/${homeId}/taskInstances/${inst.id}`), { deletedAt: now, updatedAt: now }, { merge: true })
      }
      // A row turned into a tip keeps its advice, written as a usage-tip chunk on
      // the manual it came from — the same shape the parse path and the cleanup
      // sweep write, so it renders in "Using it well" with no new storage.
      const manualId = manualByTitle.get(title)
      if (tipTitles.has(title) && manualId) {
        batch.set(doc(collection(db, `homes/${homeId}/manuals/${manualId}/chunks`)), {
          manualId,
          chunkType: "how_to",
          contentLevel: "everyday",
          title,
          content: chunks.find((c) => c.title === title)?.content ?? title,
          tags: [USAGE_TIP_TAG],
          scenarios: null,
          sourcePages: [],
          appliesTo: [],
          sectionCategory: null,
          externalKey: null,
          embeddingRef: null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
      }
    }

    await batch.commit()
    return { data: { updated, deactivated }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Could not save review" } }
  }
}
