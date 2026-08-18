import { useEffect, useRef, useState } from "react"
import { Loader2Icon, SearchIcon, FileTextIcon, ShieldCheckIcon } from "lucide-react"
import { callable } from "@/integrations/firebase"
import { manualSearchUrl } from "@/lib/manualSearch"

/**
 * "Find it for me" — the step that used to send people out of the app.
 *
 * Attaching a manual previously meant: leave Homehub, search the manufacturer's
 * site, match your exact model, download a PDF, come back, upload it. That's
 * where adding an appliance stalls, and an item with no manual has no tasks —
 * which is most of what Homehub is for. Brand and model are already typed by this
 * point, so the search is free to us and saves the whole detour.
 *
 * Candidates are SHOWN, never auto-attached: the wrong model's manual produces
 * confidently wrong tasks that the user has no way to trace back. The source
 * domain is displayed because that's what a person actually uses to judge, and
 * manufacturer results are marked and ranked first.
 */

interface ManualCandidate {
  url: string
  title: string
  host: string
  official: boolean
}

const findManualCallable = callable<
  { brand: string; model: string },
  { candidates: ManualCandidate[]; source: "cache" | "search" | "unavailable" }
>("findManual")

export function FindManualCard({
  brand,
  model,
  onPick,
  disabled,
  autoStart = false,
}: {
  brand: string
  model: string
  onPick: (url: string, title: string) => void
  disabled?: boolean
  /** Search on mount instead of waiting to be tapped. Use wherever the user
   *  has already said they want a manual — they should not also have to
   *  discover the search. */
  autoStart?: boolean
}) {
  const [state, setState] = useState<"idle" | "searching" | "done" | "error">("idle")
  const [candidates, setCandidates] = useState<ManualCandidate[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const searchRef = useRef<() => void>(() => {})
  const autoFiredFor = useRef<string | null>(null)

  const canSearch = brand.trim().length >= 2 && model.trim().length >= 2
  const autoKey = autoStart && canSearch ? `${brand.trim()}::${model.trim()}` : null

  // Fire once per brand+model. A ref rather than a state flag so StrictMode's
  // double-invoke doesn't buy the search twice.
  useEffect(() => {
    if (!autoKey || autoFiredFor.current === autoKey) return
    autoFiredFor.current = autoKey
    searchRef.current()
  }, [autoKey])

  if (!canSearch) return null

  const search = async () => {
    setState("searching")
    setUnavailable(false)
    try {
      const res = await findManualCallable({ brand: brand.trim(), model: model.trim() })
      setCandidates(res.candidates ?? [])
      setUnavailable(res.source === "unavailable")
      setState("done")
    } catch {
      // Never a dead end — upload and paste-URL are still right below.
      setState("error")
    }
  }
  searchRef.current = () => void search()

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}>
      {state === "idle" && (
        <button
          type="button"
          onClick={() => void search()}
          disabled={disabled}
          className="flex w-full items-center gap-2.5 text-left"
        >
          <SearchIcon className="size-4 shrink-0" style={{ color: "var(--hh-teal)" }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>
              Find the manual for me
            </span>
            <span className="block text-[11.5px]" style={{ color: "var(--hh-sub)" }}>
              Search the web for the {brand} {model} manual
            </span>
          </span>
        </button>
      )}

      {state === "searching" && (
        <div className="flex items-center gap-2.5 text-[13px]" style={{ color: "var(--hh-sub)" }}>
          <Loader2Icon className="size-4 animate-spin shrink-0" />
          Looking for the {brand} {model} manual…
        </div>
      )}

      {state === "error" && (
        <div className="text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
          Couldn't search just now — you can still upload or paste a link below.{" "}
          <button type="button" onClick={() => void search()} className="font-semibold underline" style={{ color: "var(--hh-teal)" }}>
            Try again
          </button>{" "}
          <a
            href={manualSearchUrl(brand, model)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
            style={{ color: "var(--hh-teal)" }}
          >
            Search the web yourself →
          </a>
        </div>
      )}

      {state === "done" && (
        <>
          {candidates.length === 0 ? (
            <div className="text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
              {unavailable
                ? "Manual search isn't set up yet — upload the PDF or paste a link below."
                : `No manual found online for the ${brand} ${model}. Upload the PDF or paste a link below.`}{" "}
              <a
                href={manualSearchUrl(brand, model)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
                style={{ color: "var(--hh-teal)" }}
              >
                Search the web yourself →
              </a>
            </div>
          ) : (
            <>
              <div className="mb-2 text-[12px]" style={{ color: "var(--hh-sub)" }}>
                Found {candidates.length === 1 ? "one that looks right" : `${candidates.length} that could be right`} — pick the one that matches your model.
              </div>
              <ul className="flex flex-col gap-1.5">
                {candidates.map((c) => (
                  <li key={c.url}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(c.url, c.title)}
                      className="flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left"
                      style={{ borderColor: "var(--hh-line)", background: "var(--hh-bg, transparent)" }}
                    >
                      <FileTextIcon className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--hh-clay)" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>
                          {c.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--hh-sub)" }}>
                          {c.official && <ShieldCheckIcon className="size-3 shrink-0" style={{ color: "var(--hh-teal)" }} />}
                          <span className="truncate">{c.host}</span>
                          {c.official && <span style={{ color: "var(--hh-teal)" }}>· manufacturer</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void search()}
                  className="text-[11.5px] font-semibold underline"
                  style={{ color: "var(--hh-sub)" }}
                >
                  None of these match
                </button>
                <a
                  href={manualSearchUrl(brand, model)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11.5px] font-semibold underline"
                  style={{ color: "var(--hh-sub)" }}
                >
                  Search the web yourself →
                </a>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
