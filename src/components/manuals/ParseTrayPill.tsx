/**
 * The one reading indicator (HH-87, HH-161). A slim pill above the tab bar
 * whenever a manual is being read or a finished read is waiting for its review
 * — on EVERY page, including the item whose manual it is. "Ready to review"
 * becomes a place you GO, and the review stops appearing out of nowhere.
 * Self-draining: saved reviews leave the tray, and the pill unmounts when both
 * lists are empty.
 *
 * HH-48's auto-open is untouched — that covers the person already standing on
 * the item watching the read finish; this covers everywhere else.
 */
import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Loader2Icon, CheckIcon, ClockIcon, XIcon } from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { useParseTray, type TrayEntry } from "@/hooks/useParseTray"
import { SCAN_KEEPS_GOING_SHORT, scanProgressLabel } from "@/lib/scanCopy"
import { requestReview } from "@/lib/reviewRequest"

const STAGE_WORD: Record<string, string> = {
  queued: "waiting to start",
  started: "reading",
  pdf_fetched: "reading",
  claude_call: "pulling out care steps",
  claude_responded: "pulling out care steps",
  committing: "saving",
  // HH-132. This map had no entry for awaiting_capacity and the lookup fell
  // through to "working", so the tray told the owner a manual was being read
  // while nothing was running at all. Parked by the ceiling, it is queued.
  awaiting_capacity: "queued",
}

/** Parked by the ceiling: saved, not running, and started automatically. */
const isQueued = (stage: string) => stage === "awaiting_capacity"

/** The item page's id, when that is the page on screen. */
const itemOnScreen = (pathname: string) => /^\/items\/([^/]+)/.exec(pathname)?.[1] ?? null

export function ParseTrayPill() {
  const { home } = useCurrentHome()
  const tray = useParseTray(home?.home_id ?? null)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // HH-161 SUPERSEDES HH-118. The pill used to stand down on the item page
  // already showing that read, because the page carried its own copy — a band
  // above the page. The owner's agreed design was always ONE indicator, at the
  // bottom of every page; the page's band is gone (the read now lives in the
  // item's Upkeep card, where the tasks will land), so the pill no longer has
  // anything to defer to. HH-118's actual complaint — the pill covering the
  // page — is answered by the clearance below, not by hiding the pill.
  const { parsing, ready } = tray

  // Counted apart, because "2 reading" over one running read and one parked
  // file is a sentence the app cannot back up.
  const queued = parsing.filter((e) => isQueued(e.stage))
  const running = parsing.filter((e) => !isQueued(e.stage))
  const total = parsing.length + ready.length
  if (total === 0) return null

  const line = [
    running.length ? `${running.length} reading` : null,
    queued.length ? `${queued.length} queued` : null,
    ready.length ? `${ready.length} ready to review` : null,
  ].filter(Boolean).join(" · ")

  // Review opens the review. On that item's own page it opens IN PLACE — the
  // page's hand-off card takes the request, no navigation (S2.3). Anywhere
  // else the request waits for the item page to take it on arrival.
  const review = (e: TrayEntry) => {
    setOpen(false)
    requestReview(e.manualId)
    if (itemOnScreen(location.pathname) !== e.itemUnitId) navigate(`/items/${e.itemUnitId}`)
  }

  return (
    <>
      {/* HH-118's real complaint: the pill sat over the page and covered its
          last card. It floats above the tab bar, so while it shows, the page
          gets this much more room to scroll — nothing ends underneath it. */}
      <div aria-hidden="true" data-testid="tray-clearance" className="h-16 shrink-0 md:h-28" />
      {/* Above the mobile tab bar (z-50); below dialogs. Desktop gets it bottom-right. */}
      <div className="fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}>
        {open && (
          <div className="w-full max-w-[380px] rounded-2xl border p-3 shadow-lg"
            style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)" }}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-bold" style={{ color: "var(--hh-ink)" }}>
                {running.length ? `${running.length} reading` : queued.length ? `${queued.length} queued` : "Ready to review"}
              </span>
              <button type="button" aria-label="Collapse" onClick={() => setOpen(false)} className="rounded p-0.5" style={{ color: "var(--hh-sub)" }}>
                <XIcon className="size-3.5" />
              </button>
            </div>
            <ul className="flex flex-col gap-1.5">
              {parsing.map((e) => (
                <li key={e.manualId} className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
                  {isQueued(e.stage)
                    ? <ClockIcon className="size-3.5 shrink-0" style={{ color: "var(--hh-teal)" }} />
                    : <Loader2Icon className="size-3.5 shrink-0 motion-safe:animate-spin" style={{ color: "var(--hh-teal)" }} />}
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--hh-ink)" }}>{e.title}</span>
                  {/* What the owner asked the tray to add: how far along, per
                      item. Honest — the worker's page count once it has one,
                      never a position it does not report. */}
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
                    onClick={() => review(e)}
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
          {/* Moves only while something is actually being read, and holds still
              under reduced motion (the mock's rule for the rail and the pill). */}
          {running.length > 0
            ? <Loader2Icon className="size-3.5 motion-safe:animate-spin" style={{ color: "var(--hh-teal)" }} />
            : ready.length > 0
              ? <CheckIcon className="size-3.5" style={{ color: "var(--hh-teal)" }} />
              : <ClockIcon className="size-3.5" style={{ color: "var(--hh-teal)" }} />}
          {line}
        </button>
      </div>
    </>
  )
}
