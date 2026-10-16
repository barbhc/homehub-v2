// ── Tasks redesign — shared helpers (mobile RefinedWeek + desktop DesktopTasks)
// Ported from the design handoff (tasks-redesign{,2,3}.jsx / tasks-desktop.jsx),
// rebuilt against the real WeekAgenda read model. The prototype's hardcoded
// "June 2026 / today = 24th" calendar and item→room mapping are replaced with
// real dates and the real room join. Calm tiers only (never red); overdue is a
// clay dot + the word "Overdue", never a full-orange line or "50d overdue".

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  getTaskDetail, previewNextDue, snoozeTaskInstance, unsnoozeTaskInstance,
  type SnoozePrior, type TaskDetail, type WeekAgendaItem,
} from "@/modules/care"
import {
  failedDones, forgetDone, queueDone, setQueuedNextDue, subscribeDoneQueue, writeDone, writeUnheldDones,
  type QueuedDone,
} from "./doneQueue"
import type { Tier } from "@/lib/redesign/tokens"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { addDays, diffDays, localToday } from "../../../../shared/dates/calendar"
import { SNOOZE_DAYS } from "../../../../shared/tasks/snooze"

// Group accent tones (calm tier palette — clay for overdue, never pure red).
export const CLAY = "var(--hh-clay)"
export const TEAL = "var(--hh-teal)"
export const SLATE = "var(--hh-slate)"

const TIER_RANK: Record<string, number> = { essential: 0, recommended: 1, optional: 2 }

/**
 * The Tasks headline when there is nothing on the list — and where the work
 * went, when some was left off it on purpose.
 *
 * HH-82 / HH-94: item-scoped cleaning never reaches this feed (it lives in the
 * item's guides and in Deep Clean), so an empty list with cleaning scheduled is
 * not "nothing due". The phone and desktop pages each carried their own copy of
 * this line, and only the phone's ever learned the count; this is the one copy
 * both render, fed by the count useWeekAgenda carries with every agenda.
 *
 * Only for an EMPTY agenda. A list a filter has emptied is not "nothing on the
 * schedule" — its headline says how much the filter is hiding instead — and a
 * non-empty list states the count in HiddenCleaningLink, below its groups.
 */
export function nothingDueLine(hiddenCleaning: number): string {
  if (hiddenCleaning <= 0) return "Nothing due — enjoy the calm."
  return `Nothing on the schedule — ${hiddenCleaning} cleaning job${hiddenCleaning === 1 ? " lives" : "s live"} in your guides.`
}

// ── Check-off and snooze, for both trees ─────────────────────────────────────

/**
 * What a failed check-off or snooze says — Home's words (Home.tsx, #230), so a
 * task that won't complete reads the same on Home and on Tasks. The service's
 * own error is for the log, not the person.
 */
export const DONE_FAILED = "Couldn't mark this done. Check your connection and try again."
export const SNOOZE_FAILED = "Couldn't snooze this. Check your connection and try again."

/** completeTask's date refusals (firebase/functions/src/tasks/completedOn.ts)
 *  all open this way. They are written for the person and say what to check
 *  (this device's date, or a day too far back), so they are shown as sent. */
const DATE_REFUSAL = "Can't record this as done"

/**
 * What a failed check-off says on the task page and the item page: the
 * server's own date refusal as sent, and DONE_FAILED for anything else. Never
 * the service's raw error — that is for the log, which the caller writes with
 * its ids.
 */
export function doneFailedMessage(error: string | null | undefined): string {
  return typeof error === "string" && error.startsWith(DATE_REFUSAL) ? error : DONE_FAILED
}

/** "Oct 29" — the date style every task receipt uses (Snoozed until …, next due …). */
export function receiptDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** How long a Done can be undone before it is written. */
export const DONE_UNDO_MS = 6000
/** How long the bar waits for the next-due date before showing plain "Done". */
const PREVIEW_WAIT_MS = 700

export type DoneOutcome =
  | { status: "saved" }
  | { status: "undone" }
  | { status: "failed"; message: string }

export interface TaskActionsOptions {
  /** Log prefix — which surface this is ("home", "tasks", "item care"). */
  where: string
  /** A Done was WRITTEN: bring the surface up to date (refetch, or drop the row). The row stays hidden until this settles. */
  onDoneSaved?: (id: string) => unknown
  /** A snooze was written. The row stays hidden; the surface may refetch. */
  onSnoozed?: (id: string) => unknown
  /** A snooze was undone: the task is back, so the surface should refetch to show it. */
  onUnsnoozed?: (id: string) => unknown
  /**
   * Say Dones refused after their screen had gone (default true). False for a
   * tree the page mounts but CSS hides (Tasks mounts both its trees), so the
   * line is said once.
   */
  showLostDones?: boolean
}

/** What the surface renders as its UndoBar: spread it in. Null when there is nothing to say. */
export interface TaskActionBar {
  message: string
  onUndo?: () => void
  /** The bar's button, when it is not "Undo" ("Try again"). */
  actionLabel?: string
  onDismiss: () => void
  /** 0: stays until acted on (a failure is not furniture to time out). */
  ms: number
}

type PendingDone = {
  homeId: string
  timer: number | null
  settle: (o: DoneOutcome) => void
}

type BarState = { message: string; onUndo?: () => void; doneId?: string; ms: number }

/** Run a surface's catch-up after a write that already landed: a failure only
 *  means the list is stale until its next read, so it is logged, not surfaced. */
function follow(where: string, id: string, fn: () => unknown) {
  Promise.resolve()
    .then(fn)
    .catch((e: unknown) => {
      console.warn(`[${where}] task ${id} was saved, but the list did not refresh:`, e instanceof Error ? e.message : e)
    })
}

/** Why a Done can never be written, in one line — for the Try again that found out. */
function terminalDoneMessage(error: string | null | undefined): string {
  if (typeof error === "string" && /not found/i.test(error)) return "That task no longer exists."
  if (typeof error === "string" && /not a member|permission/i.test(error)) return "You're no longer in that home."
  return "That task can't be marked done any more."
}

/** What a Done refused after its screen had gone says, on whatever screen is up now. */
function lostDoneMessage(d: QueuedDone): string {
  if (typeof d.error === "string" && d.error.startsWith(DATE_REFUSAL)) return d.error
  return d.label ? `Couldn't mark “${d.label}” done.` : "Couldn't mark a task done."
}

/**
 * Done and Snooze — ONE implementation for every list that offers them: Home's
 * week list, the Tasks rows (buttons and swipe, phone and desktop), and the
 * item page's schedule. Owner, 2026-10-15: "One Done and Snooze everywhere."
 *
 * Snooze: puts the task away for SNOOZE_DAYS (14), writes at once, and says
 * "Snoozed until {date}" with Undo, which puts back exactly what the snooze
 * replaced (an earlier snooze included). While snoozed the task is off every
 * list and every push until that date (shared/tasks/snooze).
 *
 * Done: the row goes at once and the bar says "Done · next due {date}" with
 * Undo for DONE_UNDO_MS — and NOTHING is written until that runs out. Undo is
 * therefore free: there is no completion to unpick (completeTask mints the next
 * instance, and completion history is never deleted — non-negotiable #3).
 *
 * A Done is never lost after its receipt said "Done" (doneQueue.ts): it is on
 * disk from the tap. It is written when the window runs out, when the bar is
 * dismissed, when another Done or Snooze starts, when the surface unmounts, and
 * when the page is hidden; whatever is still unwritten — the app was swiped
 * away — is written by the next screen that mounts this hook. A write refused
 * on screen brings the row back with the reason on it; one refused after its
 * screen has gone is said on the next screen ("Couldn't mark X done", Try
 * again) until it lands or is dismissed.
 *
 * The task page keeps its own confirm sheet: it is a deliberate full-page
 * action with a date to adjust, not a tap in a list.
 */
export function useTaskActions(homeId: string | null, options: TaskActionsOptions) {
  const opts = useRef(options)
  useEffect(() => {
    opts.current = options
  })
  const mounted = useRef(true)

  /** Rows taken off the list: a Done waiting to be written (or catching up), or a snooze. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  /** The row whose snooze write is in flight. */
  const [busyId, setBusyId] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null)
  const [bar, setBar] = useState<BarState | null>(null)
  const pending = useRef(new Map<string, PendingDone>())
  /** Dones refused after their screen had gone — said here until they land or are dismissed. */
  const lost = useSyncExternalStore(subscribeDoneQueue, failedDones)
  const [retrying, setRetrying] = useState<string | null>(null)

  const hide = useCallback((id: string) => setHidden((s) => (s.has(id) ? s : new Set(s).add(id))), [])
  const unhide = useCallback((id: string) => setHidden((s) => {
    if (!s.has(id)) return s
    const next = new Set(s)
    next.delete(id)
    return next
  }), [])

  /** Write one waiting Done now. Idempotent: a second call for the same id does nothing. */
  const commit = useCallback(async (id: string) => {
    const p = pending.current.get(id)
    if (!p) return
    pending.current.delete(id)
    if (p.timer !== null) window.clearTimeout(p.timer)
    // Its Undo is gone with it — a bar still offering Undo would offer nothing.
    if (mounted.current) setBar((b) => (b?.doneId === id ? null : b))
    const res = await writeDone(p.homeId, id)
    if (!res.success) {
      console.warn(`[${opts.current.where}] could not mark task done ${id} (home ${p.homeId}):`, res.error)
      const message = doneFailedMessage(res.error)
      if (mounted.current) {
        // Said on the task's own row, which is back with Mark done on it — so
        // the queue need not say it a second time.
        forgetDone(p.homeId, id)
        unhide(id)
        setFailure({ id, message })
      }
      // Unmounted: it stays in the queue as failed, and the next screen says so.
      p.settle({ status: "failed", message })
      return
    }
    try {
      await opts.current.onDoneSaved?.(id)
    } catch (e) {
      // The Done is written; only the list's catch-up failed. The next read shows it.
      console.warn(`[${opts.current.where}] task ${id} is done, but the list did not refresh (home ${p.homeId}):`, e instanceof Error ? e.message : e)
    }
    unhide(id)
    p.settle({ status: "saved" })
  }, [unhide])

  /** Write every waiting Done now. */
  const flush = useCallback(() => {
    for (const id of [...pending.current.keys()]) void commit(id)
  }, [commit])

  // Never lose a Done: leaving the surface writes it, and so does the app
  // going to the background. What neither reaches (the app killed mid-write)
  // is on disk, and the next screen to mount writes it.
  useEffect(() => {
    mounted.current = true
    writeUnheldDones()
    const onHide = () => {
      if (document.visibilityState === "hidden") flush()
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", flush)
    return () => {
      mounted.current = false
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [flush])

  const done = useCallback((id: string, label: string | null = null): Promise<DoneOutcome> => {
    if (!homeId || pending.current.has(id)) return Promise.resolve({ status: "undone" })
    // One bar at a time: an earlier Done the new bar replaces is written now.
    flush()
    setFailure(null)
    hide(id)
    const completedOn = localToday()
    // On disk before anything else happens, so nothing after this can lose it.
    queueDone({ homeId, id, label, completedOn })
    return new Promise<DoneOutcome>((settle) => {
      const entry: PendingDone = { homeId, timer: null, settle }
      pending.current.set(id, entry)
      let nextDue: string | null = null
      const undo = () => {
        const p = pending.current.get(id)
        if (!p) return
        pending.current.delete(id)
        if (p.timer !== null) window.clearTimeout(p.timer)
        forgetDone(p.homeId, id)
        unhide(id)
        p.settle({ status: "undone" })
      }
      const show = (next: string | null) => {
        if (pending.current.get(id) !== entry) return
        if (entry.timer === null) {
          entry.timer = window.setTimeout(() => void commit(id), DONE_UNDO_MS)
        }
        if (next) {
          nextDue = next
          setQueuedNextDue(homeId, id, next)
        }
        setBar({
          message: nextDue ? `Done · next due ${receiptDate(nextDue)}` : "Done",
          onUndo: undo,
          doneId: id,
          ms: DONE_UNDO_MS,
        })
      }
      // The receipt names the next date, so it is read first — but the bar
      // never waits long for it: past PREVIEW_WAIT_MS it says "Done" and adds
      // the date if it arrives while the bar is still up.
      const wait = window.setTimeout(() => show(null), PREVIEW_WAIT_MS)
      Promise.resolve()
        .then(() => previewNextDue(homeId, id, completedOn))
        .then(
          (next) => {
            window.clearTimeout(wait)
            show(next)
          },
          (e: unknown) => {
            window.clearTimeout(wait)
            // Only the date is missing from the receipt; the Done itself is unaffected.
            console.warn(`[${opts.current.where}] could not preview the next due date of ${id} (home ${homeId}):`, e instanceof Error ? e.message : e)
            show(null)
          },
        )
    })
  }, [homeId, flush, hide, unhide, commit])

  const undoSnooze = useCallback((home: string, id: string, prior: SnoozePrior | null) => {
    function attempt() {
      void unsnoozeTaskInstance(home, id, prior).then((r) => {
        if (r.success) {
          unhide(id)
          follow(opts.current.where, id, () => opts.current.onUnsnoozed?.(id))
          return
        }
        // A failed undo comes back to the bar with the same Undo — it used to
        // vanish and leave the task snoozed with nothing said.
        console.warn(`[${opts.current.where}] could not undo the snooze of task ${id} (home ${home}):`, r.error)
        setBar({ message: "Couldn't undo the snooze — tap Undo to try again.", onUndo: attempt, ms: 7000 })
      })
    }
    attempt()
  }, [unhide])

  const snooze = useCallback(async (id: string): Promise<{ error: string | null }> => {
    if (!homeId) return { error: SNOOZE_FAILED }
    flush()
    setFailure(null)
    setBusyId(id)
    const until = addDays(localToday(), SNOOZE_DAYS)
    let res: Awaited<ReturnType<typeof snoozeTaskInstance>>
    try {
      res = await snoozeTaskInstance(homeId, id, until)
    } catch (e) {
      res = { success: false, error: e instanceof Error ? e.message : String(e) }
    }
    setBusyId(null)
    if (!res.success) {
      // The task stays where it was; its row says the snooze didn't take.
      console.warn(`[${opts.current.where}] could not snooze task ${id} (home ${homeId}):`, res.error)
      setFailure({ id, message: SNOOZE_FAILED })
      return { error: SNOOZE_FAILED }
    }
    hide(id)
    follow(opts.current.where, id, () => opts.current.onSnoozed?.(id))
    // Say what happened and offer the way back. Without this the row simply
    // disappeared, which a tester read as having deleted the task.
    const home = homeId
    const prior = res.prior ?? null
    setBar({ message: `Snoozed until ${receiptDate(until)}`, onUndo: () => undoSnooze(home, id, prior), ms: 7000 })
    return { error: null }
  }, [homeId, flush, hide, undoSnooze])

  const barNow = useRef<BarState | null>(null)
  useEffect(() => {
    barNow.current = bar
  })
  const dismiss = useCallback(() => {
    // Closing a Done's bar accepts it: write it now rather than at the timer.
    const doneId = barNow.current?.doneId
    setBar(null)
    if (doneId) void commit(doneId)
  }, [commit])

  // A Done refused after its screen had gone. Shown when this screen has
  // nothing of its own to say, and it stays until it lands or is dismissed.
  const firstLost = options.showLostDones === false ? null : (lost[0] ?? null)
  const retryLost = useCallback(() => {
    if (!firstLost) return
    setRetrying(firstLost.id)
    void writeDone(firstLost.homeId, firstLost.id).then((r) => {
      setRetrying(null)
      if (r.success) return
      console.warn(`[${opts.current.where}] could not mark task done ${firstLost.id} (home ${firstLost.homeId}) on retry:`, r.error)
      // Refused for good, so the queue dropped it: say why rather than let
      // the line just vanish under the person's thumb.
      if (r.terminal) setBar({ message: terminalDoneMessage(r.error), ms: 7000 })
    })
  }, [firstLost])
  const dismissLost = useCallback(() => {
    if (firstLost) forgetDone(firstLost.homeId, firstLost.id)
  }, [firstLost])

  const barProps: TaskActionBar | null = useMemo(() => {
    if (bar) return { message: bar.message, onUndo: bar.onUndo, onDismiss: dismiss, ms: bar.ms }
    if (firstLost && retrying !== firstLost.id) {
      return { message: lostDoneMessage(firstLost), onUndo: retryLost, actionLabel: "Try again", onDismiss: dismissLost, ms: 0 }
    }
    return null
  }, [bar, dismiss, firstLost, retrying, retryLost, dismissLost])

  return {
    /** Rows to leave off the list right now. */
    hidden,
    /** The row whose snooze write is in flight. */
    busyId,
    /** Why the last Done/Snooze failed, and on which row; cleared when the next one starts. */
    failure,
    done,
    snooze,
    /** Props for the surface's <UndoBar>, or null. */
    bar: barProps,
  }
}

/**
 * Done and Snooze for the agenda's rows: ONE implementation, which RefinedWeek
 * and DesktopTasks both call — rows, buttons and the phone's swipe alike — on
 * top of useTaskActions, the one Home and the item page use too.
 *
 * Each tree used to carry its own copy. The phone's learned to report a failed
 * write; the desktop's kept reading only `res.success`, so a failed check-off
 * or snooze closed the row and said nothing. Then Tasks' snooze was 7 days and
 * silent while Home's was 14 with Undo, and Tasks' Done had no Undo at all.
 *
 * A failure moves nothing: the task stays listed (it comes back, for a Done
 * whose deferred write failed), and `actionError` says why — `failedId` says
 * WHICH row, so a tree can put the words beside it. A write that SUCCEEDED
 * takes the task off the shared agenda; an undone snooze refetches it.
 */
export function useAgendaRowActions(
  homeId: string | null,
  agenda: { removeTask: (taskInstanceId: string) => void; refresh: () => unknown; data?: { items: WeekAgendaItem[] } },
  /** Which tree is calling: the Tasks page mounts both, and only the one on screen speaks for lost Dones. */
  tree: "phone" | "desktop",
) {
  const [openId, setOpenId] = useState<string | null>(null)
  const { removeTask, refresh, data } = agenda
  const isDesktop = useIsDesktop()
  const actions = useTaskActions(homeId, {
    where: "tasks",
    showLostDones: tree === (isDesktop ? "desktop" : "phone"),
    onDoneSaved: removeTask,
    onSnoozed: removeTask,
    onUnsnoozed: () => refresh(),
  })
  const { done, snooze } = actions

  const onDone = useCallback(
    async (id: string) => {
      setOpenId(null)
      await done(id, data?.items.find((t) => t.taskInstanceId === id)?.title ?? null)
    },
    [done, data],
  )

  const onSnooze = useCallback(
    async (id: string) => {
      const res = await snooze(id)
      if (!res.error) setOpenId(null)
    },
    [snooze],
  )

  const toggle = useCallback((id: string) => setOpenId((cur) => (cur === id ? null : id)), [])

  return {
    /** The expanded row, if any. */
    openId,
    toggle,
    /** The row whose write is in flight — collapsed until it answers. */
    pendingId: actions.busyId,
    /** Why the last Done/Snooze failed; cleared when the next one starts. */
    actionError: actions.failure?.message ?? null,
    /** The row that last Done/Snooze failed on. */
    failedId: actions.failure?.id ?? null,
    onDone,
    onSnooze,
    /** Rows to leave off the list right now (a Done in its Undo window, a fresh snooze). */
    hidden: actions.hidden,
    /** Props for the page's <UndoBar>, or null. */
    bar: actions.bar,
  }
}

/** The agenda without the rows useAgendaRowActions is holding off it. */
export function withoutHidden(items: WeekAgendaItem[], hidden: ReadonlySet<string>): WeekAgendaItem[] {
  return hidden.size === 0 ? items : items.filter((t) => !hidden.has(t.taskInstanceId))
}

/**
 * Calm "when" label for a row's metadata line. Overdue collapses to the single
 * word "Overdue" (no alarming "50d overdue" precision); on-track rows get a
 * natural-language relative label.
 */
export function whenLabel(t: WeekAgendaItem): string {
  // Only a real deadline still says the word. Window-kind work carries its own
  // phrase ("Been a while") — see design/due-windows.md.
  if (t.trulyOverdue) return "Overdue"
  if (t.duePhrase) return t.duePhrase
  // Past-due but not a genuine lapse (never started, or non-essential cadence):
  // calm "Start anytime" instead of an alarming day count.
  if (t.pastDue) return "Start anytime"
  const n = diffDays(localToday(), t.dueDate)
  if (n <= 0) return "Today"
  if (n === 1) return "Tomorrow"
  if (n <= 7) return `In ${n} days`
  return new Date(t.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ── Grouping ──────────────────────────────────────────────────────────────────

export type Lens = "urgency" | "room" | "item"
export type TaskGroup = { key: string; label: string; tone: string; items: WeekAgendaItem[]; mins: number }

/** Real room (from the item→room join), falling back to "Home" for home-scoped work. */
export function roomOf(t: WeekAgendaItem): string {
  return t.roomName ?? "Home"
}
/** Item label for the item filter / "Group by Item". Home-scoped tasks group
 *  under "Whole home" — a real address, not an apology like the old
 *  "not linked to an item" framing. This is where the removed Home-upkeep row's
 *  job now lives. */
export function itemOf(t: WeekAgendaItem): string {
  return t.itemName ?? t.roomName ?? "Whole home"
}

function sortRows(rows: WeekAgendaItem[]): WeekAgendaItem[] {
  const today = localToday()
  return [...rows].sort(
    (a, b) =>
      diffDays(today, a.dueDate) - diffDays(today, b.dueDate) ||
      (TIER_RANK[a.priorityTier] ?? 2) - (TIER_RANK[b.priorityTier] ?? 2)
  )
}
function sumMins(rows: WeekAgendaItem[]): number {
  return rows.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0)
}

export function groupTasks(tasks: WeekAgendaItem[], lens: Lens): TaskGroup[] {
  if (lens === "urgency") {
    // Grouped by WHEN ACTING MAKES SENSE, not by calendar failure
    // (design/due-windows.md). "Deadlines" is the only bucket that keeps clay,
    // and it is usually empty — which is the point: red means something again.
    const isDeadline = (t: WeekAgendaItem) => t.dueKind === "deadline"
    const buckets: { key: string; label: string; tone: string; items: WeekAgendaItem[] }[] = [
      { key: "deadlines", label: "Deadlines", tone: CLAY, items: tasks.filter(isDeadline) },
      // Window hasn't opened yet — genuinely not yet, no pressure implied.
      {
        key: "coming", label: "Coming up", tone: SLATE,
        items: tasks.filter((t) => !isDeadline(t) && t.windowState === "upcoming"),
      },
      // CATCH-ALL, deliberately last and defined by exclusion: in-window,
      // lapsed, or carrying no window state at all. Filtering this bucket by
      // explicit states made the grouping non-total, and a task that matches no
      // bucket does not render — it silently disappears from the user's list.
      {
        key: "now", label: "Good to do now", tone: TEAL,
        items: tasks.filter((t) => !isDeadline(t) && t.windowState !== "upcoming"),
      },
    ]
    const ordered = [buckets[0], buckets[2], buckets[1]]
    return ordered
      .filter((g) => g.items.length > 0)
      .map((g) => ({ ...g, items: sortRows(g.items), mins: sumMins(g.items) }))
  }

  const keyOf = lens === "room" ? roomOf : itemOf
  const map = new Map<string, WeekAgendaItem[]>()
  for (const t of tasks) {
    const k = keyOf(t)
    const list = map.get(k) ?? []
    list.push(t)
    map.set(k, list)
  }
  const ranked = [...map.entries()].map(([label, items]) => ({
    group: { key: label, label, tone: items.some((t) => t.isOverdue) ? CLAY : TEAL, items: sortRows(items), mins: sumMins(items) } as TaskGroup,
    overdue: items.some((t) => t.isOverdue),
  }))
  ranked.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.group.items.length - a.group.items.length)
  return ranked.map((r) => r.group)
}

/** Distinct item labels present in the list, for the item filter. */
export function itemOptions(tasks: WeekAgendaItem[]): string[] {
  return [...new Set(tasks.map(itemOf))].sort((a, b) => a.localeCompare(b))
}

export function applyFilters(tasks: WeekAgendaItem[], tier: string, item: string): WeekAgendaItem[] {
  return tasks.filter((t) => (tier === "all" || t.priorityTier === tier) && (item === "all" || itemOf(t) === item))
}

// ── Fix A: calm-by-default surfacing ────────────────────────────────────────
// The task list defaults to a "Focus" view — essential work OR anything overdue
// (any tier) — so a long tail of optional/recommended tasks never makes the list
// feel overwhelming. "All" is always one tap away and shows the true total, so
// nothing feels hidden. Universal default (NOT level-keyed): volume calming
// protects everyone; power users get the one-tap escape hatch.

export type TierFilter = "focus" | "all" | "essential" | "recommended" | "optional"

/** True when a task belongs in the Focus view: essential OR overdue (any tier). */
export function isFocusTask(t: WeekAgendaItem): boolean {
  return t.priorityTier === "essential" || t.isOverdue
}

/**
 * The priority menu, in order, with the labels the user actually reads.
 *
 * "Focus" was renamed to "Needs you" after the owner said, plainly, that she
 * could not tell it apart from "All". The behaviour was never the problem —
 * essential-or-overdue is the right default — but a filter has to say what it
 * selects, and "Focus" said nothing. Everything else keeps the tier names used
 * across the rest of the app.
 */
export const TIER_FILTERS: { value: string; label: string; short: string; dot: string | null }[] = [
  // `short` is what the trigger shows; `label` is the full name in the menu,
  // where there is room for it.
  { value: "focus", label: "Needs you", short: "Needs you", dot: null },
  { value: "all", label: "All priorities", short: "All", dot: null },
  { value: "essential", label: "Essential", short: "Essential", dot: "var(--hh-clay)" },
  { value: "recommended", label: "Recommended", short: "Recommended", dot: "var(--hh-teal)" },
  { value: "optional", label: "Optional", short: "Optional", dot: "var(--hh-slate)" },
]

/** Counts for every option, computed over the UNFILTERED set so each choice
 *  states what it would yield before it is picked. */
export function tierFilterCounts(tasks: WeekAgendaItem[], item: string): Record<string, number> {
  const scoped = applyTierFilter(tasks, "all", item)
  return {
    focus: scoped.filter(isFocusTask).length,
    all: scoped.length,
    essential: scoped.filter((t) => t.priorityTier === "essential").length,
    recommended: scoped.filter((t) => t.priorityTier === "recommended").length,
    optional: scoped.filter((t) => t.priorityTier === "optional").length,
  }
}

/**
 * Tier + item filter. `tier` accepts a TierFilter; "focus" = essential OR overdue
 * (any tier), "all" = everything. Supersedes applyFilters for the task screens.
 */
export function applyTierFilter(tasks: WeekAgendaItem[], tier: string, item: string): WeekAgendaItem[] {
  return tasks.filter((t) => {
    const tierOk =
      tier === "all"
        ? true
        : tier === "focus"
          ? isFocusTask(t)
          : t.priorityTier === tier
    const itemOk = item === "all" || itemOf(t) === item
    return tierOk && itemOk
  })
}

const TIER_STORAGE_KEY = "homehub:tasks-tier"

/**
 * Tier-filter state that persists within a session but resets to "all" each
 * NEW session (sessionStorage is per-tab-session by design). Shared by mobile
 * RefinedWeek and desktop DesktopTasks so the behavior can't drift.
 *
 * The default WAS "focus" (essential-or-overdue). The owner questioned that
 * filter twice — first as "Focus", then, renamed, as "Needs you" — and the
 * second time the page was reporting "2 to do" while quietly hiding nine more.
 * A default that filters is a default that hides; grouping by Urgency already
 * puts what needs you first without pretending the rest doesn't exist.
 * "Needs you" stays in the menu as an opt-in lens.
 */
export function useTierFilter(): [string, (t: string) => void] {
  const [tier, setTierState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(TIER_STORAGE_KEY) || "all"
    } catch {
      // Storage unavailable (private mode): start unfiltered, as a first visit does.
      return "all"
    }
  })
  const setTier = (t: string) => {
    try {
      sessionStorage.setItem(TIER_STORAGE_KEY, t)
    } catch {
      /* storage unavailable (private mode / SSR) — in-memory only */
    }
    setTierState(t)
  }
  return [tier, setTier]
}

// ── "Start here" insight ────────────────────────────────────────────────────

export type Insight = { kind: "start"; label: string; text: string; tone: string }

export function computeInsight(tasks: WeekAgendaItem[]): Insight | null {
  // Deadlines first — the only thing that is genuinely late.
  const deadlines = tasks.filter((t) => t.trulyOverdue).length
  if (deadlines > 0) {
    return {
      kind: "start",
      label: "Start here",
      tone: CLAY,
      text: `${deadlines} deadline${deadlines > 1 ? "s have" : " has"} passed.`,
    }
  }
  // Lapsed safety work earns firmness without the word "overdue": a skipped
  // detector check is worth saying plainly, and it is the one place a nudge is
  // honest (owner-approved, design/due-windows.md).
  const safety = tasks.filter((t) => t.safetyNote).length
  if (safety > 0) {
    return {
      kind: "start",
      label: "Worth doing",
      tone: CLAY,
      text: `${safety} safety check${safety > 1 ? "s have" : " has"} skipped a cycle.`,
    }
  }
  // Room clusters ("6 of your 11 tasks are in the Kitchen — worth one pass")
  // are deliberately NOT surfaced. The rule was true but not useful, and
  // because it was recomputed from the list on every visit the dismiss never
  // stuck — the same note greeted the owner every time (2026-09-08). A banner
  // has to change what you do next; a head-count by room does not.
  // Nothing worth saying. Say nothing: callers hide the banner entirely rather
  // than fill the top of the screen with a platitude.
  return null
}

// ── Real-date month calendar ──────────────────────────────────────────────────

export type CalendarCell = { day: number; tiers: Tier[] } | null
export type MonthCalendar = {
  monthLabel: string
  todayDate: number
  cells: CalendarCell[]
}

/** Builds the current month's grid with tier-colored dots for due (non-overdue) tasks. */
export function monthCalendar(tasks: WeekAgendaItem[], now: Date = new Date()): MonthCalendar {
  const year = now.getFullYear()
  const month = now.getMonth()
  const first = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const dots = new Map<number, Tier[]>()
  for (const t of tasks) {
    if (t.isOverdue || t.pastDue) continue
    const d = new Date(t.dueDate + "T00:00:00")
    if (d.getFullYear() === year && d.getMonth() === month) {
      const k = d.getDate()
      const arr = dots.get(k) ?? []
      arr.push(t.priorityTier as Tier)
      dots.set(k, arr)
    }
  }

  const cells: CalendarCell[] = []
  for (let i = 0; i < first; i++) cells.push(null)
  for (let n = 1; n <= daysInMonth; n++) cells.push({ day: n, tiers: dots.get(n) ?? [] })

  return {
    monthLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    todayDate: now.getDate(),
    cells,
  }
}

/** Tasks due on a given day-of-(current)-month. */
export function tasksDueOnDay(tasks: WeekAgendaItem[], day: number, now: Date = new Date()): WeekAgendaItem[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  return tasks.filter((t) => {
    if (t.isOverdue || t.pastDue) return false
    const d = new Date(t.dueDate + "T00:00:00")
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
  })
}

/** "June 24"-style label for a selected day-of-current-month. */
export function dayLabel(day: number, now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), day).toLocaleDateString("en-US", { month: "long", day: "numeric" })
}

// ── Lazy task detail (why / notes) for the expandable row ──────────────────────
// Real task_template data exposes `justification` (why-it-matters) and
// `notes`/instructions_override, but NOT a structured supplies list or numbered
// steps — so the expanded row shows what's real and links to the full guide
// rather than inventing supplies/steps.

export function useTaskDetail(homeId: string | null, taskInstanceId: string | null, enabled: boolean, attempt = 0) {
  // One state object keyed by what was asked for: a stale answer for another
  // task never shows, and `loading` is derived rather than set — no setState
  // in the effect body. A failed read lands in `error` (Home's open row shows
  // it with a retry via `attempt`) instead of a spinner that never ends.
  const key = enabled && homeId && taskInstanceId ? `${homeId}|${taskInstanceId}|${attempt}` : null
  const [answer, setAnswer] = useState<{ key: string; detail: TaskDetail | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!key || !homeId || !taskInstanceId) return
    let cancelled = false
    getTaskDetail(homeId, taskInstanceId)
      .then((res) => {
        if (cancelled) return
        setAnswer({ key, detail: res.data ?? null, error: res.error ? res.error.message : null })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setAnswer({ key, detail: null, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [key, homeId, taskInstanceId])
  const current = answer && answer.key === key ? answer : null
  return { detail: current?.detail ?? null, loading: !!key && !current, error: current?.error ?? null }
}
