import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { syncTemplateDenormToInstances } from "./denormSync"
import type { ServiceResult } from "./careNoteService"
import type { PreviewResult, PreviewTask, PreviewChunk, CareType, PriorityTier, RiskLevel, ScheduleType } from "@/modules/knowledge/types/previewTypes"
import { USAGE_TIP_TAG } from "../../../../shared/tasks/taxonomy"
import { isRecurring } from "../../../../shared/tasks/reviewBuckets"
import { localToday } from "../../../../shared/dates/calendar"

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
 * result straight back to the templates it came from — matched by the template
 * ID each row carries (`PreviewTask.template_id`), never by title.
 *
 * Titles used to be the key (an `idByTitle` map), and every way that broke was a
 * silent write to the wrong task (audit 2026-10-28, Package 2):
 *  - two tasks with the same title collapsed to one map entry, so both rows'
 *    edits landed on one template and the other task never changed — while the
 *    save reported both as updated;
 *  - a row whose title differed from the stored one had no id, was skipped, and
 *    its OWN task was then deactivated as "not kept";
 *  - a row whose title matched a different task wrote its edits onto that task.
 * Title matching (`titleSimilarity`) remains only where no id exists yet: a
 * fresh extraction reconciled against stored tasks in commitDraft.
 *
 * The title is read-only in this flow. The review sheet has no title editor and
 * this save never writes `title` — the title is also the key a later rescan
 * reconciles on, so renaming belongs to the task editor (`updateTaskContent`),
 * which is id-based and syncs the open occurrences.
 */
export interface ExistingTaskReview {
  /** Every task carries `template_id`. */
  preview: PreviewResult
  /** Every template loaded for this item — the only ids a save may write. */
  templateIds: string[]
  /** The manual each task came from, so a task converted to a tip can be written
   *  back as a chunk on that manual — the same storage the parse path and the
   *  cleanup sweep already use. No new collection, no new rules. */
  manualById: Map<string, string>
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
    const templateIds: string[] = []
    const manualById = new Map<string, string>()
    for (const d of snap.docs) {
      if (d.get("isActive") === false) continue
      const title = String(d.get("title") ?? "")
      if (!title) continue
      templateIds.push(d.id)
      const manualId = d.get("manualId") as string | null
      if (manualId) manualById.set(d.id, manualId)
      tasks.push({
        template_id: d.id,
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
    return { data: { preview: { ok: true, tasks, chunks: [] }, templateIds, manualById }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Could not load tasks" } }
  }
}

export interface SaveItemReviewInput {
  homeId: string
  itemUnitId: string
  /** From loadItemTasksForReview. */
  templateIds: string[]
  manualById: Map<string, string>
  /** The templates the reviewer was actually SHOWN. A loaded task the sheet
   *  never drew — freeze-prep rows are suppressed before the review in a
   *  freeze-free home — is not a task the reviewer chose to drop, so it is left
   *  exactly as it is. Before this, such a row was simply absent from the save
   *  and got deactivated without ever being on screen. Required: there is no
   *  safe default ("every loaded id" is that bug). */
  shownTemplateIds: string[]
  /** Kept rows, each carrying its `template_id`. */
  tasks: PreviewTask[]
  /** Rows the reviewer converted to tips, each carrying its `template_id`. A
   *  shown row in neither list was skipped. Both are deactivated, never deleted,
   *  so completion history survives and the choice stays reversible. */
  chunks: PreviewChunk[]
}

const RELOAD = "Close the review and open it again."

export async function saveItemTaskReview(input: SaveItemReviewInput): Promise<ServiceResult<{ updated: number; deactivated: number }>> {
  const { homeId, itemUnitId, templateIds, manualById, shownTemplateIds, tasks, chunks } = input
  try {
    // Identity first, before anything is written: every row names a task this
    // review loaded, at most once. A row that doesn't would otherwise be a
    // silent no-op — or, keyed by title, a write to some other task.
    const loaded = new Set(templateIds)
    const owned = (id: string | undefined, what: string): string => {
      if (!id || !loaded.has(id)) throw new Error(`A reviewed ${what} isn't one of this item's tasks. ${RELOAD}`)
      return id
    }
    const keptIds = new Set<string>()
    for (const t of tasks) {
      const id = owned(t.template_id, "task")
      if (keptIds.has(id)) throw new Error(`The same task appears twice in this review. ${RELOAD}`)
      keptIds.add(id)
    }
    const tipById = new Map<string, PreviewChunk>()
    for (const c of chunks) {
      if (!(c.tags ?? []).includes(USAGE_TIP_TAG) || c.template_id === undefined) continue
      tipById.set(owned(c.template_id, "tip"), c)
    }
    const shown = new Set(shownTemplateIds.map((id) => owned(id, "row")))
    for (const id of keptIds) if (!shown.has(id)) throw new Error(`A saved task wasn't on screen. ${RELOAD}`)

    // The templates as they are NOW. A task another device removed since this
    // review opened must not be written back — set(merge) would mark it active
    // while its deletedAt stays set, and a schedule move would then seed an
    // occurrence for a deleted task. Titles come from here too: the denormalized
    // copy on a new occurrence is the template's own title.
    const liveSnap = await getDocs(
      query(collection(db, `homes/${homeId}/taskTemplates`), where("itemUnitId", "==", itemUnitId), where("deletedAt", "==", null)),
    )
    const titleById = new Map(liveSnap.docs.map((d) => [d.id, String(d.get("title") ?? "")]))
    for (const id of shown) {
      if (!titleById.has(id)) throw new Error(`One of these tasks was removed on another device. ${RELOAD}`)
    }

    const now = serverTimestamp()
    const batch = writeBatch(db)
    const templates = collection(db, `homes/${homeId}/taskTemplates`)
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
    const todayStr = localToday()

    for (const t of tasks) {
      const id = t.template_id!
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
          title: titleById.get(id) ?? t.title,
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

    // A SHOWN row that is no longer a task — skipped, or converted to a tip — is
    // deactivated. Its open occurrences go too, or the agenda keeps showing a row
    // whose template is no longer active. Done occurrences are untouched: they
    // are history (non-negotiable 3). A loaded row the reviewer never saw is not
    // in `shown` and is left alone.
    let deactivated = 0
    for (const id of shown) {
      if (keptIds.has(id)) continue
      batch.set(doc(templates, id), { isActive: false, deletedAt: now, updatedAt: now }, { merge: true })
      deactivated++
      for (const inst of openByTemplate.get(id) ?? []) {
        batch.set(doc(db, `homes/${homeId}/taskInstances/${inst.id}`), { deletedAt: now, updatedAt: now }, { merge: true })
      }
      // A row turned into a tip keeps its advice, written as a usage-tip chunk on
      // the manual it came from — the same shape the parse path and the cleanup
      // sweep write, so it renders in "Using it well" with no new storage.
      const tip = tipById.get(id)
      const manualId = manualById.get(id)
      if (tip && manualId) {
        const title = titleById.get(id) ?? tip.title ?? ""
        batch.set(doc(collection(db, `homes/${homeId}/manuals/${manualId}/chunks`)), {
          manualId,
          chunkType: "how_to",
          contentLevel: "everyday",
          title,
          content: tip.content || title,
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
