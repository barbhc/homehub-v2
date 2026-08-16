/**
 * Boot timing — real numbers from the real device.
 *
 * "The app is slow to load" has been reported three times and guessed at twice.
 * A laptop on wifi cannot reproduce an iOS WebView cold start on cellular, and
 * measuring it from here produced a figure (7.7s to first paint) that a plain
 * curl contradicted. So: instrument the actual phone, show the numbers on the
 * phone, and stop guessing.
 *
 * Deliberately tiny and dependency-free — it runs on the critical path it is
 * measuring, so it must not become part of the problem. No React, no imports,
 * one localStorage write per boot.
 */

const KEY = "homehub:boot-timing"

/** Phases, in the order they should occur. */
export type BootPhase =
  | "js"            // module scope reached — bundle downloaded + parsed
  | "react"         // createRoot().render() called
  | "auth"          // onAuthStateChanged delivered its first value
  | "home"          // the home context resolved to a home id
  | "dash:core"     // stats + the task list — the critical path
  | "content"       // Home rendered real content rather than a skeleton
  | "dash:extras"   // supplementary data, deliberately OFF the critical path

const marks: { phase: BootPhase; at: number }[] = []

/** Upper bound on a believable native launch segment. The iOS shell builds its
 *  injection script once per process, so a SECOND navigation in the same process
 *  (reload, WebView reload after a memory warning) yields a delta that includes
 *  however long the app had already been running. Past this, we report nothing
 *  rather than a fiction. */
const MAX_PLAUSIBLE_NATIVE_MS = 60_000

/**
 * How long the native shell took to get from process start to the web app's
 * first instruction — the segment that ends where `performance.timeOrigin`
 * begins, and which no web API can otherwise see.
 *
 * Both numbers are stamped natively (see `LaunchClock` / `MainViewController` in
 * the iOS shell): process start from the kernel, and document start from the
 * injected script itself. Null on the web, on an old build without the
 * injection, or when the value is not plausibly a cold start.
 */
export function nativeLaunchMs(): number | null {
  const w = window as unknown as { __nativeLaunchMs?: number; __nativeDocStartMs?: number }
  if (typeof w.__nativeLaunchMs !== "number" || typeof w.__nativeDocStartMs !== "number") return null
  const delta = Math.round(w.__nativeDocStartMs - w.__nativeLaunchMs)
  if (delta < 0 || delta > MAX_PLAUSIBLE_NATIVE_MS) return null
  return delta
}

/** Milliseconds since the navigation started — the only origin that spans the
 *  whole boot, including the bundle download. */
const now = (): number => Math.round(performance.now())

export function markBoot(phase: BootPhase): void {
  // First write wins: a phase can be reached again on re-render, and the first
  // arrival is the one that describes the cold start.
  if (marks.some((m) => m.phase === phase)) return
  marks.push({ phase, at: now() })
  // Persist on EVERY mark, not just the last one. The first version only wrote
  // on "content" — so a boot that stalled recorded nothing at all, which is
  // precisely the boot worth recording. A partial trace ending at "auth" tells
  // you where it hung; an empty one tells you nothing.
  persist()
}

/**
 * Deltas along the CRITICAL PATH — the shape that shows where the time goes,
 * which cumulative timestamps hide.
 *
 * `dash:extras` is excluded from the chain on purpose: it runs in parallel with
 * `dash:core`, so subtracting it from whatever mark happened to land before it
 * would produce a number that means nothing. It is reported separately as an
 * absolute time, which is the only honest way to show a parallel branch.
 */
export function bootReport(): { phase: BootPhase; at: number; delta: number }[] {
  const path = marks.filter((m) => m.phase !== "dash:extras")
  return path.map((m, i) => ({ ...m, delta: i === 0 ? m.at : m.at - path[i - 1].at }))
}

/** When the supplementary round finished, in absolute ms. Off the critical path:
 *  Home is already interactive before this lands. */
export function extrasFinishedAt(): number | null {
  return marks.find((m) => m.phase === "dash:extras")?.at ?? null
}

function persist(): void {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    localStorage.setItem(
      KEY,
      JSON.stringify({
        at: new Date().toISOString(),
        // Network/document phases the marks above cannot see.
        ttfb: nav ? Math.round(nav.responseStart) : null,
        domInteractive: nav ? Math.round(nav.domInteractive) : null,
        phases: bootReport(),
        extrasAt: extrasFinishedAt(),
        // The native launch segment, when the shell is new enough to stamp it.
        nativeMs: nativeLaunchMs(),
        // False until Home actually painted content — a trace without this is a
        // boot that never finished, and the last phase is where it stopped.
        complete: marks.some((m) => m.phase === "content"),
        // Distinguishes a WebView cold start from a browser tab.
        standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
        native: document.documentElement.dataset.native ?? "web",
        conn: (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? "?",
      }),
    )
  } catch {
    /* storage unavailable — diagnostics must never break a boot */
  }
}

/** The last recorded boot, for the Settings diagnostics row. */
export function lastBootTiming(): {
  at: string
  ttfb: number | null
  domInteractive: number | null
  phases: { phase: BootPhase; at: number; delta: number }[]
  extrasAt: number | null
  /** Native shell launch → web document start. Null on web or an old build. */
  nativeMs?: number | null
  complete: boolean
  standalone: boolean
  native: string
  conn: string
} | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** One-line summary for an analytics event: the slowest phase and its cost. */
export function slowestPhase(): { phase: BootPhase; delta: number } | null {
  const r = bootReport()
  if (!r.length) return null
  return r.reduce((worst, p) => (p.delta > worst.delta ? p : worst), r[0])
}
