/**
 * "Add your zip" — one row under Next up when the home has no zip (seventeen
 * fixes, mock m5, owner-approved 2026-11-25). It replaced the "Finish your
 * home profile" banner that sat above the greeting: the zip is the one answer
 * that changes what Homehub suggests today (freezing, earthquakes, wildfire,
 * termites), so it is the one thing Home asks for.
 *
 * The row opens the first-minute screens for this home (/home/zip): the zip,
 * what the area means, then only the tasks the zip brings that the home
 * doesn't have. Nothing is added until Add.
 *
 * Its ✕ is kept on the SERVER, per person and per home (userPreferences), the
 * way the banner's was — a local flag alone came back after a WebView reset.
 * localStorage only mirrors it, so the row doesn't flash on a cold start.
 */
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRightIcon, XIcon } from "lucide-react"
import { InlineError } from "@/components/layout/LoadStates"
import { dismissZipRow, getDismissedZipRows } from "@/lib/userPreferences"
import { readLocal, removeLocal, writeLocal } from "./dayOneData"

const SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", LINE = "var(--hh-line)", SURFACE = "var(--hh-surface)"

/** Per person AND home: one phone shared by two members of a home must not
 *  let one's close hide the row from the other. */
const zipRowMirrorKey = (userId: string, homeId: string) => `hh.zipRow.dismissed.${userId}.${homeId}`

/** Where the row goes: the first-minute screens, for this signed-in person's existing home. */
const ADD_ZIP_PATH = "/home/zip"

type State = "checking" | "shown" | "closed"

export function ZipRow({ homeId, userId }: { homeId: string; userId: string }) {
  const mirror = zipRowMirrorKey(userId, homeId)
  const [state, setState] = useState<State>(() => (readLocal(mirror) === "1" ? "closed" : "checking"))
  /** A close the server refused: the row is back, and says so. */
  const [error, setError] = useState<string | null>(null)

  // The server decides. A close made on another device, or one whose mirror
  // was wiped, still counts. Until it answers the row stays away rather than
  // flash in and out; a read that fails shows the row (a row we can't verify
  // is closed is better than an answer she can't give).
  useEffect(() => {
    if (state !== "checking") return
    let cancelled = false
    getDismissedZipRows(userId)
      .then((ids) => {
        if (cancelled) return
        if (ids.includes(homeId)) {
          writeLocal(mirror, "1")
          setState("closed")
        } else {
          removeLocal(mirror)
          setState("shown")
        }
      })
      .catch((e: unknown) => {
        console.warn(`[zip row] could not read closes for ${userId}:`, e instanceof Error ? e.message : e)
        if (!cancelled) setState("shown")
      })
    return () => { cancelled = true }
  }, [state, userId, homeId, mirror])

  if (state !== "shown") return null

  const close = () => {
    setState("closed")
    setError(null)
    writeLocal(mirror, "1")
    dismissZipRow(userId, homeId).catch((e: unknown) => {
      // Never a close that only looked saved: the row comes back and says why.
      console.warn(`[zip row] could not save the close for home ${homeId}:`, e instanceof Error ? e.message : e)
      removeLocal(mirror)
      setState("shown")
      setError("Couldn't save that. Check your connection and try again.")
    })
  }

  return (
    <section data-testid="zip-row" className="w-full">
      {/* The collapsed "Tell us what's in your home" row's card, with a close
          beside the chevron. The link covers the card; the ✕ sits above it. */}
      <div className="relative flex w-full items-center gap-1 rounded-2xl border py-4 pl-6 pr-2 shadow-sm" style={{ background: SURFACE, borderColor: LINE }}>
        <Link to={ADD_ZIP_PATH} className="min-w-0 flex-1 py-2 after:absolute after:inset-0 after:rounded-2xl after:content-['']">
          <span className="block text-[1.0625rem] font-bold leading-snug" style={{ color: TEAL }}>Add your zip</span>
          <span className="mt-1 block text-[0.9375rem] leading-snug" style={{ color: SUB }}>Get the tasks that matter for your weather and area.</span>
        </Link>
        <button
          type="button"
          onClick={close}
          aria-label="Not now"
          className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full"
          style={{ color: SUB }}
        >
          <XIcon className="size-5" aria-hidden />
        </button>
        <ChevronRightIcon className="mr-1 size-5 shrink-0" style={{ color: TEAL }} aria-hidden />
      </div>
      {error && <InlineError className="mt-2 px-1">{error}</InlineError>}
    </section>
  )
}
