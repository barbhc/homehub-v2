import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { syncTemplateDenormToInstances } from "./denormSync"
import type { ServiceResult } from "./careNoteService"
import type { PreviewResult, PreviewTask, PreviewChunk, CareType, PriorityTier, RiskLevel, ScheduleType } from "@/modules/knowledge/types/previewTypes"
import { USAGE_TIP_TAG } from "../../../../shared/tasks/taxonomy"

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

    for (const t of tasks) {
      const id = idByTitle.get(t.title)
      if (!id) continue // a title the reviewer renamed — leave the original alone
      batch.set(
        doc(templates, id),
        {
          careType: t.care_type,
          priorityTier: t.priority_tier,
          remindEnabled: t.remind_enabled ?? null,
          "schedule.scheduleType": t.schedule_type,
          "schedule.intervalDays": t.interval_days ?? null,
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
      })
      updated++
    }

    // Anything not kept as a task is deactivated. Its open instances go too, or the
    // agenda keeps showing a row whose template is no longer active.
    const tipTitles = new Set(chunks.filter((c) => (c.tags ?? []).includes(USAGE_TIP_TAG)).map((c) => c.title ?? ""))
    let deactivated = 0
    const openSnap = await getDocs(
      query(collection(db, `homes/${homeId}/taskInstances`), where("itemUnitId", "==", itemUnitId), where("deletedAt", "==", null)),
    )
    for (const [title, id] of idByTitle) {
      if (keptTitles.has(title)) continue
      batch.set(doc(templates, id), { isActive: false, deletedAt: now, updatedAt: now }, { merge: true })
      deactivated++
      for (const inst of openSnap.docs) {
        if (String(inst.get("taskTemplateId")) !== id) continue
        const status = inst.get("status")
        if (status !== "scheduled" && status !== "snoozed") continue
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
