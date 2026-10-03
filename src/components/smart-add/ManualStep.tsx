import { useState, useRef, useCallback, useEffect } from "react"
import {
  FileTextIcon,
  UploadIcon,
  XIcon,
  AlertCircleIcon,
  ClockIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  SearchIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MAX_UPLOAD_BYTES } from "@/modules/inventory/services/storageService"
import { cn } from "@/lib/utils"
import type { DocType } from "@/modules/knowledge"
import { capacityNotice, isCapacityRefusal } from "@/lib/scanCapacity"
import { isAllowedUrl } from "../../../shared/parse/ssrf"

type OpenPanel = "none" | "url" | "search"

/** This step's own controls, for the link field's blur rule. The drop zone is a
 *  clickable div, so it is marked rather than found by role. */
const STEP_CONTROL = "button, a, [data-step-control]"

/**
 * A link that looks FINISHED, for the two ways a link is chosen without being
 * asked (leaving the field, a whole link arriving at once): one the scan would
 * accept (isAllowedUrl), pointing past the bare site. "https://lg.exa" passes
 * isAllowedUrl — it is a well-formed URL — but it is a link still being typed,
 * and never a manual. A paste or Enter is an explicit "done" and needs neither.
 */
function isFinishedLink(text: string): boolean {
  const t = text.trim()
  if (!isAllowedUrl(t)) return false
  const u = new URL(t) // isAllowedUrl has just parsed it
  return u.pathname.length > 1 || u.search.length > 1
}

export type ManualSourceChoice =
  | { type: "url"; url: string }
  | { type: "upload"; file: File }

export type ManualDocClassification = {
  docType: DocType
  confidence: number
  reason: string
  filename: string
}

import { FindManualCard } from "./FindManualCard"
import { useAutoFindManuals } from "@/hooks/useAutoFindManuals"

type ManualStepProps = {
  /** Already typed on the identify step — enough to search for the manual so the
   *  user never has to go hunt for a PDF themselves. */
  brand?: string
  model?: string
  onConfirm: (choices: ManualSourceChoice[]) => void
  onSkip?: () => void
  /** HH-130: the manual step had no way back, so checking the model you just
   *  typed meant leaving and losing the step. */
  onBack?: () => void
  isSaving: boolean
  savingMessage?: string
  error: string | null
  onRetry?: () => void
  docClassification?: ManualDocClassification | null
  onDocClassificationUseAnyway?: () => void
  onDocClassificationReplace?: () => void
  /**
   * Which panel starts open. HH-89: the item page has a "Find it for me"
   * shortcut, and tapping it IS the ask — making the user tap "Let us find it"
   * again inside would be a stutter. Only that entry point passes "search";
   * the ranking is unchanged for everyone who opens this normally.
   */
  initialPanel?: OpenPanel
}

/**
 * Where the manual comes from — three sources, deliberately ranked.
 *
 * Round 11 (owner): "Find the manual has not generated good results so far.
 * This should be the last option with text that it's a beta. Lead with choosing
 * a file. For paste a link make sure it's clear the link has to be of a PDF."
 *
 * The previous layout put a mode toggle at the top, the search card in the
 * middle, and the panel the toggle controlled BELOW the search — so the control
 * and the thing it controlled were separated by the one option we least wanted
 * people to take (HH-109). Worse, the file header comment already said search
 * was "deliberately not the default path"; the layout said the opposite.
 *
 * Order is the ranking now. Choosing a file leads and carries the only filled
 * control on the screen. Pasting a link is second, and says out loud that the
 * link must end in .pdf — pasting the product page is the mistake that actually
 * happens. Search is last, badged Beta, and its one line is the truth rather
 * than a pitch.
 *
 * The drop zone survives on desktop only. Dragging a downloaded PDF onto a
 * target is genuinely the fastest route with a mouse and meaningless on a
 * phone, where a dashed rectangle is just something you can tap.
 */
function docTypeLabel(docType: DocType): string {
  switch (docType) {
    case "spec_sheet":
      return "spec sheet"
    case "install_guide":
      return "install guide"
    case "warranty":
      return "warranty document"
    case "manual":
      return "owner's manual"
    default:
      return "document"
  }
}

/** "0.0 MB" reads as an empty or broken file. Anything under a megabyte is KB. */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ManualStep({
  onConfirm,
  onSkip,
  onBack,
  isSaving,
  savingMessage,
  error,
  onRetry,
  docClassification,
  onDocClassificationUseAnyway,
  onDocClassificationReplace,
  initialPanel,
  brand,
  model,
}: ManualStepProps) {
  const [autoFindManuals] = useAutoFindManuals()
  const [open, setOpen] = useState<OpenPanel>(initialPanel ?? "none")
  const [pasteUrl, setPasteUrl] = useState("")
  /**
   * The link is CHOSEN — the field gives way to the "Manual link added" card —
   * only once the person is done with it: a paste, Enter, leaving the field
   * with a complete link, or a whole link arriving at once (autofill, a drop,
   * a search result). Never on a keystroke. The card used to follow the
   * field's text itself, so the FIRST typed character swapped the field out
   * from under the cursor, and a link could only ever be pasted. Same card,
   * same copy; only when it appears changed.
   */
  const [linkChosen, setLinkChosen] = useState(false)
  const chooseLink = (text: string) => {
    if (text.trim()) setLinkChosen(true)
  }
  /** A paste is landing in the field — its change finishes the link. */
  const pasting = useRef(false)
  /**
   * The press under way, for the field's onBlur — from pointerdown anywhere on
   * the page until that press is over (its click handled, or it ended without
   * one — see below):
   *  · "step"  — one of this step's own controls (its buttons, links, the drop
   *              zone). Its action wins and the link stays in the field: a
   *              person heading for "Let us find it" or "Choose a file" has
   *              not finished typing a link.
   *  · "other" — anything else, the dialog around the step included ("Owner
   *              manual" / "Reference doc" on the item page). A complete link
   *              is chosen AFTER that click lands; swapping the field for the
   *              card first moves everything under the pointer and the tap
   *              hits nothing.
   */
  const press = useRef<"none" | "step" | "other">("none")
  const afterPress = useRef<(() => void) | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const own = target != null && rootRef.current?.contains(target) === true && target.closest(STEP_CONTROL) != null
      press.current = own ? "step" : "other"
    }
    const onSettle = () => {
      press.current = "none"
      const run = afterPress.current
      afterPress.current = null
      // A macrotask: after every handler of this click, the pressed control's own included.
      if (run) setTimeout(run, 0)
    }
    // A press can also end WITHOUT a click: the button released outside the
    // window, a press that turned into a drag, the window losing focus
    // mid-press (an app switch). Left open, it outlived itself until the next
    // pointerdown, and the next keyboard blur (Tab, iOS Done) of a complete
    // link was deferred to a click that never came ("other") or skipped
    // ("step"). So a drag and a window blur end it too, and so does a MOUSE
    // pointerup: the mouse moved focus at mousedown, and its click, if one
    // follows, comes in this same task — the deferred choice (a macrotask)
    // still runs after it. A touch's (or pen's) pointerup does NOT end it: the
    // compatibility mousedown that moves focus off the field, and the click,
    // both come AFTER pointerup, so ending the press there would choose the
    // link before the tap lands — the swap this guard exists to prevent.
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") onSettle()
    }
    // The window's own blur only — an element's blur never bubbles up to here.
    const onWindowBlur = (e: FocusEvent) => {
      if (e.target === e.currentTarget) onSettle()
    }
    document.addEventListener("pointerdown", onDown, true)
    document.addEventListener("pointerup", onUp, true)
    document.addEventListener("click", onSettle, true)
    document.addEventListener("pointercancel", onSettle, true)
    document.addEventListener("dragstart", onSettle, true)
    window.addEventListener("blur", onWindowBlur)
    return () => {
      document.removeEventListener("pointerdown", onDown, true)
      document.removeEventListener("pointerup", onUp, true)
      document.removeEventListener("click", onSettle, true)
      document.removeEventListener("pointercancel", onSettle, true)
      document.removeEventListener("dragstart", onSettle, true)
      window.removeEventListener("blur", onWindowBlur)
      afterPress.current = null
    }
  }, [])
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const maxMB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)
  const atCapacity = isCapacityRefusal(error)
  /** Empty unless we actually know what the item is — never a bare "manual pdf". */
  const searchQuery = [brand, model].filter(Boolean).join(" ").trim()
    ? `${[brand, model].filter(Boolean).join(" ")} manual pdf`
    : ""
  const canSearch = !!brand && !!model && brand.trim().length >= 2 && model.trim().length >= 2

  const validateAndSetFile = useCallback(
    (f: File) => {
      setFileError(null)
      if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
        setFileError("Please select a PDF file.")
        return
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        setFileError(`File is ${Math.round(f.size / 1024 / 1024)} MB — max is ${maxMB} MB.`)
        return
      }
      // HH-124's owner report: "The file that I'm uploading says that it's
      // 5.9 MB, but here it says zero bites is that a bug" — and then, on the
      // next screen, "There should be a check to make sure that the file has
      // content before accepting it."
      //
      // Both are the same fact and it is not a display bug: readableSize() is
      // correct arithmetic, so f.size really is 0. iOS hands the picker a
      // placeholder for an iCloud file it has not downloaded yet, and the guard
      // above only asked whether the file was too BIG. So an empty PDF was
      // accepted, uploaded, and scanned — 10 quota units spent reading nothing,
      // and whatever came back built on it.
      //
      // Named cause, named fix, and deliberately NOT "try again": picking the
      // same placeholder fails identically.
      if (f.size === 0) {
        setFileError(
          "This file came through empty. iCloud may not have finished downloading it — open it once in Files, then pick it again.",
        )
        return
      }
      setFile(f)
      setPasteUrl("")
      setLinkChosen(false)
      setOpen("none")
    },
    [maxMB]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped) validateAndSetFile(dropped)
    },
    [validateAndSetFile]
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  // A source is chosen when there is a file OR a finished link (linkChosen).
  // The link covers pasting, typing, and picking a search result, which fills
  // the same field.
  const canContinue = !!file || (linkChosen && pasteUrl.trim().length > 0)

  const handleContinue = () => {
    if (docClassification) return
    if (file) onConfirm([{ type: "upload", file }])
    else if (pasteUrl.trim()) onConfirm([{ type: "url", url: pasteUrl.trim() }])
  }

  const clearChoice = () => {
    setFileError(null)
    if (file) {
      setFile(null)
      return
    }
    // A chosen LINK goes back into its field, text and all, ready to edit —
    // nobody should retype a link to fix one character. Clearing the field is
    // how a link is dropped.
    setLinkChosen(false)
    setOpen("url")
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {docClassification && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p>
            Looks like a <strong>{docTypeLabel(docClassification.docType)}</strong>. Want to add the
            owner&apos;s manual instead?{" "}
            <span className="text-muted-foreground opacity-90">({docClassification.filename})</span>
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button type="button" size="sm" variant="default" onClick={() => onDocClassificationUseAnyway?.()}>
              Use this one anyway
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onDocClassificationReplace?.()}>
              Replace
            </Button>
          </div>
        </div>
      )}

      {/* ---------------- the chosen source, once there is one ---------------- */}
      {canContinue ? (
        <div className="rounded-xl border border-primary bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <FileTextIcon className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">
                {file ? file.name : "Manual link added"}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {file ? `${readableSize(file.size)} · PDF` : pasteUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={clearChoice}
              className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Remove this manual"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop only: dragging a downloaded PDF is genuinely fastest with a
              mouse, and a dashed rectangle is meaningless on a touchscreen. */}
          <div
            data-step-control=""
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "hidden cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card px-6 py-10 transition-colors md:flex",
              dragging ? "border-primary bg-primary/5" : "border-input hover:bg-muted/40"
            )}
          >
            <div
              className={cn(
                "flex size-11 items-center justify-center rounded-full transition-colors",
                dragging ? "bg-primary/15" : "bg-muted"
              )}
            >
              <UploadIcon className={cn("size-5", dragging ? "text-primary" : "text-muted-foreground")} />
            </div>
            <p className="text-base font-semibold">
              {dragging ? "Drop it" : "Drop a PDF here"}
            </p>
            <p className="text-xs text-muted-foreground">or click to browse · up to {maxMB} MB</p>
          </div>

          {/* HH-115: order alone was too weak a signal when all three options
              were the same shape. Upload is now a tall bordered card with an
              icon and the only filled button on the screen, and it says the
              thing that earns it the top slot. */}
          <div className="flex flex-col items-center gap-3.5 rounded-2xl border-2 border-primary bg-card p-5 text-center shadow-sm md:hidden">
            <span className="flex size-13 items-center justify-center rounded-full bg-secondary" style={{ width: 52, height: 52 }}>
              <UploadIcon className="size-6 text-primary" />
            </span>
            <div>
              <p className="text-xl font-semibold tracking-tight">Upload the PDF</p>
              <p className="mt-1 text-sm text-muted-foreground">
                From your phone, iCloud or Files. This is the one that always works.
              </p>
            </div>
            <Button type="button" className="w-full" onClick={() => inputRef.current?.click()}>
              Choose a file
            </Button>
          </div>

          {/* Owner, 2026-09-06, QA'ing the care-library branch: "what happened
              to the Or between these options?" The identify step states the
              relationship between typing and scanning with an "or" rule
              (HH-123); this sheet listed its sources without one, so upload
              and the link read as a list rather than as alternatives. Same
              rule, same markup. */}
          <div className="my-1 flex items-center gap-3" aria-hidden="true" data-testid="manual-or-rule">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* Second: paste a link. Says what kind of link, because pasting the
              product page instead of the PDF is the mistake that happens. */}
          <div className="rounded-xl border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => setOpen(open === "url" ? "none" : "url")}
              aria-expanded={open === "url"}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <div className="min-w-0">
                <p className="text-base font-semibold">Paste a link</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Must end in .pdf — not a web page
                </p>
              </div>
              {open === "url" ? (
                <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
              )}
            </button>
            {open === "url" && (
              <div className="border-t px-4 pb-4 pt-3">
                <Input
                  id="manual-url"
                  type="url"
                  value={pasteUrl}
                  onPaste={() => {
                    pasting.current = true
                  }}
                  onChange={(e) => {
                    const next = e.target.value
                    // A whole link arriving in ONE change into an empty field
                    // (autofill, a drop, a test's fill) is finished; a key
                    // press never is — "h" and "https://e" are both mid-word.
                    const arrivedWhole = pasteUrl.trim() === "" && isFinishedLink(next)
                    if (pasting.current || arrivedWhole) chooseLink(next)
                    pasting.current = false
                    setPasteUrl(next)
                  }}
                  onKeyDown={(e) => {
                    // A key press after a paste that changed nothing: the paste is over.
                    pasting.current = false
                    // Enter finishes the link and shows it; Scan stays a
                    // separate, deliberate tap.
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) chooseLink(pasteUrl)
                  }}
                  onBlur={(e) => {
                    const text = pasteUrl
                    // Leaving the field finishes a COMPLETE link only. A partial
                    // one stays in the field exactly as typed.
                    if (!isFinishedLink(text)) return
                    // Pressed one of the step's own controls: its action wins,
                    // and the link stays in the field (see `press`).
                    if (press.current === "step") return
                    // Tabbed to one of them: the same, for the keyboard.
                    if (
                      press.current === "none" &&
                      e.relatedTarget instanceof Node &&
                      rootRef.current?.contains(e.relatedTarget) === true
                    ) return
                    // Pressed anything else: choose it once that press's click
                    // has landed, never before.
                    if (press.current === "other") {
                      afterPress.current = () => chooseLink(text)
                      return
                    }
                    // The keyboard's Done, an app switch: finished now.
                    chooseLink(text)
                  }}
                  placeholder="https://example.com/manual.pdf"
                  maxLength={2048}
                  autoFocus
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  If the site asks you to sign in, download the PDF and choose the file instead.
                </p>
                {/* HH-129: "For add a link to the manual where is the link that
                    says search on Google? It will drop on a search results page
                    that has the brand and model name and manual as part of the
                    search pre-populated."
                    A bridge, not a feature. If she is going to search anyway,
                    hand over the query instead of making her retype the model.
                    It lives HERE rather than as a fourth source because what it
                    produces is a link to paste — it must not read as another
                    way to add a manual, which is the ranking HH-109 fixed. */}
                {searchQuery && (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex h-10 w-full items-center justify-center rounded-md border border-primary px-3 text-[13px] font-semibold text-primary"
                  >
                    Search Google for this manual
                  </a>
                )}
                {searchQuery && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Opens a search for &ldquo;{searchQuery}&rdquo;.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Last, and badged. It has produced the wrong document twice in beta
              (HH-73, HH-107); saying so here is where someone actually decides
              whether to use it. */}
          {canSearch && (
            <div className="mt-1 border-t pt-3.5">
              <button
                type="button"
                onClick={() => setOpen(open === "search" ? "none" : "search")}
                aria-expanded={open === "search"}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <span className="flex items-center gap-2">
                    <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-[15px] font-semibold text-muted-foreground">Let us find it</span>
                    <span className="rounded-full bg-[var(--hh-gold-soft)] px-2 py-0.5 text-xs font-medium text-[var(--hh-gold)]">
                      Beta
                    </span>
                  </span>
                  {/* The owner asked for "a lot of commentary". A feature that
                      has returned the wrong document twice in beta should say
                      HOW it goes wrong, where someone decides to use it. */}
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    A last resort. It often returns the wrong document — a parts list, a spec sheet, the
                    wrong model — and a wrong manual becomes wrong upkeep. Check anything it finds before
                    you scan.
                  </p>
                </div>
                {open === "search" ? (
                  <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                )}
              </button>
              {open === "search" && (
                <div className="mt-3">
                  <FindManualCard
                    brand={brand!}
                    model={model!}
                    disabled={isSaving}
                    autoStart={autoFindManuals}
                    onPick={(url) => {
                      setFile(null)
                      setPasteUrl(url)
                      chooseLink(url)
                      setOpen("none")
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {fileError && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          {fileError}
        </div>
      )}

      {/* HH-124. Hitting the daily ceiling is not an error the user caused, so
          it stops rendering as one: no destructive red, no "Try again" that
          would fail identically, and no "midnight UTC" — our clock, not theirs.
          The manual is already saved and the scan is queued, so this states a
          fact rather than a refusal. */}
      {error && isCapacityRefusal(error) && (() => {
        const notice = capacityNotice(error)
        return (
          <div className="flex flex-col gap-3 rounded-2xl bg-[var(--hh-gold-soft)] p-4">
            <div className="flex items-start gap-2.5">
              <ClockIcon className="mt-0.5 size-5 shrink-0 text-[var(--hh-gold)]" />
              <div className="min-w-0">
                <p className="text-base font-semibold">{notice.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{notice.body}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--hh-gold-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--hh-gold)] ring-1 ring-[var(--hh-gold)]/30">
                {notice.chip}
              </span>
              <span className="text-xs text-muted-foreground">{notice.eta}</span>
            </div>
          </div>
        )
      })()}

      {error && !isCapacityRefusal(error) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-1.5 font-medium underline underline-offset-2 hover:opacity-80"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scan, not parse — and never "read", which would suggest the app is
          opening the manual for the user to read themselves. */}
      {/* HH-115: no Scan button before there is anything to scan. A permanently
          dimmed primary is what made the owner read this screen as broken, and
          it competed with the upload card for the eye. */}
      {/* HH-131: "In this scenario, where all scanning capacity is used up. It
          doesn't make sense to have the scan the manual button be active. It
          should be inactivated and it's not clear if the user has to do
          anything to trigger the scan to happen again."
          Both halves. The button stops offering an action that cannot happen,
          and it says the thing she actually asked: nobody has to come back for
          it. That promise is only sayable because HH-124's retry job now
          exists — before it, this would have been a lie. */}
      <div className="mt-2 flex flex-col gap-2">
        {canContinue && atCapacity && (
          <>
            <Button disabled className="w-full">
              Scanning resumes later
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Saved and queued. It starts on its own &mdash; you don&rsquo;t need to come back for it.
            </p>
          </>
        )}
        {canContinue && !atCapacity && (
          <Button
            onClick={handleContinue}
            disabled={isSaving || !!docClassification}
            className="w-full"
          >
            {isSaving ? (savingMessage ?? "Uploading…") : "Scan the manual"}
          </Button>
        )}
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={isSaving} className="w-full">
            I&apos;ll add it later
          </Button>
        )}
        {onBack && (
          <Button variant="ghost" onClick={onBack} disabled={isSaving} className="w-full text-muted-foreground">
            Back
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) validateAndSetFile(f)
          e.target.value = ""
        }}
      />
    </div>
  )
}
