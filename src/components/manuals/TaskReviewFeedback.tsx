import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

/**
 * "These tasks don't look right" — the escape hatch at the bottom of the review.
 *
 * Getting task categorization right is the hardest problem in Homehub, and the
 * failure mode isn't a wrong guess — it's a wrong guess that costs the user forty
 * corrections. This gives them one place to say so, and gives us the signal to
 * fix it upstream instead of making the next person do the same forty.
 *
 * The important part is what it sends WITHOUT being asked: the corrections the
 * user already made on this screen. Someone silently moving six tasks out of
 * Essential is stronger evidence than any survey answer, and it costs them
 * nothing.
 */

/** One correction the user made, structured rather than a formatted string —
 *  titles contain colons and arrows, so parsing them back out was never safe. */
export interface ReviewEdit {
  title: string
  field: "tier" | "kind" | "schedule" | "skip"
  from: string
  to: string
}

export interface ReviewEditSummary {
  tier: number
  kind: number
  schedule: number
  skipped: number
  total: number
  /** The actual corrections — the corpus this whole loop exists to collect. */
  details: ReviewEdit[]
}

const REASONS: { id: string; label: string }[] = [
  { id: "too_many", label: "Too many tasks" },
  { id: "missing", label: "Missing tasks" },
  { id: "wrong_priority", label: "Wrong priorities" },
  { id: "wrong_category", label: "Wrong categories" },
  { id: "wrong_cadence", label: "Wrong timing" },
  { id: "wrong_product", label: "Not my model" },
]

export function TaskReviewFeedback({
  edits,
  onSubmit,
}: {
  edits: ReviewEditSummary
  onSubmit: (p: { reasons: string[]; note: string; edits: ReviewEditSummary; rescan: boolean }) => void
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState("")
  const [sent, setSent] = useState(false)

  const send = (rescan: boolean) => {
    onSubmit({ reasons: [...picked], note: note.trim(), edits, rescan })
    setOpen(false); setSent(true); setPicked(new Set()); setNote("")
  }

  const editBits = [
    edits.tier && `${edits.tier} priority change${edits.tier === 1 ? "" : "s"}`,
    edits.kind && `${edits.kind} recategorized`,
    edits.schedule && `${edits.schedule} schedule change${edits.schedule === 1 ? "" : "s"}`,
    edits.skipped && `${edits.skipped} skipped`,
  ].filter(Boolean) as string[]

  return (
    <>
      <div className="mt-6 pt-3.5 border-t border-border flex items-center gap-2">
        <div className="flex-1 text-[12px] text-muted-foreground">
          {sent ? "Thanks — that helps us fix it for everyone." : "These tasks don't look right?"}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-border bg-card px-3 py-2 text-[11.5px] font-semibold whitespace-nowrap"
        >
          {sent ? "Add more" : "Tell us what's off"}
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="p-4 pb-6">
          <SheetHeader className="p-0 mb-2.5">
            <SheetTitle className="text-[13px]">What doesn't look right?</SheetTitle>
          </SheetHeader>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={picked.has(r.id)}
                onClick={() =>
                  setPicked((prev) => {
                    const next = new Set(prev)
                    next.has(r.id) ? next.delete(r.id) : next.add(r.id)
                    return next
                  })
                }
                className={`rounded-full border px-2.5 py-2 text-[11.5px] font-semibold ${
                  picked.has(r.id)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything specific? (optional)"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[12.5px] resize-none"
          />

          {edits.total > 0 && (
            <div className="mt-2.5 rounded-xl bg-primary/10 px-3 py-2.5 text-[11px] text-muted-foreground">
              We'll include <b className="text-primary">the {edits.total} correction{edits.total === 1 ? "" : "s"} you already made</b>
              {editBits.length > 0 && <> ({editBits.join(" · ")})</>} — that's the most useful part.
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => send(true)}
              className="flex-1 rounded-xl border border-border py-2.5 text-[12.5px] font-bold text-muted-foreground"
            >
              Re-scan
            </button>
            <button
              type="button"
              onClick={() => send(false)}
              className="flex-[2] rounded-xl bg-primary py-2.5 text-[12.5px] font-bold text-primary-foreground"
            >
              Send feedback
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
