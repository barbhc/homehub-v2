import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where, type DocumentData } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { syncTemplateDenormToInstances } from "./denormSync"
import { cadenceFactsFrom, planFor, writeCadencePlan, type CadenceFacts } from "./cadenceChangeService"
import type { ServiceResult } from "./careNoteService"
import type { PreviewResult, PreviewTask, PreviewChunk, CareType, PriorityTier, RiskLevel, ScheduleType } from "@/modules/knowledge/types/previewTypes"
import { USAGE_TIP_TAG } from "../../../../shared/tasks/taxonomy"
import { isRecurring } from "../../../../shared/tasks/reviewBuckets"
import { localToday } from "../../../../shared/dates/calendar"
import { cadenceChanged, isCadenceSeason, lastDoneClaim } from "../../../../shared/tasks/cadenceChange"
import { cadenceValue, changedFields, pick, storedValues, type ProvenanceValues } from "../../../../shared/tasks/fieldProvenance"
import { memberActor, stamp } from "./fieldProvenance"

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
  /** What the cadence rule needs per task (last completion, date added, open
   *  occurrences), so the review can show "Next due" for a changed cadence
   *  before Save — computed by the same `planFor` the save uses. */
  cadenceFacts: Map<string, CadenceFacts>
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
    const instSnap = await getDocs(
      query(collection(db, `homes/${homeId}/taskInstances`), where("itemUnitId", "==", itemUnitId), where("deletedAt", "==", null)),
    )
    const instancesByTemplate = new Map<string, { id: string; data: DocumentData }[]>()
    for (const d of instSnap.docs) {
      const tid = String(d.get("taskTemplateId"))
      instancesByTemplate.set(tid, [...(instancesByTemplate.get(tid) ?? []), { id: d.id, data: d.data() }])
    }
    const today = localToday()
    const tasks: PreviewTask[] = []
    const templateIds: string[] = []
    const manualById = new Map<string, string>()
    const cadenceFacts = new Map<string, CadenceFacts>()
    for (const d of snap.docs) {
      if (d.get("isActive") === false) continue
      const title = String(d.get("title") ?? "")
      if (!title) continue
      templateIds.push(d.id)
      const manualId = d.get("manualId") as string | null
      if (manualId) manualById.set(d.id, manualId)
      cadenceFacts.set(d.id, cadenceFactsFrom(d.data(), instancesByTemplate.get(d.id) ?? [], today))
      const season = d.get("schedule.season")
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
        season: isCadenceSeason(season) ? season : null,
        instructions_text: (d.get("instructionsOverride") as string | null) ?? null,
        source_page: (d.get("sourcePage") as number | null) ?? null,
        justification: (d.get("justification") as string | null) ?? null,
        symptom_tags: (d.get("symptomTags") as string[] | undefined) ?? [],
        re_check_triggers: [],
      })
    }
    // Existing usage tips aren't re-reviewed here: they live on manual chunks, and
    // reviewing an ITEM's tasks shouldn't silently rewrite its manual's chunks.
    return { data: { preview: { ok: true, tasks, chunks: [] }, templateIds, manualById, cadenceFacts }, error: null }
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
    // Who is saving — read once, before the transaction, for the provenance
    // stamps below (decision C, step 1).
    const actor = memberActor()

    // ONE transaction: the liveness check and every write. A plain read-then-
    // batch left a window in which another device could remove a task between
    // the check and the commit; inside runTransaction each reviewed template is
    // read with tx.get, and if any of them changes before the commit, Firestore
    // re-runs this whole callback against the new state — so the check below
    // always judges the documents the writes land on. (Queries can't be
    // transactional reads in the web SDK, so the open-occurrence lookups below
    // are plain reads, re-run on every attempt. Detecting another member's
    // EDITS to a reviewed task — not just its removal — is decision doc §C.)
    const result = await runTransaction(db, async (tx) => {
      const templates = collection(db, `homes/${homeId}/taskTemplates`)

      // The templates as they are NOW. A task removed since this review opened
      // must not be written back — set(merge) would make it active again and a
      // schedule move would seed an occurrence for it. "Removed" is both shapes
      // the app writes: soft-deleted (deletedAt set) and archived
      // (archiveTaskTemplate, CareBlock's remove: isActive false, deletedAt left
      // null). Titles come from here too: the denormalized copy on a new
      // occurrence is the template's own title.
      const titleById = new Map<string, string>()
      const liveById = new Map<string, DocumentData>()
      const liveSnaps = await Promise.all([...shown].map((id) => tx.get(doc(templates, id))))
      for (const snap of liveSnaps) {
        const removed = !snap.exists() || snap.get("deletedAt") != null || snap.get("isActive") === false
        if (removed) throw new Error(`One of these tasks was removed on another device. ${RELOAD}`)
        titleById.set(snap.id, String(snap.get("title") ?? ""))
        liveById.set(snap.id, snap.data()!)
      }

      const now = serverTimestamp()
      let updated = 0

      // One instance query serves every per-template decision below (open lookup,
      // zombie cleanup, seed-check) instead of a query per task.
      const allInstSnap = await getDocs(
        query(collection(db, `homes/${homeId}/taskInstances`), where("itemUnitId", "==", itemUnitId), where("deletedAt", "==", null)),
      )
      const openByTemplate = new Map<string, { id: string }[]>()
      const instancesByTemplate = new Map<string, { id: string; data: DocumentData }[]>()
      for (const d of allInstSnap.docs) {
        const tid = String(d.get("taskTemplateId"))
        instancesByTemplate.set(tid, [...(instancesByTemplate.get(tid) ?? []), { id: d.id, data: d.data() }])
        const status = d.get("status")
        if (status !== "scheduled" && status !== "snoozed") continue
        const arr = openByTemplate.get(tid) ?? []
        arr.push({ id: d.id })
        openByTemplate.set(tid, arr)
      }
      const todayStr = localToday()
      // Each row's "last done" claim, decided once against the task's current
      // last done, so the template write and the date plan agree.
      const claimById = new Map<string, string>()
      for (const t of tasks) {
        const id = t.template_id!
        const current = cadenceFactsFrom(liveById.get(id)!, instancesByTemplate.get(id) ?? [], todayStr).lastDoneOn
        const claim = lastDoneClaim(t.last_done_on, current, todayStr)
        if (claim) claimById.set(id, claim)
      }

      for (const t of tasks) {
        const id = t.template_id!
        const live = liveById.get(id)!
        // Provenance: the review re-saves EVERY row, so only the fields whose
        // stored value this save actually changes are stamped as hers — an
        // untouched row keeps whatever provenance it had (the parser's, or
        // unknown). The values are what the document holds after this merge
        // (a season is written only when the row has one).
        const after: ProvenanceValues = {
          priorityTier: t.priority_tier,
          careType: t.care_type,
          remindEnabled: t.remind_enabled ?? null,
          schedule: {
            scheduleType: t.schedule_type,
            intervalDays: t.interval_days ?? null,
            season: t.season || cadenceValue(live.schedule as Record<string, unknown> | null).season,
          },
        }
        const sources = stamp("saveItemTaskReview", pick(after, changedFields(storedValues(live), after)), actor)
        tx.set(
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
              ...(t.season ? { season: t.season } : {}),
            },
            isActive: true,
            // "I've been doing this already": kept as a claim on the task, so a
            // LATER cadence change still counts from it. Never a completion —
            // nothing was done today, and history is never written here.
            ...(claimById.get(id) ? { lastDoneClaimedOn: claimById.get(id) } : {}),
            ...sources,
            userModifiedAt: now,
            updatedAt: now,
          },
          { merge: true },
        )
        // The agenda reads the instance's denormalized copy, not the template — skip
        // this and the whole review is invisible on Home (see denormSync).
        await syncTemplateDenormToInstances(tx, homeId, id, {
          careType: t.care_type,
          priorityTier: t.priority_tier,
          scheduleType: t.schedule_type,
        })

        // The schedule, by the one cadence rule every editor uses
        // (shared/tasks/cadenceChange.ts — "from when you last did it"). The
        // review re-saves EVERY row, so only a row whose cadence actually
        // changed (or that the reviewer dated with "I've been doing this
        // already") moves its occurrence; an untouched row keeps its date.
        // Either way a recurring task with nothing open gets an occurrence on
        // the rule's date — it used to be seeded due TODAY, seasonal included
        // — and a task taken off the schedule loses its open one, never its
        // completions (non-negotiable 3).
        const facts = cadenceFactsFrom(live, instancesByTemplate.get(id) ?? [], todayStr)
        const claimed = claimById.get(id) ?? null
        if (claimed) facts.lastDoneOn = claimed
        const stored = live.schedule as { scheduleType?: string; intervalDays?: number | null; season?: string | null } | null
        const changed =
          !!claimed ||
          cadenceChanged(stored ?? {}, { scheduleType: t.schedule_type, intervalDays: t.interval_days, season: t.season })
        const open = openByTemplate.get(id) ?? []
        if (changed || !isRecurring(t.schedule_type) || open.length === 0) {
          const plan = planFor(facts, { scheduleType: t.schedule_type, intervalDays: t.interval_days, season: t.season ?? null }, todayStr)
          if (plan.kind === "needs-season") {
            // The sheet asks for the season before Save; an UNCHANGED seasonal
            // row with no season keeps what it has (no occurrence), as a fresh
            // parse leaves one.
            if (changed) throw new Error(`Pick a season for “${titleById.get(id) ?? t.title}”.`)
          } else {
            await writeCadencePlan(tx, homeId, id, {
              ...live, careType: t.care_type, priorityTier: t.priority_tier, riskLevel: t.risk_level,
            }, t.schedule_type, plan)
          }
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
        tx.set(doc(templates, id), { isActive: false, deletedAt: now, updatedAt: now }, { merge: true })
        deactivated++
        for (const inst of openByTemplate.get(id) ?? []) {
          tx.set(doc(db, `homes/${homeId}/taskInstances/${inst.id}`), { deletedAt: now, updatedAt: now }, { merge: true })
        }
        // A row turned into a tip keeps its advice, written as a usage-tip chunk on
        // the manual it came from — the same shape the parse path and the cleanup
        // sweep write, so it renders in "Using it well" with no new storage.
        const tip = tipById.get(id)
        const manualId = manualById.get(id)
        if (tip && manualId) {
          const title = titleById.get(id) ?? tip.title ?? ""
          tx.set(doc(collection(db, `homes/${homeId}/manuals/${manualId}/chunks`)), {
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

      return { updated, deactivated }
    })
    return { data: result, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Could not save review" } }
  }
}
