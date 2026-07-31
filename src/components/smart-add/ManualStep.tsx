import { useState, useRef, useCallback } from "react"
import { FileTextIcon, LinkIcon, UploadIcon, XIcon, AlertCircleIcon } from "lucide-react"
import { SectionCard } from "@/components/layout"
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
  const [mode, setMode] = useState<"url" | "upload">("upload")
  const [pasteUrl, setPasteUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const maxMB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)

  const validateAndSetFile = useCallback((f: File) => {
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
  }, [maxMB])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped)
  }, [validateAndSetFile])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const canContinue =
    (mode === "url" && pasteUrl.trim().length > 0) ||
    (mode === "upload" && !!file)

  const handleContinue = () => {
    if (docClassification) return
    if (mode === "url" && pasteUrl.trim()) {
      onConfirm([{ type: "url", url: pasteUrl.trim() }])
    } else if (mode === "upload" && file) {
      onConfirm([{ type: "upload", file }])
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {docClassification && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p>
            Looks like a <strong>{docTypeLabel(docClassification.docType)}</strong>. Want to upload the owner&apos;s
            manual instead? <span className="text-muted-foreground opacity-90">({docClassification.filename})</span>
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

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border/50 w-fit">
        {(["upload", "url"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setFileError(null) }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150",
              mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "upload"
              ? <><UploadIcon className="size-3.5" /> Upload PDF</>
              : <><LinkIcon className="size-3.5" /> Paste URL</>
            }
          </button>
        ))}
      </div>

      {/* The fast path: we already know brand + model, so offer to find the PDF
          rather than sending the user off to a manufacturer site. Upload and
          paste-URL stay directly below as the always-available fallback. */}
      {brand && model && (
        <div className="mb-3">
          <FindManualCard
            brand={brand}
            model={model}
            disabled={isSaving}
            onPick={(url) => {
              setMode("url")
              setPasteUrl(url)
            }}
          />
        </div>
      )}

      {/* Upload mode */}
      {mode === "upload" && (
        <SectionCard className="p-0 overflow-hidden">
          {file ? (
            /* Selected file state */
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileTextIcon className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(file.size / 1024 / 1024).toFixed(1)} MB · PDF
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); setFileError(null) }}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Remove file"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          ) : (
            /* Drop zone */
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex flex-col items-center justify-center gap-3 px-6 py-12 cursor-pointer transition-colors",
                dragging
                  ? "bg-primary/5 border-2 border-dashed border-primary/40"
                  : "hover:bg-muted/30"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                dragging ? "bg-primary/15" : "bg-muted"
              )}>
                <UploadIcon className={cn("size-5", dragging ? "text-primary" : "text-muted-foreground")} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {dragging ? "Drop your PDF here" : "Drop your PDF here, or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Owner's manual · max {maxMB} MB</p>
              </div>
            </div>
          )}

          {fileError && (
            <div className="flex items-center gap-2 px-5 py-3 border-t border-border/50 bg-destructive/5 text-sm text-destructive">
              <AlertCircleIcon className="size-4 shrink-0" />
              {fileError}
            </div>
          )}
        </SectionCard>
      )}

      {/* URL mode */}
      {mode === "url" && (
        <SectionCard className="p-5">
          <label className="text-sm font-medium block mb-2" htmlFor="manual-url">
            Manual URL
          </label>
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
          <p className="text-xs text-muted-foreground mt-2">
            Link directly to a .pdf file. If the site requires a login, download the PDF and upload it instead.
          </p>
        </SectionCard>
      )}

      {/* API / parse error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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

      {/* Actions */}
      <div className="flex items-center gap-3">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={isSaving}>
            Skip for now
          </Button>
        )}
        <Button
          onClick={handleContinue}
          disabled={!canContinue || isSaving || !!docClassification}
          className="gap-2"
        >
          {isSaving ? (savingMessage ?? "Uploading…") : "Analyze Manual →"}
        </Button>
      </div>

      {/* Hidden file input */}
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
