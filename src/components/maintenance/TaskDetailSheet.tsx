import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { PencilIcon } from "lucide-react"

import { doc, getDoc } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { updateTaskNotes } from "@/modules/care"
import type { ScheduleType, PriorityTier } from "@/integrations/types"
import type { MaintenanceTaskFull } from "@/lib/dashboard"
import { TierBadge } from "@/components/tasks/TierBadge"
import { TaskEditPopover } from "@/components/care/TaskEditPopover"
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

interface TaskDetailSheetProps {
  task: MaintenanceTaskFull | null
  homeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  startEdit?: boolean
  onUpdated: () => void
}

function priorityToTier(priority: MaintenanceTaskFull["priority"]): PriorityTier {
  if (priority === "critical") return "essential"
  if (priority === "high") return "recommended"
  return "optional"
}

export function TaskDetailSheet({
  task,
  homeId,
  open,
  onOpenChange,
  startEdit = false,
  onUpdated,
}: TaskDetailSheetProps) {
  const [notesValue, setNotesValue] = useState(task?.notes ?? "")
  const [savedNotes, setSavedNotes] = useState(task?.notes ?? "")
  const [showSaved, setShowSaved] = useState(false)

  const [editPopoverOpen, setEditPopoverOpen] = useState(false)
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null)
  const [currentSchedule, setCurrentSchedule] = useState<{
    scheduleType: ScheduleType
    intervalDays?: number
  } | null>(null)

  const taskId = task?.task_template_id
  const taskNotes = task?.notes

  /* eslint-disable react-hooks/set-state-in-effect -- resetting local state when task changes */
  useEffect(() => {
    if (!taskId) return
    setNotesValue(taskNotes ?? "")
    setSavedNotes(taskNotes ?? "")
    setEstimatedMinutes(null)
    setCurrentSchedule(null)
    setEditPopoverOpen(startEdit)
  }, [taskId, taskNotes, startEdit])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open || !taskId) return
    let cancelled = false

    // The schedule is inlined on the template doc (firestore-model.md §1) —
    // v1's schedule_rule join collapses to fields on one get().
    getDoc(doc(db, `homes/${homeId}/taskTemplates/${taskId}`))
      .then((snap) => {
        if (cancelled || !snap.exists()) return
        setEstimatedMinutes((snap.get("estimatedMinutes") as number | null) ?? null)
        const sched = snap.get("schedule") as { scheduleType?: string; intervalDays?: number | null } | null
        if (sched?.scheduleType) {
          setCurrentSchedule({
            scheduleType: sched.scheduleType as ScheduleType,
            intervalDays: sched.intervalDays ?? undefined,
          })
        } else {
          setCurrentSchedule(null)
        }
      })
      .catch(() => { /* non-fatal — the sheet renders without schedule info */ })

    return () => { cancelled = true }
  }, [open, taskId, homeId])

  const dueLabel = useMemo(() => {
    if (!task || !task.next_due_date) return "No due date"
    const d = new Date(task.next_due_date + "T00:00:00")
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  }, [task])

  const handleNotesSave = async () => {
    if (!task || notesValue === savedNotes) return
    const trimmed = notesValue.trim() || null
    await updateTaskNotes(homeId, task.task_template_id, trimmed)
    setSavedNotes(notesValue)
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 1500)
    onUpdated()
  }

  const currentTier = task ? priorityToTier(task.priority) : "optional"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-hidden"
      >
        {task && (
          <>
            <div className="px-6 pt-6 pb-5 border-b border-border">
              {task.itemName && task.item_id && (
                <Link
                  to={`/items/${task.item_id}`}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-primary hover:underline mb-3"
                  onClick={() => onOpenChange(false)}
                >
                  ↗ {task.itemName}
                </Link>
              )}
              <h2
                className="font-display text-2xl font-semibold leading-snug text-foreground mb-3"
              >
                {task?.title ?? "Task"}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <TierBadge tier={task.priority} />
                <span className="text-sm text-muted-foreground">{dueLabel}</span>
                {estimatedMinutes && (
                  <span className="text-xs bg-muted text-muted-foreground rounded px-2 py-0.5">
                    ~{estimatedMinutes} min
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
              <button
                type="button"
                onClick={() => setEditPopoverOpen(true)}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground border border-border rounded-md px-3 py-1.5 hover:border-primary hover:text-primary transition-colors w-fit"
              >
                <PencilIcon className="size-3.5" />
                Edit schedule & tier
              </button>

              {(currentSchedule || estimatedMinutes) && (
                <div className="grid grid-cols-3 gap-px bg-border rounded-lg overflow-hidden text-center">
                  <div className="bg-muted/50 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
                      Cadence
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {currentSchedule
                        ? currentSchedule.scheduleType
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())
                        : "—"}
                    </div>
                  </div>
                  <div className="bg-muted/50 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
                      Duration
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {estimatedMinutes ? `~${estimatedMinutes} min` : "—"}
                    </div>
                  </div>
                  <div className="bg-muted/50 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
                      Next due
                    </div>
                    <div className="text-sm font-medium text-foreground">{dueLabel}</div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex flex-col gap-2 flex-1">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                  Notes
                </div>
                <Textarea
                  placeholder="Add notes about this task — what products to use, things to watch out for…"
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  onBlur={handleNotesSave}
                  className="resize-none min-h-[140px] bg-muted/40 border-border focus:border-primary transition-colors text-sm leading-relaxed"
                />
                {showSaved && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    ✓ Saved
                  </p>
                )}
              </div>

              <TaskEditPopover
                open={editPopoverOpen}
                onOpenChange={setEditPopoverOpen}
                homeId={homeId}
                taskTemplateId={task.task_template_id}
                currentTier={currentTier}
                currentSchedule={currentSchedule ?? { scheduleType: "as_needed" as ScheduleType }}
                currentEstimatedMinutes={estimatedMinutes}
                onUpdated={() => {
                  setEditPopoverOpen(false)
                  onUpdated()
                }}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

