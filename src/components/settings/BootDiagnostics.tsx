import { useState } from "react"
import { lastBootTiming } from "@/lib/bootTiming"

/**
 * Where the last cold start actually spent its time.
 *
 * Exists because "the app is slow to load" was reported three times and guessed
 * at twice — once producing a 7.7s first-paint figure from this laptop that a
 * plain curl of the same URL contradicted. A laptop on wifi cannot reproduce an
 * iOS WebView cold start on cellular. This puts the real numbers on the real
 * device, screenshot-able, so the next fix is aimed at whatever is actually slow.
 *
 * Deltas, not timestamps: cumulative times hide which STEP costs the time.
 */
export function BootDiagnostics() {
  const [open, setOpen] = useState(false)
  const t = lastBootTiming()

  const LABEL: Record<string, string> = {
    js: "Bundle downloaded + parsed",
    react: "React mounted",
    auth: "Signed-in state resolved",
    home: "Home loaded",
    "dash:core": "Stats + task list",
    content: "Home showed real content",
    "dash:extras": "Supplementary data",
  }

  const worst = t?.phases.reduce((a, b) => (b.delta > a.delta ? b : a), t.phases[0])
  const total = t?.phases.at(-1)?.at ?? 0

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3.5 text-left"
      >
        <span className="flex-1 text-sm font-semibold text-foreground">Startup diagnostics</span>
        <span className="font-mono text-xs text-muted-foreground">
          {t ? `${(total / 1000).toFixed(1)}s` : "—"}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3.5">
          {!t ? (
            <p className="text-[13px] text-muted-foreground">
              No cold start recorded yet. Fully quit the app and reopen it, then come back here.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <span>ttfb {t.ttfb ?? "?"}ms</span>
                <span>dom {t.domInteractive ?? "?"}ms</span>
                <span>net {t.conn}</span>
                <span>{t.native === "web" ? "browser" : `native:${t.native}`}</span>
              </div>

              <div className="flex flex-col gap-1">
                {t.phases.map((p) => {
                  const pct = total ? Math.max(2, Math.round((p.delta / total) * 100)) : 0
                  const isWorst = worst && p.phase === worst.phase && p.delta > 0
                  return (
                    <div key={p.phase} className="flex items-center gap-2">
                      <span className="w-[168px] shrink-0 text-[12px] text-foreground">
                        {LABEL[p.phase] ?? p.phase}
                      </span>
                      <span
                        className="h-2 rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: isWorst ? "var(--hh-clay)" : "var(--hh-teal)",
                        }}
                      />
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                        +{p.delta}ms
                      </span>
                    </div>
                  )
                })}
              </div>

              {worst && (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Slowest step: <b className="text-foreground">{LABEL[worst.phase] ?? worst.phase}</b>{" "}
                  at {worst.delta}ms of {total}ms total.
                </p>
              )}
              {!t.complete && (
                <p className="mt-2 text-[12px] font-semibold" style={{ color: "var(--hh-clay)" }}>
                  This boot never finished loading — it stopped after “{LABEL[t.phases.at(-1)?.phase ?? ""] ?? "start"}”.
                </p>
              )}
              {/* A warm start paints from the saved snapshot and refreshes behind
                  it, so "Stats + task list" can still be outstanding while Home
                  is already usable. Saying so beats leaving a silent gap in the
                  list that reads like a failure. */}
              {t.complete && !t.phases.some((p) => p.phase === "dash:core") && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Home painted from the saved snapshot; the refresh from the server was still
                  in flight when this was recorded.
                </p>
              )}
              {t.extrasAt != null && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Supplementary data landed at {t.extrasAt}ms — in parallel, after Home was already usable.
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Recorded {new Date(t.at).toLocaleString()}. Screenshot this.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
