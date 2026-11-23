/**
 * Settings → Internal tools: beta switches, the manuals list with its bulk
 * rescan, startup diagnostics and the admin tools. Only for a person whose
 * prefs doc says `dev_tools: true` (design/settings-your-home.md); the page
 * that mounts this checks the flag. Each block moved from the one-page
 * Settings unchanged in behaviour.
 */
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertCircleIcon, CheckCircle2Icon, CircleDotIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"
import { InlineError, SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BootDiagnostics } from "@/components/settings/BootDiagnostics"
import { AdminToolsSection } from "@/components/settings/AdminToolsSection"
import { useAutoFindManuals } from "@/hooks/useAutoFindManuals"
import { useCurrentHome } from "@/modules/home"
import { isAwaitingReview } from "@/lib/manualReviewState"
import { getManualsByHome, deleteManualDocument, ingestReference } from "@/modules/knowledge"
import { isReferenceDoc, openPendingReview, rescanForReviewAndWait, rescanTargets, startRescanForReview } from "@/lib/manualRescan"
import { isCapacityRefusal } from "@/lib/scanCapacity"
import type { ManualDocument } from "@/integrations/types"

type ManualWithName = ManualDocument & { display_name: string }
/** `ready`: read, and waiting for its review on the item page — never saved from here.
 *  `queued`: refused for capacity and recorded to start itself (HH-124). */
type ManualStatus = "idle" | "scanning" | "ready" | "queued" | "error"
type ManualScanState = { status: ManualStatus; error?: string }

export function InternalPane() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  return (
    <div className="flex flex-col gap-6">
      <BetaFeatures />
      {homeId && <ManualsList homeId={homeId} />}
      {/* Real numbers from the real device — see BootDiagnostics for why. */}
      <BootDiagnostics />
      {homeId && <AdminToolsSection homeId={homeId} />}
    </div>
  )
}

function BetaFeatures() {
  const [autoFindManuals, setAutoFindManuals] = useAutoFindManuals()
  // Beta features — off by default. The automatic manual search is a work in
  // progress that can offer a near-miss model (a Core 300S manual for a Core
  // 300), and the wrong manual becomes a whole care plan for the wrong
  // appliance. Opt in knowingly or not at all.
  return (
    <SectionCard>
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold text-foreground mb-1">Beta features</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Still finding their feet. They never change anything without asking you first.
        </p>
        <div
          className="flex items-start justify-between gap-3 rounded-xl border p-3"
          style={{ borderColor: "var(--hh-line)" }}
        >
          <div className="min-w-0">
            <p className="text-[0.84375rem] font-semibold" style={{ color: "var(--hh-ink)" }}>
              Find manuals automatically
            </p>
            <p className="mt-0.5 text-[0.75rem]" style={{ color: "var(--hh-sub)" }}>
              Search as soon as the brand and model are known, instead of waiting to be asked.
              Results always need your confirmation before anything is attached.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoFindManuals}
            aria-label="Find manuals automatically"
            onClick={() => setAutoFindManuals(!autoFindManuals)}
            className="hit-44 relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors"
            // Off track: --hh-line2 was 1.3:1 against the card, so the switch's
            // off state was nearly invisible (WCAG 1.4.11 wants 3:1). Same
            // token as the supply switch.
            style={{ background: autoFindManuals ? "var(--hh-teal-fill)" : "var(--hh-toggle-off)" }}
          >
            <span
              className="absolute top-0.5 size-5 rounded-full bg-[var(--hh-on-fill)] transition-all"
              style={{ left: autoFindManuals ? "calc(100% - 22px)" : "2px" }}
            />
          </button>
        </div>
      </CardContent>
    </SectionCard>
  )
}

function ManualsList({ homeId }: { homeId: string }) {
  const navigate = useNavigate()
  const [manuals, setManuals] = useState<ManualWithName[]>([])
  const [manualStates, setManualStates] = useState<Record<string, ManualScanState>>({})
  const [rescanRunning, setRescanRunning] = useState(false)
  const [manualsLoaded, setManualsLoaded] = useState(false)
  const [manualsLoadFailed, setManualsLoadFailed] = useState(false)
  const [manualsAttempt, setManualsAttempt] = useState(0)

  // Load manuals list. A failed read says so — it used to render as
  // "0 manuals uploaded".
  useEffect(() => {
    if (!homeId) return
    let cancelled = false
    void getManualsByHome(homeId).then((res) => {
      if (cancelled) return
      if (res.error) {
        console.warn(`[settings] could not load manuals for home ${homeId}:`, res.error.message)
        setManualsLoadFailed(true)
      } else {
        setManuals(res.data ?? [])
        setManualsLoadFailed(false)
      }
      setManualsLoaded(true)
    })
    return () => { cancelled = true }
  }, [homeId, manualsAttempt])

  // "Rescan all": one manual at a time, each read left for its review on the
  // item page. It used to run in COMMIT mode and write every manual's tasks
  // into the home unreviewed — see lib/manualRescan.
  const runRescan = useCallback(async (targets: ManualWithName[]) => {
    if (!homeId || rescanRunning || targets.length === 0) return
    setRescanRunning(true)

    for (let i = 0; i < targets.length; i++) {
      const m = targets[i]
      setManualStates((prev) => ({ ...prev, [m.manual_id]: { status: "scanning" } }))
      const result = await rescanForReviewAndWait(homeId, m)
      setManualStates((prev) => ({
        ...prev,
        [m.manual_id]: result.ok
          ? { status: "ready" }
          : isCapacityRefusal(result.error)
            ? { status: "queued" }
            : { status: "error", error: result.error },
      }))
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 5000))
      }
    }

    setRescanRunning(false)
  }, [homeId, rescanRunning])

  // HH-154: a row that says "Not scanned" with no way to act on it is a dead
  // end — the owner had three of them. Every row can now be rescanned or
  // removed on its own.
  //
  // A row's Rescan hands off like the add wizard does: start a fresh read and
  // go to the item page, which watches it land and opens the review there.
  const handleRescanOne = useCallback(async (m: ManualWithName) => {
    if (!homeId || rescanRunning) return
    setManualStates((prev) => ({ ...prev, [m.manual_id]: { status: "scanning" } }))
    // A reference document is re-READ, never re-parsed for upkeep. Sending one
    // through the owner-manual parser would break the promise made when it was
    // attached ("won't generate upkeep") — see rescanTargets.
    if (isReferenceDoc(m)) {
      const res = await ingestReference(homeId, m.manual_id)
      setManualStates((prev) => ({
        ...prev,
        [m.manual_id]: res.error ? { status: "error", error: res.error.message } : { status: "idle" },
      }))
      return
    }
    const started = await startRescanForReview(homeId, m)
    if (started.ok) {
      navigate(started.reviewPath)
      return
    }
    setManualStates((prev) => ({
      ...prev,
      [m.manual_id]: started.queued ? { status: "queued" } : { status: "error", error: started.error },
    }))
  }, [homeId, rescanRunning, navigate])

  // Read and not saved: the review is waiting, so go to it — a new read would
  // throw the waiting one away.
  const handleOpenReview = useCallback((m: ManualWithName) => {
    navigate(openPendingReview(m))
  }, [navigate])
  const [removingManual, setRemovingManual] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)
  const handleRemoveManual = useCallback(async (m: ManualWithName) => {
    if (!homeId || removingManual) return
    setRemovingManual(m.manual_id)
    setManualError(null)
    const res = await deleteManualDocument(homeId, m.manual_id)
    setRemovingManual(null)
    if (res.error) { setManualError(`Could not remove ${m.display_name}: ${res.error.message}`); return }
    setManuals((prev) => prev.filter((x) => x.manual_id !== m.manual_id))
  }, [homeId, removingManual])

  const handleRescanAll = useCallback(() => {
    runRescan(rescanTargets(manuals))
  }, [manuals, runRescan])

  const handleRetryFailed = useCallback(() => {
    const failed = manuals.filter((m) => manualStates[m.manual_id]?.status === "error")
    runRescan(rescanTargets(failed))
  }, [manuals, manualStates, runRescan])

  /** What "Rescan All" leaves alone, named on the button so skipping is not
   *  silent. */
  const rescanSkipped = manuals.length - rescanTargets(manuals).length
  const failedCount = manuals.filter((m) => manualStates[m.manual_id]?.status === "error").length

  if (!manualsLoaded) return null
  return (
    <SectionCard>
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold text-foreground mb-1">
          Manuals
        </h2>
        {manualsLoadFailed ? (
          // Not "0 manuals uploaded" — that is a count of a list never read.
          <InlineError className="mb-4" onRetry={() => setManualsAttempt((n) => n + 1)}>
            Couldn&apos;t load your manuals.
          </InlineError>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">
            {manuals.length} manual{manuals.length !== 1 ? "s" : ""} uploaded.
            Rescan reads a manual again — nothing changes until you review it.
          </p>
        )}

        {manuals.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {manuals.map((m) => {
              const state = manualStates[m.manual_id]
              // HH-141: "Not scanned" is false for a manual we HAVE read
              // and never saved — the same lie the item page was telling
              // one screen over. `isAwaitingReview` is the shared answer.
              const awaitingReview = isAwaitingReview(m)
              const parsedDate = m.parsed_at
                ? new Date(m.parsed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : null
              return (
                <div
                  key={m.manual_id}
                  className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0 text-sm larger-text:flex-wrap"
                >
                  {/* Status icon */}
                  {state?.status === "scanning" ? (
                    <Loader2Icon className="size-3.5 animate-spin text-primary shrink-0" />
                  ) : state?.status === "ready" ? (
                    <CheckCircle2Icon className="size-3.5 shrink-0" style={{ color: "var(--hh-teal)" }} />
                  ) : state?.status === "queued" ? (
                    <CircleDotIcon className="size-3.5 text-muted-foreground shrink-0" />
                  ) : state?.status === "error" ? (
                    <AlertCircleIcon className="size-3.5 text-destructive shrink-0" />
                  ) : parsedDate ? (
                    <CircleDotIcon className="size-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    // One colour per status: this dot and its label were
                    // amber and clay respectively after the contrast fix.
                    <CircleDotIcon className="size-3.5 shrink-0" style={{ color: "var(--hh-clay)" }} />
                  )}

                  {/* Name */}
                  <span className="font-medium flex-1 min-w-0 truncate larger-text:min-w-[60%] larger-text:whitespace-normal">{m.display_name}</span>

                  {/* Status text */}
                  {state?.status === "scanning" ? (
                    <span className="text-xs text-muted-foreground shrink-0">Scanning…</span>
                  ) : state?.status === "ready" ? (
                    // Read, not saved: what it found waits for the review.
                    <span className="text-xs shrink-0" style={{ color: "var(--hh-teal)" }}>Ready to review</span>
                  ) : state?.status === "queued" ? (
                    // HH-124: a ceiling is not a failure — it starts itself.
                    <span className="text-xs text-muted-foreground shrink-0">Queued</span>
                  ) : state?.status === "error" ? (
                    <span className="text-xs text-destructive shrink-0 max-w-[200px] truncate" title={state.error}>
                      {state.error}
                    </span>
                  ) : parsedDate ? (
                    <span className="text-xs text-muted-foreground shrink-0">
                      Scanned {parsedDate}
                    </span>
                  ) : (
                    // Clay, not amber-600: at 12px on the settings surface
                    // amber-600 lands at 3.08:1 against a 4.5:1 floor, and
                    // this is the ONE line telling someone the state of
                    // their manual. It stayed invisible to the a11y suite
                    // until the seed gained an unsaved manual (HH-140).
                    <span className="text-xs shrink-0" style={{ color: "var(--hh-clay)" }}>
                      {awaitingReview ? "Read — not saved" : "Not scanned"}
                    </span>
                  )}

                  {/* HH-154: per-row actions. Without these a stuck manual
                      was permanent — "Rescan All" was the only lever and it
                      re-ran every manual to fix one. */}
                  {/* Rows sit on a 39px pitch: each action takes 44px across
                      but only its own row's band (38px) down, so a tap is
                      never shared with the row above or below. */}
                  <span className="flex shrink-0 items-center gap-2.5 text-xs font-bold" style={{ color: "var(--hh-teal)" }}>
                    {/* A read waiting to be saved offers its review, not
                        another read; everything else can be read again —
                        and either way it ends in the item page's review,
                        never in a save from here. */}
                    {state?.status === "ready" || (!state && awaitingReview) ? (
                      <button type="button" onClick={() => handleOpenReview(m)} className="hit-44 [--hit-h:38px]" data-hit-dense="manual rows sit on a 39px pitch; each action takes its row's band">
                        Review
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleRescanOne(m)}
                        disabled={rescanRunning || state?.status === "scanning"}
                        className="hit-44 [--hit-h:38px] disabled:opacity-40"
                        data-hit-dense="manual rows sit on a 39px pitch; each action takes its row's band"
                      >
                        {/* A reference doc is read for answers, not for
                            upkeep, so it does not say "Rescan" — the word
                            this screen uses for a task read. */}
                        {isReferenceDoc(m) ? "Re-read" : "Rescan"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleRemoveManual(m)}
                      disabled={removingManual === m.manual_id}
                      className="hit-44 [--hit-h:38px] disabled:opacity-40"
                      data-hit-dense="manual rows sit on a 39px pitch; each action takes its row's band"
                      style={{ color: "var(--hh-clay)" }}
                    >
                      {removingManual === m.manual_id ? "Removing…" : "Remove"}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {manualError && (
          <div role="alert" className="mb-3 text-xs font-medium" style={{ color: "var(--hh-clay)" }}>
            {manualError}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={rescanRunning || manuals.length === 0}
            onClick={handleRescanAll}
          >
            <RefreshCwIcon className="size-4 mr-1.5" />
            {rescanRunning ? "Scanning…" : "Rescan all"}
          </Button>
          {rescanSkipped > 0 && !rescanRunning && (
            <p className="self-center text-xs text-muted-foreground">
              Leaves {rescanSkipped} alone — reviews waiting, and reference docs.
            </p>
          )}
          {failedCount > 0 && !rescanRunning && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryFailed}
            >
              Retry {failedCount} Failed
            </Button>
          )}
        </div>
      </CardContent>
    </SectionCard>
  )
}
