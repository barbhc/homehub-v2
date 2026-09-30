/**
 * When a cleaning task on the Deep Clean hub's "This week" list wants doing.
 * Moved out of DeepClean.tsx so the vocabulary can be tested on its own.
 */
import type { CleanTask } from "@/lib/cleanSession"
import { dueKindOf, dueWindow, isTrulyOverdue, windowPhrase } from "@/lib/dueWindow"

/** Signed whole-day delta from today; negative = past due. null dates sort late. */
export function daysUntilDue(dateStr: string | null): number {
  if (!dateStr) return 9999
  const a = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00")
  const b = new Date(dateStr + "T00:00:00")
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * The short label beside a task. Late work in clay, never red.
 *
 * Only a passed DEADLINE may say "Overdue". A cleaning cadence that slipped has
 * not missed a deadline — it has "Been a while", or is still "Good to do now"
 * inside its window — in the words Home, Tasks and the item page use for the
 * same task (shared/care/dueWindow.ts). This label used to call every task past
 * its date "Overdue": the /clean hub was the one surface still doing it.
 *
 * `overdue` is the emphasis flag (clay): a passed deadline, or a window that
 * has closed. A task still inside its window is not late, whatever its date.
 */
export function cleanDueLabel(
  t: Pick<CleanTask, "title" | "dueDate" | "scheduleType" | "isOverdue">,
): { text: string; overdue: boolean } {
  // isOverdue is only ever set for a dated task (cleanSession), but the type
  // cannot say so; an undated one falls through to the forward labels.
  if (t.isOverdue && t.dueDate) {
    const kind = dueKindOf({ title: t.title, scheduleType: t.scheduleType, careType: "cleaning" })
    if (isTrulyOverdue(t.dueDate, kind)) return { text: "Overdue", overdue: true }
    return {
      text: windowPhrase(t.dueDate, t.scheduleType, { kind }),
      overdue: dueWindow(t.dueDate, t.scheduleType).state === "lapsed",
    }
  }
  const n = daysUntilDue(t.dueDate)
  if (n <= 0) return { text: "Today", overdue: false }
  if (n === 1) return { text: "Tomorrow", overdue: false }
  if (n <= 7) return { text: `${n} days`, overdue: false }
  return { text: "Later", overdue: false }
}
