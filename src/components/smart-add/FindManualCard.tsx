import { useEffect, useRef, useState } from "react"
import { AlertTriangleIcon, EyeIcon, Loader2Icon, SearchIcon, FileTextIcon, ShieldCheckIcon } from "lucide-react"
import { callable } from "@/integrations/firebase"
import { manualSearchUrl } from "@/lib/manualSearch"
import { findModelMismatch } from "../../../shared/products/modelMismatch"
import { documentKind, displayTitle } from "../../../shared/products/documentKind"
import { ManualPageSheet } from "@/components/care/ManualPageSheet"

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
 *
 * For the beta this is EXPLICITLY a work in progress, and deliberately not the
 * default path — uploading the manual yourself is. It earned that demotion: a
 * real search for a Core 300 returned the manufacturer's own manual for the
 * Core 300S, the smart variant. Right host, right brand, wrong product, and
 * nothing on screen said so. A wrong host is obvious; a wrong VARIANT parses
 * cleanly and quietly becomes someone's care plan.
 *
 * So each candidate now carries the reason we think it fits, a mismatch warning
 * when the title names a different model, and a preview of the first pages —
 * warn and allow, never block: one manual sometimes does cover a family.
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
  const [preview, setPreview] = useState<ManualCandidate | null>(null)
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
    <>
    {preview && (
      <ManualPageSheet
        open
        onOpenChange={(o) => { if (!o) setPreview(null) }}
        pdfUrl={preview.url}
        pageNumber={1}
        caption={`${preview.title} — check the model on the cover matches your unit`}
      />
    )}
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}>
      {state === "idle" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <SearchIcon className="size-4 shrink-0" style={{ color: "var(--hh-teal)" }} />
            <span className="text-[13.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>
              Find it for me
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.09em]"
              style={{ background: "var(--hh-amber-wash, #F6EFDC)", color: "var(--hh-amber, #8A6D1E)" }}
            >
              Beta
            </span>
          </div>
          {/* Said plainly. During the beta this is not the default path —
              uploading the manual yourself is — and a tester deserves to know
              which parts of the product are still finding their feet. */}
          <p className="text-[11.5px] leading-snug" style={{ color: "var(--hh-sub)" }}>
            We&apos;ll search the web for the {brand} {model} manual and show what we find.
            Still rough — check the model before you attach anything.
          </p>
          <button
            type="button"
            onClick={() => void search()}
            disabled={disabled}
            className="self-start rounded-lg border px-3 py-1.5 text-[12.5px] font-bold"
            style={{ borderColor: "var(--hh-teal)", color: "var(--hh-teal)" }}
          >
            Try the search
          </button>
        </div>
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
                Search Google for this manual →
              </a>
            </div>
          ) : (
            <>
              {/* HH-72: was "Search the web yourself", which is the word doing
                the damage — it reads as being sent away empty-handed. We hand
                Google the brand, the model and "owner's manual pdf" already
                typed in; the label should say so. */}
            <div className="mb-2 text-[12px]" style={{ color: "var(--hh-sub)" }}>
                Found {candidates.length === 1 ? "one that looks right" : `${candidates.length} that could be right`} — pick the one that matches your model.
              </div>
              <ul className="flex flex-col gap-2">
                {candidates.map((c) => {
                  const otherModel = findModelMismatch(c.title, model)
                  // HH-73: what KIND of document this is, and a usable name for
                  // it when the result's own title is just the host.
                  const doc = documentKind(c.title, c.url)
                  const shown = displayTitle(c.title, c.url, c.host)
                  return (
                    <li
                      key={c.url}
                      className="rounded-lg border px-2.5 py-2"
                      style={{ borderColor: "var(--hh-line)", background: "var(--hh-bg, transparent)" }}
                    >
                      <div className="flex items-start gap-2.5">
                        <FileTextIcon className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--hh-clay)" }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>
                            {shown}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--hh-sub)" }}>
                            {/* The badge vouches for the HOST, so it must not
                                appear to vouch for the document. A spec sheet
                                on lg.com is genuinely from LG and genuinely not
                                a manual; showing only the reassuring half is
                                what made this result look right. */}
                            {c.official && !doc.thinOnUpkeep && <ShieldCheckIcon className="size-3 shrink-0" style={{ color: "var(--hh-teal)" }} />}
                            <span className="truncate">{c.host}</span>
                            {c.official && !doc.thinOnUpkeep && <span style={{ color: "var(--hh-teal)" }}>· manufacturer&apos;s own site</span>}
                            {doc.label && (
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                                style={doc.thinOnUpkeep
                                  ? { background: "var(--hh-clay-soft)", color: "var(--hh-clay)" }
                                  : { background: "var(--hh-slate-soft)", color: "var(--hh-slate)" }}
                              >
                                {doc.label}
                              </span>
                            )}
                          </span>
                        </span>
                      </div>

                      {/* Warn, never block: a manual sometimes does cover a
                          family, and refusing those would be the same mistake
                          pointed the other way. */}
                      {/* HH-73: say it plainly. The chosen PDF is fed to the
                          parser that writes the maintenance schedule, so a
                          document with no upkeep in it does not fail loudly —
                          it produces confident tasks from nothing. */}
                      {doc.thinOnUpkeep && (
                        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--hh-clay)" }}>
                          This looks like a {doc.label!.toLowerCase()}, not the owner&apos;s manual — it probably has no upkeep in it. You can still use it.
                        </p>
                      )}
                      {otherModel && (
                        <div
                          className="mt-1.5 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11px] leading-snug"
                          style={{ background: "var(--hh-clay-wash, #F7E7DE)", color: "var(--hh-ink)" }}
                        >
                          <AlertTriangleIcon className="mt-px size-3 shrink-0" style={{ color: "var(--hh-clay)" }} />
                          <span>
                            This manual is for the <strong>{otherModel}</strong> — you entered{" "}
                            <strong>{model}</strong>. Check before attaching.
                          </span>
                        </div>
                      )}

                      <div className="mt-1.5 flex gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setPreview(c)}
                          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold"
                          style={{ borderColor: "var(--hh-line2)", color: "var(--hh-ink)" }}
                        >
                          <EyeIcon className="size-3" /> Preview
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onPick(c.url, c.title)}
                          className="rounded-md px-2.5 py-1 text-[11.5px] font-bold text-white"
                          style={{ background: "var(--hh-teal)" }}
                        >
                          Use this
                        </button>
                      </div>
                    </li>
                  )
                })}
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
                  Search Google for this manual →
                </a>
              </div>
            </>
          )}
        </>
      )}
    </div>
    </>
  )
}
