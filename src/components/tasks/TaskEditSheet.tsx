import { useState } from "react"
import { createPortal } from "react-dom"
import { GripVerticalIcon, PlusIcon, XIcon } from "lucide-react"
import { updateTaskContent, rescheduleTaskInstance, type TaskDetail } from "@/modules/care"

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleChanged = title.trim() !== detail.title
  const dateChanged = dueDate !== detail.dueDate
  const stepsChanged = JSON.stringify(steps.map((s) => s.trim()).filter(Boolean)) !== JSON.stringify(detail.steps ?? [])
  const dirty = titleChanged || dateChanged || stepsChanged

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

  const field = "w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none focus:border-[var(--hh-teal)]"
  const fieldStyle = { borderColor: "var(--hh-line2)", background: "var(--hh-bg)", color: "var(--hh-ink)" }
  const label = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.5px]"

  // Portalled to <body>, and explicitly ABOVE the tab bar.
  //
  // The bottom nav in AppLayout is `fixed bottom-0 z-50`. Rendered inline, this
  // sheet was also z-50 and came EARLIER in the DOM, so the nav painted over
  // it: Save and Cancel sat behind the tab bar, unreachable, on a panel that
  // had already scrolled as far as it could. Portalling also escapes any
  // transform/filter ancestor, which would otherwise trap `fixed` in a local
  // stacking context. Any future sheet outside the Radix primitives needs both
  // halves of this — the portal AND a z-index above the nav's.
  return createPortal(
    <>
      <button
        type="button"
        aria-label="Cancel editing"
        onClick={onClose}
        className="fixed inset-0 z-[60]"
        style={{ background: "rgba(8,12,11,0.4)" }}
      />
      <div
        role="dialog"
        aria-label="Edit task"
        className="fixed inset-x-0 bottom-0 z-[70] max-h-[88vh] overflow-y-auto rounded-t-[20px] px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_30px_rgba(0,0,0,0.18)] lg:inset-x-auto lg:right-6 lg:top-6 lg:bottom-6 lg:w-[440px] lg:rounded-[20px]"
        style={{ background: "var(--hh-surface)" }}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full lg:hidden" style={{ background: "rgba(15,23,42,0.15)" }} />

        <div className="mb-4 flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-[20px] font-extrabold tracking-[-0.4px]" style={{ color: "var(--hh-ink)" }}>
            Edit task
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5" style={{ background: "var(--hh-bg)" }}>
            <XIcon className="size-[18px]" style={{ color: "var(--hh-sub)" }} />
          </button>
        </div>

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
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--hh-faint)" }}>
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
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--hh-faint)" }}>
              Moves this one occurrence — the repeat schedule stays as it is.
            </p>
          </div>

          <div>
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
                className="inline-flex items-center gap-1.5 self-start rounded-xl border border-dashed px-3 py-2 text-[13px] font-bold"
                style={{ borderColor: "var(--hh-line2)", color: "var(--hh-teal)" }}
              >
                <PlusIcon className="size-4" /> Add a step
              </button>
            </div>
            {steps.length === 0 && (
              <p className="mt-1.5 text-[12px]" style={{ color: "var(--hh-faint)" }}>
                No steps yet — add your own, in your words.
              </p>
            )}
          </div>

          {error && (
            <p className="text-[13px] font-semibold" style={{ color: "var(--hh-clay)" }}>{error}</p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="flex-1 rounded-xl py-3 text-[15px] font-bold text-white disabled:opacity-40"
              style={{ background: "var(--hh-teal)" }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-4 py-3 text-[15px] font-semibold"
              style={{ borderColor: "var(--hh-line2)", color: "var(--hh-sub)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
