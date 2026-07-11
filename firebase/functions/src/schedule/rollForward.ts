/**
 * rollForwardNeverStarted — daily Cloud Scheduler job (v1 pg_cron
 * `roll-forward-never-started`, migration 20260701000002). Re-anchors
 * never-started, past-due, RECURRING instances to the next cycle from today so a
 * task nobody ever got to reads as upcoming rather than a false lapse — but ONLY
 * when no completed sibling exists for the template (a genuinely lapsed task
 * keeps its real overdue date).
 *
 * Core (`runRollForward`) is a plain function over an injected Firestore + today,
 * directly testable on the emulator.
 */
import { onSchedule } from "firebase-functions/v2/scheduler"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { addCadence, type ScheduleType } from "./cadence.js"

const REGION = "us-central1"

export interface RollForwardResult {
  scanned: number
  rolled: number
  skippedHasDone: number
  skippedNonRecurring: number
}

export async function runRollForward(db: Firestore, today: string): Promise<RollForwardResult> {
  // Collection-group sweep across all homes: past-due, still-scheduled, not deleted.
  const candidates = await db
    .collectionGroup("taskInstances")
    .where("status", "==", "scheduled")
    .where("deletedAt", "==", null)
    .where("dueDate", "<", today)
    .get()

  const result: RollForwardResult = { scanned: candidates.size, rolled: 0, skippedHasDone: 0, skippedNonRecurring: 0 }
  const nowTs = Timestamp.now()
  const batch = db.batch()

  for (const inst of candidates.docs) {
    const homeRef = inst.ref.parent.parent // homes/{homeId}
    if (!homeRef) continue
    const templateId: string = inst.get("taskTemplateId")

    // Skip if the template has any completed instance (a real lapse stays overdue).
    const done = await db
      .collection(`${homeRef.path}/taskInstances`)
      .where("taskTemplateId", "==", templateId)
      .where("status", "==", "done")
      .limit(1)
      .get()
    if (!done.empty) {
      result.skippedHasDone++
      continue
    }

    const tpl = await db.doc(`${homeRef.path}/taskTemplates/${templateId}`).get()
    const scheduleType = tpl.get("schedule.scheduleType") as ScheduleType | undefined
    const intervalDays = (tpl.get("schedule.intervalDays") as number | null) ?? null
    const newDue = scheduleType ? addCadence(today, scheduleType, intervalDays) : null
    if (!newDue) {
      result.skippedNonRecurring++
      continue
    }

    batch.set(inst.ref, { dueDate: newDue, updatedAt: nowTs }, { merge: true })
    result.rolled++
  }

  if (result.rolled > 0) await batch.commit()
  return result
}

/** "today" as YYYY-MM-DD in the scheduler's timezone (America/Los_Angeles). */
function todayInLA(): string {
  // en-CA gives YYYY-MM-DD; timeZone shifts to Pacific to match v1's cron intent.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date())
}

export const rollForwardNeverStarted = onSchedule(
  { region: REGION, schedule: "30 5 * * *", timeZone: "America/Los_Angeles" },
  async () => {
    const res = await runRollForward(getFirestore(), todayInLA())
    console.log(`rollForward: scanned=${res.scanned} rolled=${res.rolled} hasDone=${res.skippedHasDone} nonRecurring=${res.skippedNonRecurring}`)
  }
)
