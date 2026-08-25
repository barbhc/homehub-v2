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
import { useLocation, useNavigate } from "react-router-dom"
import { Loader2Icon, CheckIcon, XIcon } from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { useParseTray } from "@/hooks/useParseTray"
import { SCAN_KEEPS_GOING_SHORT, scanProgressLabel } from "@/lib/scanCopy"

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
  const location = useLocation()

  // HH-118. The pill sat over the item page saying "1 manual parsing" directly
  // beneath a card already saying "Scanning your manual - 24 pages", and in the
  // owner's screenshot it covered the Track-purchase card. A tray that repeats
  // the page it floats over is noise; it exists to answer "what is scanning
  // right now" when you are somewhere ELSE.
  //
  // So it stands down for whatever this page is already showing.
  const onItem = /^\/items\/([^/]+)/.exec(location.pathname)?.[1] ?? null
  const parsing = tray.parsing.filter((e) => e.itemUnitId !== onItem)
  const ready = tray.ready.filter((e) => e.itemUnitId !== onItem)

  const total = parsing.length + ready.length
  if (total === 0) return null

  const line = [
    parsing.length ? `${parsing.length} item${parsing.length === 1 ? "" : "s"} scanning` : null,
    ready.length ? `${ready.length} ready to review` : null,
  ].filter(Boolean).join(" · ")

  return (
    // Above the mobile tab bar (z-50); below dialogs. Desktop gets it bottom-right.
    <div className="fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}>
      {open && (
        <div className="w-full max-w-[380px] rounded-2xl border p-3 shadow-lg"
          style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)" }}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-bold" style={{ color: "var(--hh-ink)" }}>
              {parsing.length ? `${parsing.length} item${parsing.length === 1 ? "" : "s"} scanning` : "Ready to review"}
            </span>
            <button type="button" aria-label="Collapse" onClick={() => setOpen(false)} className="rounded p-0.5" style={{ color: "var(--hh-sub)" }}>
              <XIcon className="size-3.5" />
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {parsing.map((e) => (
              <li key={e.manualId} className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
                <Loader2Icon className="size-3.5 shrink-0 animate-spin" style={{ color: "var(--hh-teal)" }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--hh-ink)" }}>{e.title}</span>
                {/* What the owner asked the tray to add: how far along, per item.
                    Honest — "starting…" until we know the page count. */}
                <span className="shrink-0 tabular-nums">
                  {e.pages != null ? scanProgressLabel(null, e.pages) : (STAGE_WORD[e.stage] ?? "working")}
                </span>
              </li>
            ))}
            {ready.map((e) => (
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
          {parsing.length > 0 && (
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--hh-sub)" }}>{SCAN_KEEPS_GOING_SHORT}</p>
          )}
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
