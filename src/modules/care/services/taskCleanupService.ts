/**
 * Task-cleanup sweep — the Firestore half of the confirm-first backfill.
 * `planTaskCleanup` (shared, pure) decides; this module reads the inputs and
 * executes only what the user approved.
 *
 * Client-side by design: it's a per-home operation the owner triggers, every read
 * and write is already permitted by the rules the app uses elsewhere, and keeping
 * it here means no Functions deploy sits between a fix and the noisy home it
 * fixes. There is no AI call — the plan is deterministic, so a dry run costs
 * nothing and always produces the same list.
 */
import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { syncTemplateDenormToInstances } from "./denormSync"
import {
  planTaskCleanup,
  type CleanupPlan,
  type CleanupProposal,
  type ExistingTask,
} from "../../../../shared/tasks/cleanupPlan"
import { USAGE_TIP_TAG } from "../../../../shared/tasks/taxonomy"

export type { CleanupPlan, CleanupProposal }

/** Stable identity for a proposal — the key the review UI checks/unchecks by. */
export function proposalKey(p: CleanupProposal): string {
  return p.kind === "merge" ? `merge:${p.dropTaskTemplateId}` : `${p.kind}:${p.taskTemplateId}`
}

/**
 * Build the plan for a home. Reads active templates plus the set of templates
 * that have at least one completed instance (the invariant guard: those are never
 * dropped or silently converted).
 */
export async function buildCleanupPlan(homeId: string): Promise<CleanupPlan> {
  const [templatesSnap, doneSnap] = await Promise.all([
    getDocs(query(collection(db, `homes/${homeId}/taskTemplates`), where("deletedAt", "==", null))),
    getDocs(query(collection(db, `homes/${homeId}/taskInstances`), where("status", "==", "done"))),
  ])

  const completed = new Set<string>()
  for (const d of doneSnap.docs) {
    const tpl = d.get("taskTemplateId") as string | undefined
    if (tpl) completed.add(tpl)
  }

  const tasks: ExistingTask[] = templatesSnap.docs
    .filter((d) => d.get("isActive") !== false)
    .map((d) => ({
      taskTemplateId: d.id,
      title: (d.get("title") as string) ?? "",
      description: (d.get("description") as string | null) ?? null,
      justification: (d.get("justification") as string | null) ?? null,
      care_type: (d.get("careType") as string) ?? "maintenance",
      priority_tier: (d.get("priorityTier") as string) ?? "recommended",
      risk_level: (d.get("riskLevel") as string) ?? "comfort",
      schedule_type: (d.get("schedule.scheduleType") as string) ?? "monthly",
      instructions_override: (d.get("instructionsOverride") as string | null) ?? null,
      source_page: (d.get("sourcePage") as number | null) ?? null,
      itemUnitId: (d.get("itemUnitId") as string | null) ?? null,
      scopeType: (d.get("scopeType") as string) ?? "item_unit",
      itemName: null,
      hasCompletions: completed.has(d.id),
      careTypeOverriddenAt: d.get("careTypeOverriddenAt") != null ? "set" : null,
      createdAt: null,
    }))

  // Item display names, for a review list that reads like the app.
  const itemIds = [...new Set(tasks.map((t) => t.itemUnitId).filter((x): x is string => !!x))]
  if (itemIds.length > 0) {
    const itemsSnap = await getDocs(collection(db, `homes/${homeId}/items`))
    const names = new Map(itemsSnap.docs.map((d) => [d.id, (d.get("displayName") as string) ?? ""]))
    for (const t of tasks) t.itemName = t.itemUnitId ? names.get(t.itemUnitId) ?? null : null
  }

  return planTaskCleanup(tasks)
}

export interface ApplyCleanupResult {
  reclassified: number
  retiered: number
  convertedToTips: number
  merged: number
  /** Open instances whose denormalized display fields were re-synced to their
   *  template. Non-zero on a home carrying drift from before the fix. */
  denormRepaired: number
}

/**
 * Apply the approved subset of a plan.
 *
 * - reclassify → careType = "cleaning" (drops it out of the Home agenda)
 * - retier     → priorityTier = "recommended" + essentialCandidate stamped, so
 *                the user can promote it back later
 * - to_tip     → the template is deactivated (isActive false, soft-deleted) and a
 *                usage-tip chunk is written in its place, so the advice survives.
 *                Deactivate rather than hard-delete: reversible, and it keeps any
 *                history intact.
 * - merge      → the duplicate is soft-deleted along with its OPEN instances.
 *                Completion-bearing rows are never proposed for dropping, so this
 *                can't destroy history.
 *
 * `promoteToEssential` carries the per-task Essential promotions the user ticked;
 * those rows keep priorityTier "essential" and get their candidate flag cleared.
 */
export async function applyCleanupPlan(
  homeId: string,
  approved: CleanupProposal[],
  promoteToEssential: Set<string> = new Set(),
): Promise<ApplyCleanupResult> {
  const now = serverTimestamp()
  const result: ApplyCleanupResult = { reclassified: 0, retiered: 0, convertedToTips: 0, merged: 0, denormRepaired: 0 }
  const templates = collection(db, `homes/${homeId}/taskTemplates`)

  // Open instances of merged/converted templates need soft-deleting too, or the
  // agenda keeps showing a row whose template is gone.
  const dropTemplateIds = approved
    .filter((p) => p.kind === "merge" || p.kind === "to_tip")
    .map((p) => (p.kind === "merge" ? p.dropTaskTemplateId : p.taskTemplateId))
  const openByTemplate = new Map<string, string[]>()
  if (dropTemplateIds.length > 0) {
    const instSnap = await getDocs(
      query(collection(db, `homes/${homeId}/taskInstances`), where("deletedAt", "==", null)),
    )
    for (const d of instSnap.docs) {
      const tpl = d.get("taskTemplateId") as string | undefined
      const status = d.get("status") as string | undefined
      if (!tpl || !dropTemplateIds.includes(tpl)) continue
      if (status !== "scheduled" && status !== "snoozed") continue
      const list = openByTemplate.get(tpl)
      if (list) list.push(d.id)
      else openByTemplate.set(tpl, [d.id])
    }
  }

  // Usage tips need a manual to live under; reuse the template's own manual so the
  // tip stays attached to the document it came from.
  const manualByTemplate = new Map<string, string>()
  const tipProposals = approved.filter((p): p is Extract<CleanupProposal, { kind: "to_tip" }> => p.kind === "to_tip")
  if (tipProposals.length > 0) {
    const tplSnap = await getDocs(query(templates, where("deletedAt", "==", null)))
    for (const d of tplSnap.docs) {
      const manualId = d.get("manualId") as string | null
      if (manualId) manualByTemplate.set(d.id, manualId)
    }
  }

  const batch = writeBatch(db)
  const softDeleteOpenInstances = (templateId: string) => {
    for (const instanceId of openByTemplate.get(templateId) ?? []) {
      batch.set(
        doc(db, `homes/${homeId}/taskInstances/${instanceId}`),
        { deletedAt: now, updatedAt: now },
        { merge: true },
      )
    }
  }

  for (const p of approved) {
    switch (p.kind) {
      case "reclassify": {
        batch.set(doc(templates, p.taskTemplateId), { careType: p.to, updatedAt: now }, { merge: true })
        // The agenda reads the instance's denormalized copy, not the template —
        // without this the reclassification is invisible on Home.
        await syncTemplateDenormToInstances(batch, homeId, p.taskTemplateId, { careType: p.to })
        result.reclassified++
        break
      }
      case "retier": {
        const promote = promoteToEssential.has(p.taskTemplateId)
        const nextTier = promote ? "essential" : "recommended"
        batch.set(
          doc(templates, p.taskTemplateId),
          promote
            ? { priorityTier: "essential", essentialCandidate: null, updatedAt: now }
            : { priorityTier: "recommended", essentialCandidate: p.candidate, updatedAt: now },
          { merge: true },
        )
        await syncTemplateDenormToInstances(batch, homeId, p.taskTemplateId, { priorityTier: nextTier })
        result.retiered++
        break
      }
      case "to_tip": {
        const manualId = manualByTemplate.get(p.taskTemplateId)
        if (manualId) {
          batch.set(doc(collection(db, `homes/${homeId}/manuals/${manualId}/chunks`)), {
            manualId,
            chunkType: "how_to",
            contentLevel: "everyday",
            title: p.title,
            content: p.tipContent,
            tags: [USAGE_TIP_TAG],
            scenarios: null,
            sourcePages: p.sourcePage != null ? [p.sourcePage] : [],
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
        batch.set(
          doc(templates, p.taskTemplateId),
          { isActive: false, deletedAt: now, updatedAt: now },
          { merge: true },
        )
        softDeleteOpenInstances(p.taskTemplateId)
        result.convertedToTips++
        break
      }
      case "merge": {
        batch.set(
          doc(templates, p.dropTaskTemplateId),
          { isActive: false, deletedAt: now, updatedAt: now },
          { merge: true },
        )
        softDeleteOpenInstances(p.dropTaskTemplateId)
        result.merged++
        break
      }
    }
  }

  // Heal instances stranded by earlier writes. This bug shipped, so real homes
  // already carry drift that no future write would fix: an open instance whose
  // denormalized careType/priorityTier disagrees with its template is corrected
  // here, in BOTH directions (stale "maintenance" keeps cleaning noise on the
  // agenda; stale "cleaning" wrongly hides real maintenance). Reads the template
  // set fresh so it also covers rows this sweep just changed. Idempotent — a
  // clean home produces zero writes — so re-running the sweep IS the repair path.
  const [allTemplatesSnap, allOpenSnap] = await Promise.all([
    getDocs(query(templates, where("deletedAt", "==", null))),
    getDocs(query(collection(db, `homes/${homeId}/taskInstances`), where("deletedAt", "==", null))),
  ])
  const desired = new Map<string, { careType: unknown; priorityTier: unknown }>()
  for (const d of allTemplatesSnap.docs) {
    desired.set(d.id, { careType: d.get("careType"), priorityTier: d.get("priorityTier") })
  }
  // Fold in this sweep's own edits — the snapshot above predates the uncommitted batch.
  for (const p of approved) {
    if (p.kind === "reclassify") {
      const cur = desired.get(p.taskTemplateId)
      if (cur) cur.careType = p.to
    } else if (p.kind === "retier") {
      const cur = desired.get(p.taskTemplateId)
      if (cur) cur.priorityTier = promoteToEssential.has(p.taskTemplateId) ? "essential" : "recommended"
    }
  }
  for (const d of allOpenSnap.docs) {
    const status = d.get("status")
    if (status !== "scheduled" && status !== "snoozed") continue
    const want = desired.get(String(d.get("taskTemplateId") ?? ""))
    if (!want) continue
    const patch: Record<string, unknown> = {}
    if (want.careType !== undefined && d.get("careType") !== want.careType) patch.careType = want.careType
    if (want.priorityTier !== undefined && d.get("priorityTier") !== want.priorityTier) patch.priorityTier = want.priorityTier
    if (Object.keys(patch).length === 0) continue
    patch.updatedAt = now
    batch.set(doc(db, `homes/${homeId}/taskInstances/${d.id}`), patch, { merge: true })
    result.denormRepaired++
  }

  await batch.commit()
  return result
}
