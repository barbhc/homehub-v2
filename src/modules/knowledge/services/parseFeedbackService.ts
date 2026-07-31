import { addDoc, collection, serverTimestamp } from "firebase/firestore"
import { db, auth } from "@/integrations/firebase"
import { patternKeyOf, type FeedbackPattern } from "../../../../shared/tasks/graduation"
import { ruleMatchFor } from "../../../../shared/tasks/houseRules"
import type { ReviewEdit, ReviewEditSummary } from "@/components/manuals/TaskReviewFeedback"

/**
 * "These tasks don't look right" — parse-level feedback from the review screen.
 *
 * Distinct from per-task feedback (`taskFeedback`, written when someone snoozes or
 * re-tiers a live task): this fires while a manual is being reviewed, the earliest
 * and cheapest moment to learn a parse was wrong. Task categorization has been the
 * hardest problem in the product, and without this the only signal is a user
 * silently making forty corrections and then leaving.
 *
 * Two writes:
 *   1. `parseFeedback` — always. The whole event: reasons, note, prompt version,
 *      and the structured diff of corrections the user already made. That diff is
 *      the strongest signal in the payload and costs the user nothing.
 *   2. `taskFeedback` — only for corrections that carry a home-INDEPENDENT
 *      pattern, so they join the same weekly `graduateFeedback` aggregation as
 *      per-task feedback and reach `parseEvalCandidates` at ≥3 distinct homes.
 *      Most single-title corrections resolve to a `template` match, which
 *      `patternKeyOf` deliberately refuses to graduate — one home renaming one
 *      task proves nothing. Those still live in the event doc above.
 *
 * Feedback never edits the prompt. Candidates route through the goldens harness
 * (`scripts/parse-eval/run.ts`) like every other prompt change.
 */

export interface ParseFeedbackInput {
  manualId: string | null
  itemUnitId: string | null
  reasons: string[]
  note: string
  edits: ReviewEditSummary
  rescanRequested: boolean
  /** sha of the prompt that produced this parse, when known — so a complaint can
   *  be attributed to a prompt version instead of guessed at later. */
  promptHash?: string | null
}

/** The house-rule action a correction corresponds to, for graduation. */
function actionFor(edit: ReviewEdit): string | null {
  switch (edit.field) {
    case "tier": return "tier_remap"
    case "schedule": return "cadence"
    case "kind": return "care_type"
    case "skip": return "suppress"
    default: return null
  }
}

export async function recordParseFeedback(homeId: string, input: ParseFeedbackInput): Promise<void> {
  const uid = auth.currentUser?.uid ?? null
  try {
    await addDoc(collection(db, `homes/${homeId}/parseFeedback`), {
      manualId: input.manualId,
      itemUnitId: input.itemUnitId,
      reasons: input.reasons,
      note: input.note.slice(0, 2000),
      editCounts: {
        tier: input.edits.tier,
        kind: input.edits.kind,
        schedule: input.edits.schedule,
        skipped: input.edits.skipped,
        total: input.edits.total,
      },
      // Evidence, not an audit log — a 200-task manual would otherwise write a
      // document nobody reads.
      editDetails: input.edits.details.slice(0, 60),
      rescanRequested: input.rescanRequested,
      promptHash: input.promptHash ?? null,
      createdBy: uid,
      createdAt: serverTimestamp(),
      deletedAt: null,
    })

    for (const edit of input.edits.details.slice(0, 40)) {
      const action = actionFor(edit)
      if (!action) continue
      const match = ruleMatchFor({
        taskTemplateId: "",
        title: edit.title,
        symptomTags: [],
        scheduleType: edit.field === "schedule" ? edit.to : null,
        season: null,
      })
      const pattern: FeedbackPattern = {
        chip: "parse_review",
        action,
        match,
        toTier: edit.field === "tier" ? edit.to : null,
        scheduleType: edit.field === "schedule" ? edit.to : null,
        season: null,
      }
      const patternKey = patternKeyOf(pattern)
      // Home-specific corrections don't graduate — that's the contract, not a gap.
      if (!patternKey) continue
      await addDoc(collection(db, `homes/${homeId}/taskFeedback`), {
        title: edit.title,
        pattern,
        patternKey,
        source: "parse_review",
        manualId: input.manualId,
        itemUnitId: input.itemUnitId,
        createdBy: uid,
        createdAt: serverTimestamp(),
        deletedAt: null,
      })
    }
  } catch {
    // Never block or interrupt a review on feedback — the user's task edits save
    // through a separate path and must not be coupled to this.
  }
}
