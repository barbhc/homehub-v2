import { useState } from "react"
import {
  BookOpenIcon,
  CheckIcon,
  FileTextIcon,
  FileUpIcon,
  LinkIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SparklesIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { SectionCard, EmptyState } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ManualParseProgress } from "@/components/manuals/ManualParseProgress"
import { ManualParseReviewSheet } from "@/components/manuals/ManualParseReviewSheet"
import { getManualUrl } from "@/hooks/useManualManagement"
import { updateManualLabel } from "@/modules/knowledge"
import type { ManualDocument } from "@/integrations/types"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"

const LABEL_PRESETS = [
  "Owner's Manual",
  "Warranty Card",
  "Install Guide",
  "Quick Start Guide",
  "Spec Sheet",
  "Parts List",
  "Recipe Book",
]

interface ManualSectionProps {
  homeId: string
  manuals: ManualDocument[]
  onManualUpdated: (updated: ManualDocument) => void
  // Manual management hook values
  addManualOpen: boolean
  setAddManualOpen: (open: boolean) => void
  addMode: "url" | "upload"
  setAddMode: (mode: "url" | "upload") => void
  addRole: "primary" | "reference"
  setAddRole: (role: "primary" | "reference") => void
  urlInput: string
  setUrlInput: (v: string) => void
  titleInput: string
  setTitleInput: (v: string) => void
  labelInput: string
  setLabelInput: (v: string) => void
  setUploadFile: (file: File | null) => void
  addError: string | null
  setAddError: (v: string | null) => void
  addLoading: boolean
  parsePhase: boolean
  setManualParseError: (v: string | null) => void
  parsingManualId: string | null
  parsedManualId: string | null
  setParsedManualId: (v: string | null) => void
  previewResult: PreviewResult | null
  setPreviewResult: (v: PreviewResult | null) => void
  reviewOpen: boolean
  setReviewOpen: (v: boolean) => void
  saving: boolean
  deletingManualId: string | null
  handleOpenAddManual: () => void
  handleAddManual: () => void
  handleParseExistingManual: (id: string) => void
  handleRescanManual: (id: string) => void
  handleFillGaps: (id: string) => void
  handleDeleteManual: (id: string) => void
  handleSave: (tasks: PreviewTask[], chunks: PreviewChunk[]) => Promise<string | null>
}

export function ManualSection({
  homeId,
  manuals,
  onManualUpdated,
  addManualOpen,
  setAddManualOpen,
  addMode,
  setAddMode,
  addRole,
  setAddRole,
  urlInput,
  setUrlInput,
  titleInput,
  setTitleInput,
  labelInput,
  setLabelInput,
  setUploadFile,
  addError,
  setAddError,
  addLoading,
  parsePhase,
  setManualParseError,
  parsingManualId,
  parsedManualId,
  setParsedManualId,
  previewResult,
  setPreviewResult,
  reviewOpen,
  setReviewOpen,
  saving,
  deletingManualId,
  handleOpenAddManual,
  handleAddManual,
  handleParseExistingManual,
  handleRescanManual,
  handleFillGaps,
  handleDeleteManual,
  handleSave,
}: ManualSectionProps) {
  const primaryManuals = manuals.filter((m) => m.role !== "reference")
  const referenceManuals = manuals.filter((m) => m.role === "reference")

  // Inline label editing state
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState("")
  const [savingLabelId, setSavingLabelId] = useState<string | null>(null)
  const [customLabelMode, setCustomLabelMode] = useState(false)

  const startEditLabel = (m: ManualDocument) => {
    setEditingLabelId(m.manual_id)
    setLabelDraft(m.label ?? "")
    setCustomLabelMode(!m.label || !LABEL_PRESETS.includes(m.label))
  }

  const cancelEditLabel = () => {
    setEditingLabelId(null)
    setLabelDraft("")
    setCustomLabelMode(false)
  }

  const saveLabel = async (manualId: string, valueOverride?: string) => {
    const value = (valueOverride !== undefined ? valueOverride : labelDraft).trim() || null
    setSavingLabelId(manualId)
    const result = await updateManualLabel(homeId, manualId, value)
    setSavingLabelId(null)
    if (result.data) onManualUpdated(result.data)
    cancelEditLabel()
  }

  const renderManualRow = (m: ManualDocument) => {
    const url = getManualUrl(m.source_type, m.source_ref)
    const isRef = m.role === "reference"
    const Icon = isRef ? BookOpenIcon : FileTextIcon
    const isEditingLabel = editingLabelId === m.manual_id
    const isBusy = parsingManualId === m.manual_id
    const isDeleting = deletingManualId === m.manual_id
    // The "default"/primary indicator is only meaningful with 2+ manuals.
    const showPrimaryDefault = manuals.length > 1 && !isRef
    // Build the meta line: "<label> · <Reference|—>[ · default]"
    const metaParts: string[] = []
    if (m.label) metaParts.push(m.label)
    if (isRef) metaParts.push("Reference")
    if (showPrimaryDefault) metaParts.push("default")
    return (
      <li
        key={m.manual_id}
        className="rounded-xl border p-3.5 text-sm"
        style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
      >
        {/* Header: icon + (wrapping) filename & meta + overflow menu */}
        <div className="flex items-start gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--hh-clay-soft)" }}
          >
            <Icon className="size-4" style={{ color: "var(--hh-clay)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="font-medium leading-snug [text-wrap:pretty]"
              style={{ color: "var(--hh-ink)" }}
            >
              {m.title}
            </div>
            {metaParts.length > 0 && (
              <div className="mt-0.5 text-xs" style={{ color: "var(--hh-sub)" }}>
                {metaParts.join(" · ")}
              </div>
            )}
          </div>

          {/* Live parse progress, then the overflow menu */}
          <ManualParseProgress isActive={isBusy} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 w-9 shrink-0 p-0"
                style={{ color: "var(--hh-faint)" }}
                aria-label="Manual actions"
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {m.parsed_at ? (
                <>
                  {!isRef && (
                    <DropdownMenuItem
                      disabled={isBusy}
                      onClick={() => handleFillGaps(m.manual_id)}
                      className="items-start gap-2"
                    >
                      <SparklesIcon className="mt-0.5 size-4" />
                      <span className="flex flex-col">
                        <span>{isBusy ? "Scanning…" : "Fill gaps"}</span>
                        <span className="text-xs" style={{ color: "var(--hh-faint)" }}>
                          find missing tasks &amp; specs
                        </span>
                      </span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={isBusy}
                    onClick={() =>
                      isRef
                        ? handleParseExistingManual(m.manual_id)
                        : handleRescanManual(m.manual_id)
                    }
                  >
                    <RefreshCwIcon className="size-4" />
                    {isRef ? "Re-ingest" : "Rescan"}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  disabled={isBusy}
                  onClick={() => handleParseExistingManual(m.manual_id)}
                >
                  <SparklesIcon className="size-4" />
                  Parse
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => startEditLabel(m)}>
                <TagIcon className="size-4" />
                Relabel
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={isDeleting}
                onClick={() => handleDeleteManual(m.manual_id)}
              >
                {isDeleting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Full-width primary "Open manual" button */}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--hh-teal-wash)", color: "var(--hh-teal-deep)" }}
          >
            <BookOpenIcon className="size-4" />
            Open manual
          </a>
        )}

        {/* Inline label editor */}
        {isEditingLabel && (
          <div className="mt-3 flex flex-col gap-2">
            {/* Preset chips */}
            <div className="flex flex-wrap gap-1">
              {LABEL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setLabelDraft(preset)
                    setCustomLabelMode(false)
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    labelDraft === preset && !customLabelMode
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomLabelMode(true)}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  customLabelMode
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-foreground/40"
                }`}
              >
                Custom…
              </button>
            </div>
            {customLabelMode && (
              <Input
                autoFocus
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                placeholder="e.g. Installation guide"
                className="h-7 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveLabel(m.manual_id)
                  if (e.key === "Escape") cancelEditLabel()
                }}
              />
            )}
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => saveLabel(m.manual_id)}
                disabled={savingLabelId === m.manual_id}
                className="h-7 px-2.5 text-xs gap-1"
              >
                {savingLabelId === m.manual_id
                  ? <Loader2Icon className="size-3 animate-spin" />
                  : <CheckIcon className="size-3" />}
                Save
              </Button>
              {m.label && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => saveLabel(m.manual_id, "")}
                  className="h-7 px-2 text-xs text-muted-foreground"
                >
                  Remove label
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEditLabel}
                className="h-7 w-7 p-0"
                aria-label="Cancel"
              >
                <XIcon className="size-3" />
              </Button>
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <>
      <SectionCard className="px-4 sm:px-6 py-0">
        <Accordion type="single" collapsible>
          <AccordionItem value="manuals" className="border-b-0">
            <AccordionTrigger>
              <span className="flex items-center gap-2 flex-1">
                Manuals & References
                <span className="text-muted-foreground text-sm font-normal">({manuals.length})</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {manuals.length === 0 ? (
                <EmptyState
                  title="No manuals"
                  description="Add a PDF or link to the manual to see care instructions and troubleshooting."
                />
              ) : (
                <div className="space-y-3">
                  {primaryManuals.length > 0 && (
                    <ul className="space-y-2">
                      {primaryManuals.map(renderManualRow)}
                    </ul>
                  )}
                  {referenceManuals.length > 0 && (
                    <div>
                      {primaryManuals.length > 0 && (
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Reference documents</p>
                      )}
                      <ul className="space-y-2">
                        {referenceManuals.map(renderManualRow)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={handleOpenAddManual}
              >
                Add manual or reference
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SectionCard>

      {/* Add manual dialog */}
      <Dialog
        open={addManualOpen}
        onOpenChange={(open) => {
          setAddManualOpen(open)
          if (open) {
            setAddError(null)
            setManualParseError(null)
          }
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add manual or reference</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Role toggle */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Document type</Label>
              <div className="flex gap-2">
                <Button
                  variant={addRole === "primary" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAddRole("primary")}
                >
                  <FileTextIcon className="size-4 mr-1" />
                  Owner manual
                </Button>
                <Button
                  variant={addRole === "reference" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAddRole("reference")}
                >
                  <BookOpenIcon className="size-4 mr-1" />
                  Reference doc
                </Button>
              </div>
              {addRole === "reference" && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Reference docs (recipe books, guides, etc.) are searchable in chat but won't generate tasks.
                </p>
              )}
            </div>

            {/* Source toggle */}
            <div className="flex gap-2">
              <Button
                variant={addMode === "url" ? "default" : "outline"}
                size="sm"
                onClick={() => setAddMode("url")}
              >
                <LinkIcon className="size-4 mr-1" />
                Link
              </Button>
              <Button
                variant={addMode === "upload" ? "default" : "outline"}
                size="sm"
                onClick={() => setAddMode("upload")}
              >
                <FileUpIcon className="size-4 mr-1" />
                Upload PDF
              </Button>
            </div>

            {addMode === "url" && (
              <>
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Label htmlFor="manual-url">URL</Label>
                    <InfoTooltip message="Some manufacturer websites require a login session to serve PDFs and will return an error when parsed. If parsing fails, download the PDF and upload it directly instead." />
                  </div>
                  <Input
                    id="manual-url"
                    type="url"
                    placeholder="https://..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-title">Title (optional)</Label>
                  <Input
                    id="manual-title"
                    placeholder="e.g. User manual"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                  />
                </div>
              </>
            )}

            {addMode === "upload" && (
              <>
                <div>
                  <Label htmlFor="manual-file">PDF file</Label>
                  <Input
                    id="manual-file"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-title-upload">Title (optional)</Label>
                  <Input
                    id="manual-title-upload"
                    placeholder="Defaults to filename"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Label — shown for both modes */}
            <div>
              <Label htmlFor="manual-label" className="block mb-1.5">
                Label <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {LABEL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLabelInput(labelInput === preset ? "" : preset)}
                    className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                      labelInput === preset
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-foreground/40"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <Input
                id="manual-label"
                placeholder="Custom label…"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
              />
            </div>

            {addError && <p className="text-sm text-destructive">{addError}</p>}
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={handleAddManual} disabled={addLoading}>
              {addLoading && <Loader2Icon className="size-4 mr-2 animate-spin" />}
              {parsePhase
                ? addRole === "reference" ? "Ingesting..." : "Parsing manual..."
                : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parse review sheet */}
      {previewResult && (
        <ManualParseReviewSheet
          open={reviewOpen}
          onOpenChange={(open) => {
            setReviewOpen(open)
            if (!open) {
              setPreviewResult(null)
              setParsedManualId(null)
            }
          }}
          manualTitle={manuals.find((m) => m.manual_id === parsedManualId)?.title ?? "Manual"}
          previewData={previewResult}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </>
  )
}
