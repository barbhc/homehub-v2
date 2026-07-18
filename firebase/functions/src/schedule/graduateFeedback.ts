/**
 * graduateFeedback — weekly Cloud Scheduler job (Phase D of the task-feedback
 * loop). Scans task-feedback across ALL homes, groups it by its home-independent
 * pattern, and — when the same correction recurs across ≥ N distinct homes —
 * upserts a `parseEvalCandidates/{id}` doc: a maintainer-facing signal to add a
 * golden + tune the parse prompt through the eval harness (non-negotiable #5).
 *
 * It NEVER touches the shared prompt or any home's data. The candidates
 * collection is server-only (see firestore.rules); a maintainer reviews it via
 * scripts/parse-eval/graduation.ts. `runGraduation` is the injectable,
 * emulator-testable core.
 */
import { onSchedule } from "firebase-functions/v2/scheduler"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { aggregateGraduation, GRADUATION_THRESHOLD, type GraduationRow, type FeedbackPattern } from "../../../../shared/tasks/graduation.js"

const REGION = "us-central1"

export interface GraduationRunResult {
  feedbackScanned: number
  candidates: number
}

/** Firestore doc-id-safe token for a patternKey (which contains `|` and `:`). */
function candidateId(patternKey: string): string {
  return patternKey.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 400)
}

function iso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}

export async function runGraduation(db: Firestore, threshold = GRADUATION_THRESHOLD): Promise<GraduationRunResult> {
  const snap = await db.collectionGroup("taskFeedback").get()

  const rows: GraduationRow[] = []
  for (const d of snap.docs) {
    if (d.get("deletedAt") != null) continue
    const homeId = d.ref.parent.parent?.id // homes/{homeId}/taskFeedback/{id}
    const patternKey = (d.get("patternKey") ?? null) as string | null
    const pattern = d.get("pattern") as FeedbackPattern | undefined
    if (!homeId || !patternKey || !pattern) continue // legacy/home-specific rows don't graduate
    rows.push({ homeId, patternKey, pattern, title: d.get("title") ?? "", createdAt: iso(d.get("createdAt")) })
  }

  const candidates = aggregateGraduation(rows, threshold)
  const now = Timestamp.now()

  for (const c of candidates) {
    const ref = db.doc(`parseEvalCandidates/${candidateId(c.patternKey)}`)
    const existing = await ref.get()
    await ref.set(
      {
        patternKey: c.patternKey,
        pattern: c.pattern,
        homeCount: c.homeCount,
        feedbackCount: c.feedbackCount,
        exampleTitles: c.exampleTitles,
        firstSeen: existing.exists ? (existing.get("firstSeen") ?? c.firstSeen) : c.firstSeen,
        lastSeen: c.lastSeen,
        suggestion: c.suggestion,
        // Preserve a maintainer's triage decision across runs; new candidates start "new".
        status: existing.exists ? (existing.get("status") ?? "new") : "new",
        updatedAt: now,
      },
      { merge: true },
    )
  }

  return { feedbackScanned: rows.length, candidates: candidates.length }
}

export const graduateFeedback = onSchedule(
  { region: REGION, schedule: "0 6 * * 1", timeZone: "America/Los_Angeles" },
  async () => {
    const res = await runGraduation(getFirestore())
    console.log(`graduateFeedback: scanned=${res.feedbackScanned} candidates=${res.candidates}`)
  },
)
