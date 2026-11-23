/**
 * A person's own tasks for the whole home: the list, delete, and the one add
 * form (Tasks → Add your own task, at /maintenance/custom;
 * design/settings-your-home.md).
 *
 * It replaces two forms. Settings' "Custom tasks" created a CLEANING task
 * without saying so; Your home's "Add something the library missed" created
 * an upkeep task. One form now asks where the task shows: Upkeep (the
 * default, `addCustomHomeTask`) or Cleaning (`saveRoutineTask`, as Settings
 * always did). The list and delete are Settings' own, unchanged.
 *
 * Every failure is said where it happened: a list that could not be read is
 * never drawn as empty, a failed add keeps what was typed, a failed delete
 * keeps the row. A late answer for a home already left lands nowhere (H4).
 */
import { useCallback, useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { useDepsChanged } from "@/hooks/useDepsChanged"
import { useIsCurrent } from "@/hooks/useIsCurrent"
import { InlineError } from "@/components/layout"
import { ListCard, ListSection } from "@/components/layout/RowList"
import { Button } from "@/components/ui/button"
import {
  getRoutineTemplates,
  saveRoutineTask,
  deleteRoutineTask,
  type RoutineTemplate,
} from "@/lib/cleanSession"
import { addCustomHomeTask } from "@/modules/care"
import { cadenceLabel } from "../../../shared/tasks/cadenceLabel"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)"
const SURFACE = "var(--hh-surface)", LINE = "var(--hh-line)"

const SCHEDULE_OPTIONS = ["weekly", "monthly", "quarterly", "semiannual", "annual", "as_needed"] as const
type Schedule = (typeof SCHEDULE_OPTIONS)[number]
const scheduleOf = (raw: string): Schedule => SCHEDULE_OPTIONS.find((o) => o === raw) ?? "weekly"

/** Which view of Tasks the new task belongs to. */
const SHOWS_IN = [
  { value: "upkeep", label: "Upkeep" },
  { value: "cleaning", label: "Cleaning" },
] as const
type ShowsIn = (typeof SHOWS_IN)[number]["value"]

type RoutinesRead = { routines: RoutineTemplate[] } | { error: unknown }

/** One read of the home's own tasks — the list, or the error. */
async function readRoutines(homeId: string): Promise<RoutinesRead> {
  try {
    return { routines: await getRoutineTemplates(homeId) }
  } catch (error) {
    // Not swallowed: handed back to be logged and said (applyRoutines).
    return { error }
  }
}

/** Adds the task where she said it shows. Returns the failure, or null. */
async function addOwnTask(homeId: string, title: string, schedule: Schedule, minutes: number | null, showsIn: ShowsIn): Promise<string | null> {
  if (showsIn === "cleaning") {
    const res = await saveRoutineTask(homeId, title, schedule, minutes)
    return "error" in res ? res.error : null
  }
  const res = await addCustomHomeTask(homeId, title, schedule, null, minutes)
  return res.error ? res.error.message : null
}

export function OwnTasksManager({ homeId }: { homeId: string }) {
  const [routines, setRoutines] = useState<RoutineTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState("")
  const [newSchedule, setNewSchedule] = useState<Schedule>("weekly")
  const [newMinutes, setNewMinutes] = useState("")
  const [showsIn, setShowsIn] = useState<ShowsIn>("upkeep")
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [routinesLoadFailed, setRoutinesLoadFailed] = useState(false)
  const [routinesError, setRoutinesError] = useState<string | null>(null)

  // The list is read by ONE function (readRoutines) and lands through ONE
  // apply, whether the read is the first, a home switch, Try again, or the
  // re-read after an add.
  const applyRoutines = useCallback((res: RoutinesRead) => {
    if ("routines" in res) {
      setRoutines(res.routines)
      setRoutinesLoadFailed(false)
    } else {
      console.warn(`[own tasks] could not load own tasks for home ${homeId}:`, res.error instanceof Error ? res.error.message : res.error)
      setRoutinesLoadFailed(true)
    }
    setLoading(false)
  }, [homeId])

  // The list lands only while its home is still the one on screen (H4): home
  // A's read answering after a switch to B used to replace B's list with A's.
  // A Try again or post-add re-read held from before the switch does not start
  // at all.
  const isCurrentHome = useIsCurrent(homeId)

  /** Try again: the spinner replaces the list while it is read. */
  const loadRoutines = useCallback(async () => {
    if (!isCurrentHome(homeId)) return
    setLoading(true)
    const res = await readRoutines(homeId)
    if (isCurrentHome(homeId)) applyRoutines(res)
  }, [homeId, applyRoutines, isCurrentHome])

  /** The re-read after an add: behind the page, so the "Added" line and the form stay on screen. */
  const refreshRoutines = useCallback(async () => {
    if (!isCurrentHome(homeId)) return
    const res = await readRoutines(homeId)
    if (isCurrentHome(homeId)) applyRoutines(res)
  }, [homeId, applyRoutines, isCurrentHome])

  // The first read and a home switch: the spinner starts in the render that
  // switches (it starts on for the first), and the effect only reads. A switch
  // also starts the form over: what was typed, and what was said, were about
  // the last home.
  if (useDepsChanged([homeId])) {
    setLoading(true)
    setNewTitle("")
    setNewMinutes("")
    setAdding(false)
    setAdded(null)
    setDeletingId(null)
    setRoutinesError(null)
  }
  useEffect(() => {
    void readRoutines(homeId).then((res) => {
      if (isCurrentHome(homeId)) applyRoutines(res)
    })
  }, [homeId, applyRoutines, isCurrentHome])

  const handleAdd = useCallback(async () => {
    const title = newTitle.trim()
    if (!title || adding) return
    // The home this add was started for: it goes there, and its answer is
    // about there, whichever home is on screen when it lands.
    const forHome = homeId
    const parsed = newMinutes ? Number.parseInt(newMinutes, 10) : Number.NaN
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    setAdding(true)
    setRoutinesError(null)
    setAdded(null)
    const failure = await addOwnTask(forHome, title, newSchedule, minutes, showsIn)
    if (!isCurrentHome(forHome)) {
      if (failure) console.warn(`[own tasks] could not add a task for home ${forHome}, answered after a switch:`, failure)
      return
    }
    setAdding(false)
    if (failure) {
      // The typed task stays in the form, ready to try again.
      console.warn(`[own tasks] could not add a task (${showsIn}, home ${forHome}):`, failure)
      setRoutinesError("Couldn't add that task. Check your connection and try again.")
      return
    }
    setAdded(title)
    setNewTitle("")
    setNewMinutes("")
    void refreshRoutines()
  }, [homeId, newTitle, newSchedule, newMinutes, showsIn, adding, isCurrentHome, refreshRoutines])

  const handleDelete = useCallback(
    async (templateId: string) => {
      const forHome = homeId
      setDeletingId(templateId)
      setRoutinesError(null)
      const result = await deleteRoutineTask(forHome, templateId)
      if (!isCurrentHome(forHome)) {
        if (!result.ok) console.warn(`[own tasks] could not delete task ${templateId} (home ${forHome}), answered after a switch:`, result.error)
        return
      }
      setDeletingId(null)
      if (!result.ok) {
        console.warn(`[own tasks] could not delete task ${templateId} (home ${forHome}):`, result.error)
        setRoutinesError("Couldn't delete that task. Check your connection and try again.")
        return
      }
      setRoutines((prev) => prev.filter((r) => r.task_template_id !== templateId))
    },
    [homeId, isCurrentHome]
  )

  const field = "min-h-11 w-full rounded-xl px-3.5 text-[0.9375rem] leading-[1.33]"
  const fieldStyle = { background: SURFACE, border: `1px solid ${LINE}`, color: INK }
  const label = "text-[0.8125rem] font-semibold leading-[1.38]"

  return (
    <div className="flex flex-col gap-7" data-testid="own-tasks">
      <form
        className="flex flex-col gap-3"
        aria-label="Add your own task"
        onSubmit={(e) => { e.preventDefault(); void handleAdd() }}
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Task name"
          aria-label="Task name"
          maxLength={120}
          className={field}
          style={fieldStyle}
        />
        <div className="grid grid-cols-2 gap-3 larger-text:grid-cols-1">
          <label className="flex flex-col gap-1">
            <span className={label} style={{ color: SUB }}>How often</span>
            <select
              value={newSchedule}
              onChange={(e) => setNewSchedule(scheduleOf(e.target.value))}
              className={field}
              style={fieldStyle}
            >
              {SCHEDULE_OPTIONS.map((opt) => <option key={opt} value={opt}>{cadenceLabel(opt)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={label} style={{ color: SUB }}>Minutes</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={newMinutes}
              onChange={(e) => setNewMinutes(e.target.value)}
              placeholder="Optional"
              className={field}
              style={fieldStyle}
            />
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <span id="own-task-shows-in" className={label} style={{ color: SUB }}>Shows in</span>
          <div role="radiogroup" aria-labelledby="own-task-shows-in" className="flex flex-wrap gap-2">
            {SHOWS_IN.map((o) => {
              const on = showsIn === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setShowsIn(o.value)}
                  className="min-h-11 rounded-full px-4 text-[0.9375rem] font-semibold leading-[1.33]"
                  style={{ background: on ? "var(--hh-teal-wash)" : "transparent", color: on ? TEAL : SUB, border: `1px solid ${on ? TEAL : LINE}` }}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
        <button
          type="submit"
          disabled={!newTitle.trim() || adding}
          className="mt-1 min-h-11 w-full rounded-2xl text-[0.9375rem] font-bold leading-[1.33]"
          style={{ background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)", opacity: !newTitle.trim() || adding ? 0.6 : 1 }}
        >
          {adding ? "Adding…" : "Add task"}
        </button>
        {routinesError && <InlineError>{routinesError}</InlineError>}
        {added && (
          <div role="status" className="text-[0.8125rem] leading-[1.38]" style={{ color: SUB }}>
            Added <b style={{ color: INK }}>{added}</b> to your Tasks.
          </div>
        )}
      </form>

      {/* Shown once there is something to say: a read under way, a read that
          failed (never drawn as an empty list), or tasks. */}
      {(loading || routinesLoadFailed || routines.length > 0) && (
        <ListSection label="Already added" testId="own-tasks-list">
          {loading ? (
            <p className="pl-0.5 text-[0.875rem] leading-[1.4]" style={{ color: SUB }}>Loading…</p>
          ) : (
            <>
              {routinesLoadFailed && (
                <InlineError onRetry={() => void loadRoutines()}>
                  Couldn&apos;t load your own tasks.
                </InlineError>
              )}
              {routines.length > 0 && (
                <ListCard>
                  {routines.map((r, i) => (
                    <div
                      key={r.task_template_id}
                      className="flex min-h-[60px] items-center gap-3 px-3.5 py-2"
                      style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[1.0625rem] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ color: INK }}>{r.title}</span>
                        <span className="mt-0.5 block text-[0.8125rem] leading-[1.38]" style={{ color: SUB }}>{cadenceLabel(r.schedule_type)}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={deletingId === r.task_template_id}
                        onClick={() => void handleDelete(r.task_template_id)}
                        aria-label={`Delete ${r.title}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </ListCard>
              )}
            </>
          )}
        </ListSection>
      )}
    </div>
  )
}
