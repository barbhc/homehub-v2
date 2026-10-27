import { useState } from "react"
import { GripVerticalIcon, PlusIcon, XIcon } from "lucide-react"
import { updateTaskContent, rescheduleTaskInstance, type TaskDetail } from "@/modules/care"
import { classifyTaskDetail, stepsAllowedFor } from "@/lib/taskActor"
import { BottomSheet, SheetGrabber } from "@/components/ui/BottomSheet"
import { useSheetDirty } from "@/components/ui/bottomSheetDirty"

/**
 * Edit a task: its name, when it's next due, and its steps.
 *
 * The principle this serves is the product's own — Homehub proposes, the
 * homeowner decides. Everything here was written by the parser from a manual,
 * and until now the owner could accept it or complain about it but not simply
 * FIX it. Disagreeing is supposed to be one tap away.
 *
 * Two scopes, kept distinct because conflating them would be a nasty surprise:
 *   · Name and steps belong to the TEMPLATE — change them once, they stay
 *     changed for every future occurrence.
 *   · The date belongs to THIS OCCURRENCE. Moving one filter change a week
 *     later must not quietly redefine the cadence forever; that's a bigger
 *     decision and deserves its own deliberate act.
 * The sheet says which is which rather than expecting anyone to infer it.
 */
export function TaskEditSheet({
  open,
  homeId,
  detail,
  onClose,
  onSaved,
}: {
  open: boolean
  homeId: string
  detail: TaskDetail
  onClose: () => void
  onSaved: () => void
}) {
  // The shared bottom sheet (phase 2). Above the tab bar ("raised": the nav in
  // AppLayout is `fixed bottom-0 z-50`; rendered at z-50 earlier in the DOM it
  // painted over Save and Cancel), and at `lg` the floating side panel it has
  // always been. The form is a child so each open starts from `detail` and
  // keeps its text while the sheet animates out.
  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      label="Edit task"
      layer="raised"
      grabber="none"
      desktopPanel
      testId="task-edit-sheet"
      className="flex max-h-[88vh] flex-col rounded-t-[20px] shadow-[0_-8px_30px_rgba(0,0,0,0.18)] lg:inset-x-auto lg:right-6 lg:top-6 lg:bottom-6 lg:w-[440px] lg:rounded-[20px]"
      style={{ background: "var(--hh-surface)" }}
    >
      <TaskEditForm homeId={homeId} detail={detail} onClose={onClose} onSaved={onSaved} />
    </BottomSheet>
  )
}

function TaskEditForm({
  homeId,
  detail,
  onClose,
  onSaved,
}: {
  homeId: string
  detail: TaskDetail
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(detail.title)
  const [dueDate, setDueDate] = useState(detail.dueDate)
  const [steps, setSteps] = useState<string[]>(detail.steps ?? [])
  const stepsEditable = stepsAllowedFor(classifyTaskDetail(detail))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleChanged = title.trim() !== detail.title
  const dateChanged = dueDate !== detail.dueDate
  const stepsChanged = JSON.stringify(steps.map((s) => s.trim()).filter(Boolean)) !== JSON.stringify(detail.steps ?? [])
  const dirty = titleChanged || dateChanged || stepsChanged
  // A drag, scrim tap or Escape asks before throwing these edits away.
  useSheetDirty(dirty)

  const setStep = (i: number, v: string) => setSteps((s) => s.map((x, n) => (n === i ? v : x)))
  const removeStep = (i: number) => setSteps((s) => s.filter((_, n) => n !== i))
  const addStep = () => setSteps((s) => [...s, ""])

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)

    // Content and date are separate writes against separate documents. Run the
    // content edit first and STOP on failure rather than pressing on: a partial
    // save that reports success is how "I fixed it" becomes "it didn't take".
    if (titleChanged || stepsChanged) {
      const res = await updateTaskContent(homeId, detail.taskTemplateId, {
        ...(titleChanged ? { title } : {}),
        ...(stepsChanged ? { steps } : {}),
      })
      if (res.error) {
        setError(res.error.message)
        setSaving(false)
        return
      }
    }
    if (dateChanged) {
      const res = await rescheduleTaskInstance(homeId, detail.taskInstanceId, dueDate)
      if (res.error) {
        setError(res.error.message)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    onSaved()
  }

  const field = "w-full rounded-xl border px-3 py-2.5 text-[0.9375rem] outline-none focus:border-[var(--hh-teal)]"
  const fieldStyle = { borderColor: "var(--hh-line2)", background: "var(--hh-bg)", color: "var(--hh-ink)" }
  const label = "mb-1.5 block text-[0.6875rem] font-bold uppercase tracking-[0.5px]"

  // Only the fields scroll: the grabber and header stay put, so the sheet can
  // always be dragged and closed from its top.
  return (
    <>
      <div data-sheet-drag="" className="shrink-0 px-5 pt-4">
        <SheetGrabber className="mb-4 lg:hidden" />

        <div className="mb-4 flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-[1.25rem] font-extrabold tracking-[-0.4px]" style={{ color: "var(--hh-ink)" }}>
            Edit task
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="hit-44 rounded-full p-1.5" style={{ background: "var(--hh-bg)" }}>
            <XIcon className="size-[18px]" style={{ color: "var(--hh-sub)" }} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-4">
          <div>
            <span className={label} style={{ color: "var(--hh-sub)" }}>Name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={field}
              style={fieldStyle}
              placeholder="What is this task called?"
            />
            <p className="mt-1.5 text-[0.75rem]" style={{ color: "var(--hh-faint)" }}>
              Applies to this task everywhere, now and in future.
            </p>
          </div>

          <div>
            <span className={label} style={{ color: "var(--hh-sub)" }}>Next due</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={field}
              style={fieldStyle}
            />
            <p className="mt-1.5 text-[0.75rem]" style={{ color: "var(--hh-faint)" }}>
              Moves this one occurrence — the repeat schedule stays as it is.
            </p>
          </div>

          {/* Hazardous work has no DIY steps to show, so none to edit either —
              the same decision the task page makes (StepsOrProNotice). */}
          {stepsEditable && <div>
            <span className={label} style={{ color: "var(--hh-sub)" }}>Steps</span>
            <div className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <GripVerticalIcon className="mt-3 size-4 shrink-0" style={{ color: "var(--hh-faint)" }} />
                  <textarea
                    value={s}
                    onChange={(e) => setStep(i, e.target.value)}
                    rows={Math.max(1, Math.ceil(s.length / 44))}
                    className={`${field} resize-none`}
                    style={fieldStyle}
                    placeholder={`Step ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    aria-label={`Remove step ${i + 1}`}
                    className="mt-1.5 shrink-0 rounded-full p-1.5"
                    style={{ background: "var(--hh-bg)" }}
                  >
                    <XIcon className="size-4" style={{ color: "var(--hh-sub)" }} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addStep}
                className="inline-flex items-center gap-1.5 self-start rounded-xl border border-dashed px-3 py-2 text-[0.8125rem] font-bold"
                style={{ borderColor: "var(--hh-line2)", color: "var(--hh-teal)" }}
              >
                <PlusIcon className="size-4" /> Add a step
              </button>
            </div>
            {steps.length === 0 && (
              <p className="mt-1.5 text-[0.75rem]" style={{ color: "var(--hh-faint)" }}>
                No steps yet — add your own, in your words.
              </p>
            )}
          </div>}

          {error && (
            <p className="text-[0.8125rem] font-semibold" style={{ color: "var(--hh-clay)" }}>{error}</p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="hh-press flex-1 rounded-xl py-3 text-[0.9375rem] font-bold text-white disabled:opacity-40"
              style={{ background: "var(--hh-teal-fill)" }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="hh-press rounded-xl border px-4 py-3 text-[0.9375rem] font-semibold"
              style={{ borderColor: "var(--hh-line2)", color: "var(--hh-sub)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
