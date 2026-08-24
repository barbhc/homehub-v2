import { useState, useRef, useCallback } from "react"
import {
  FileTextIcon,
  UploadIcon,
  XIcon,
  AlertCircleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  SearchIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MAX_UPLOAD_BYTES } from "@/modules/inventory/services/storageService"
import { cn } from "@/lib/utils"
import type { DocType } from "@/modules/knowledge"

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
  isSaving: boolean
  savingMessage?: string
  error: string | null
  onRetry?: () => void
  docClassification?: ManualDocClassification | null
  onDocClassificationUseAnyway?: () => void
  onDocClassificationReplace?: () => void
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

type OpenPanel = "none" | "url" | "search"

export function ManualStep({
  onConfirm,
  onSkip,
  isSaving,
  savingMessage,
  error,
  onRetry,
  docClassification,
  onDocClassificationUseAnyway,
  onDocClassificationReplace,
  brand,
  model,
}: ManualStepProps) {
  const [autoFindManuals] = useAutoFindManuals()
  const [open, setOpen] = useState<OpenPanel>("none")
  const [pasteUrl, setPasteUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const maxMB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)
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
      setFile(f)
      setPasteUrl("")
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

  // A source is chosen when there is a file OR a URL. The URL covers both
  // pasting and picking a search result, which fills the same field.
  const canContinue = !!file || pasteUrl.trim().length > 0

  const handleContinue = () => {
    if (docClassification) return
    if (file) onConfirm([{ type: "upload", file }])
    else if (pasteUrl.trim()) onConfirm([{ type: "url", url: pasteUrl.trim() }])
  }

  const clearChoice = () => {
    setFile(null)
    setPasteUrl("")
    setFileError(null)
  }

  return (
    <div className="flex flex-col gap-4">
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

          {/* Mobile lead: choosing a file, and the only filled control here. */}
          <div className="rounded-xl border border-primary bg-card p-4 shadow-sm md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold">Choose a file</p>
                <p className="mt-0.5 text-xs text-muted-foreground">A PDF from your phone or iCloud</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                Browse
              </Button>
            </div>
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
                  onChange={(e) => setPasteUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canContinue && handleContinue()}
                  placeholder="https://example.com/manual.pdf"
                  maxLength={2048}
                  autoFocus
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  If the site asks you to sign in, download the PDF and choose the file instead.
                </p>
              </div>
            )}
          </div>

          {/* Last, and badged. It has produced the wrong document twice in beta
              (HH-73, HH-107); saying so here is where someone actually decides
              whether to use it. */}
          {canSearch && (
            <div className="rounded-xl border bg-card shadow-sm">
              <button
                type="button"
                onClick={() => setOpen(open === "search" ? "none" : "search")}
                aria-expanded={open === "search"}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <div className="min-w-0">
                  <span className="flex items-center gap-2">
                    <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-base font-semibold">Find it for me</span>
                    <span className="rounded-full bg-[var(--hh-gold-soft)] px-2 py-0.5 text-xs font-medium text-[var(--hh-gold)]">
                      Beta
                    </span>
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Often returns the wrong document. Check it before you scan.
                  </p>
                </div>
                {open === "search" ? (
                  <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                )}
              </button>
              {open === "search" && (
                <div className="border-t p-4">
                  <FindManualCard
                    brand={brand!}
                    model={model!}
                    disabled={isSaving}
                    autoStart={autoFindManuals}
                    onPick={(url) => {
                      setFile(null)
                      setPasteUrl(url)
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

      {error && (
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
      <div className="mt-2 flex flex-col gap-2">
        <Button
          onClick={handleContinue}
          disabled={!canContinue || isSaving || !!docClassification}
          className="w-full"
        >
          {isSaving ? (savingMessage ?? "Uploading…") : "Scan the manual"}
        </Button>
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={isSaving} className="w-full">
            I&apos;ll add it later
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
