/**
 * The in-progress window itself (HH-87). A slim pill above the tab bar
 * whenever a parse is running or a finished one is waiting on review — so
 * "ready to review" becomes a place you GO, and the review sheet stops
 * appearing out of nowhere. Self-draining: committed reviews leave the tray,
 * and the pill unmounts when both lists are empty.
 *
 * HH-48's auto-open is untouched — that covers the person already standing on
 * the item watching the parse finish; this covers everywhere else.
 */
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2Icon, CheckIcon, XIcon } from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { useParseTray } from "@/hooks/useParseTray"

const STAGE_WORD: Record<string, string> = {
  queued: "waiting for a slot",
  started: "reading",
  pdf_fetched: "reading",
  claude_call: "extracting tasks",
  claude_responded: "extracting tasks",
  committing: "saving",
}

export function ParseTrayPill() {
  const { home } = useCurrentHome()
  const tray = useParseTray(home?.home_id ?? null)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const total = tray.parsing.length + tray.ready.length
  if (total === 0) return null

  const line = [
    tray.parsing.length ? `${tray.parsing.length} manual${tray.parsing.length === 1 ? "" : "s"} parsing` : null,
    tray.ready.length ? `${tray.ready.length} ready to review` : null,
  ].filter(Boolean).join(" · ")

  return (
    // Above the mobile tab bar (z-50); below dialogs. Desktop gets it bottom-right.
    <div className="fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}>
      {open && (
        <div className="w-full max-w-[380px] rounded-2xl border p-3 shadow-lg"
          style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)" }}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-bold" style={{ color: "var(--hh-ink)" }}>Manuals in progress</span>
            <button type="button" aria-label="Collapse" onClick={() => setOpen(false)} className="rounded p-0.5" style={{ color: "var(--hh-sub)" }}>
              <XIcon className="size-3.5" />
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {tray.parsing.map((e) => (
              <li key={e.manualId} className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
                <Loader2Icon className="size-3.5 shrink-0 animate-spin" style={{ color: "var(--hh-teal)" }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--hh-ink)" }}>{e.title}</span>
                <span className="shrink-0">{STAGE_WORD[e.stage] ?? "working"}</span>
              </li>
            ))}
            {tray.ready.map((e) => (
              <li key={e.manualId} className="flex items-center gap-2 text-[12.5px]">
                <CheckIcon className="size-3.5 shrink-0" style={{ color: "var(--hh-teal)" }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--hh-ink)" }}>{e.title}</span>
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate(`/inventory/${e.itemUnitId}`) }}
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                  style={{ background: "var(--hh-teal-wash)", color: "var(--hh-teal)" }}
                >
                  Review
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-semibold shadow-lg"
        style={{ background: "var(--hh-ink)", color: "var(--hh-bg)" }}
      >
        {tray.parsing.length > 0
          ? <Loader2Icon className="size-3.5 animate-spin" style={{ color: "var(--hh-teal)" }} />
          : <CheckIcon className="size-3.5" style={{ color: "var(--hh-teal)" }} />}
        {line}
      </button>
    </div>
  )
}
