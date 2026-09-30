import { useState } from "react"
import type { AddManualMode } from "@/hooks/useManualManagement"
import {
  BookOpenIcon,
  CheckIcon,
  FileTextIcon,
  FileXIcon,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ManualStep, type ManualSourceChoice } from "@/components/smart-add/ManualStep"
import { useManualUrls, isDeadLegacyManualUrl } from "@/hooks/useManualManagement"
import { updateManualLabel } from "@/modules/knowledge"
import { isAwaitingReview, isReading } from "@/lib/manualReviewState"
import { requestReview } from "@/lib/reviewRequest"
import type { ManualDocument } from "@/integrations/types"

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
  /** Brand + model feed the "search the web" fallback link in the add dialog. */
  brand?: string | null
  model?: string | null
  /** The item's LIVE manuals (useItemManuals) — a relabel, a read or a delete
   *  arrives here on its own, so nothing is patched by hand (HH-161). */
  manuals: ManualDocument[]
  // Manual management hook values
  addManualOpen: boolean
  setAddManualOpen: (open: boolean) => void
  /** Set by the door that opened the dialog; picks ManualStep's first panel. */
  addMode: AddManualMode
  addRole: "primary" | "reference"
  setAddRole: (role: "primary" | "reference") => void
  titleInput: string
  setTitleInput: (v: string) => void
  labelInput: string
  setLabelInput: (v: string) => void
  addError: string | null
  setAddError: (v: string | null) => void
  addLoading: boolean
  parsePhase: boolean
  parsingManualId: string | null
  deletingManualId: string | null
  handleOpenAddManual: (mode?: AddManualMode) => void
  handleAddManual: (choice: ManualSourceChoice) => Promise<void>
  /** "Read the manual" / "Read again": a preview read that ends in the item's
   *  hand-off card — this section opens no review of its own (HH-120). */
  handleReadManual: (id: string) => void
  handleFillGaps: (id: string) => void
  handleDeleteManual: (id: string) => void
}

export function ManualSection({
  homeId,
  brand,
  model,
  manuals,
  addManualOpen,
  setAddManualOpen,
  addMode,
  addRole,
  setAddRole,
  addError,
  setAddError,
  addLoading,
  parsePhase,
  parsingManualId,
  deletingManualId,
  handleOpenAddManual,
  handleAddManual,
  handleReadManual,
  handleFillGaps,
  handleDeleteManual,
}: ManualSectionProps) {
  const primaryManuals = manuals.filter((m) => m.role !== "reference")
  const referenceManuals = manuals.filter((m) => m.role === "reference")
  const manualUrls = useManualUrls(manuals)

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
    // The live list carries the new label; a failed write leaves the old one
    // showing, and is logged with what it was for.
    if (result.error) console.error(`[manuals] could not relabel ${manualId}:`, result.error.message)
    cancelEditLabel()
  }

  const renderManualRow = (m: ManualDocument) => {
    const url = manualUrls[m.manual_id] ?? null
    // A v1 upload whose Supabase file died in the migration — the PDF is gone
    // (tapping through used to dead-end in Safari), but parsed chunks survived.
    const isDeadManual = isDeadLegacyManualUrl(m.source_type, m.source_ref)
    const isRef = m.role === "reference"
    const Icon = isRef ? BookOpenIcon : FileTextIcon
    const isEditingLabel = editingLabelId === m.manual_id
    // Being read: the live stage says so, and the moment between the tap and
    // the worker's first write is covered by the hook's own flag.
    const isBusy = parsingManualId === m.manual_id || isReading(m)
    const awaitingReview = isAwaitingReview(m)
    const isDeleting = deletingManualId === m.manual_id
    // The "default"/primary indicator is only meaningful with 2+ manuals.
    const showPrimaryDefault = manuals.length > 1 && !isRef
    // Build the meta line: "<label> · <Reference|—>[ · default]"
    const metaParts: string[] = []
    if (m.label) metaParts.push(m.label)
    if (isRef) metaParts.push("Reference")
    if (showPrimaryDefault) metaParts.push("default")
    // Where this manual's read stands, in words — the pill and the Upkeep card
    // carry the live indicator; this row only names the state (HH-161).
    if (isBusy) metaParts.push("Reading…")
    else if (awaitingReview) metaParts.push("Read — not saved")
    return (
      <li
        key={m.manual_id}
        className="rounded-xl border p-3.5 text-sm"
        style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
      >
        {/* Header: icon + (wrapping) filename & meta + overflow menu */}
        <div className="flex items-start gap-3">
          {/* HH-89: "I'm not sure what this gray square icon is." Fair — it
              was an icon tile that said nothing. A labelled tag says what the
              row IS: the file kind for manuals, an open book for references. */}
          <div
            className="flex h-9 min-w-9 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1"
            style={{ background: "var(--hh-clay-soft)" }}
          >
            <Icon className="size-3.5" style={{ color: "var(--hh-clay)" }} />
            <span className="text-[8px] font-bold leading-none tracking-wide" style={{ color: "var(--hh-clay)" }}>
              {isRef ? "REF" : m.source_type === "upload" ? "PDF" : "LINK"}
            </span>
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

          {/* The overflow menu. The countdown bar that sat here ("~28 sec
              remaining") is retired: it was an estimate, the worker reports a
              page count and never its position, and the page's one indicator
              is the pill (HH-161). */}
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
              {awaitingReview ? (
                // Read, and waiting for its review: the review is the next
                // step, not another read — which would throw this one away.
                // It opens the item's one review, on this page.
                <DropdownMenuItem onClick={() => requestReview(m.manual_id)}>
                  <CheckIcon className="size-4" />
                  Review what we found
                </DropdownMenuItem>
              ) : m.parsed_at ? (
                <>
                  {!isRef && (
                    <DropdownMenuItem
                      disabled={isBusy}
                      onClick={() => handleFillGaps(m.manual_id)}
                      className="items-start gap-2"
                    >
                      <SparklesIcon className="mt-0.5 size-4" />
                      <span className="flex flex-col">
                        <span>{isBusy ? "Reading…" : "Fill gaps"}</span>
                        <span className="text-xs" style={{ color: "var(--hh-faint)" }}>
                          find missing tasks &amp; specs
                        </span>
                      </span>
                    </DropdownMenuItem>
                  )}
                  {/* "Rescan" / "Re-ingest" before HH-161, and a commit with no
                      review. Now a read that ends in the review. */}
                  <DropdownMenuItem disabled={isBusy} onClick={() => handleReadManual(m.manual_id)}>
                    <RefreshCwIcon className="size-4" />
                    {isBusy ? "Reading…" : "Read again"}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem disabled={isBusy} onClick={() => handleReadManual(m.manual_id)}>
                  <SparklesIcon className="size-4" />
                  {/* Was "Parse" — developer jargon in the one menu a person
                      opens to ask for this (scanCopy's vocabulary rule). */}
                  {isBusy ? "Reading…" : "Read the manual"}
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

        {/* Full-width primary "Open manual" button — or an honest "file gone"
            notice for v1 manuals whose Supabase upload didn't survive the
            migration (linking to it just dead-ends in the browser). */}
        {isDeadManual ? (
          <div
            className="mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs"
            style={{ borderColor: "var(--hh-line)", color: "var(--hh-sub)" }}
          >
            <FileXIcon className="mt-0.5 size-4 shrink-0" style={{ color: "var(--hh-faint)" }} />
            <div className="min-w-0">
              <p className="font-semibold" style={{ color: "var(--hh-ink)" }}>Original file unavailable</p>
              <p className="mt-0.5 leading-snug">
                This PDF was lost in an earlier system migration. Its saved details still power chat and care tips —
                re-upload the file to reopen it here.
              </p>
              <button
                type="button"
                onClick={() => handleOpenAddManual("upload")}
                className="mt-1.5 font-semibold underline underline-offset-2"
                style={{ color: "var(--hh-teal-deep)" }}
              >
                Re-upload PDF
              </button>
            </div>
          </div>
        ) : url ? (
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
        ) : null}

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
              {/* HH-89, owner's pick A + the find lane. When the section is
                  EMPTY this is the moment the whole product hinges on, so the
                  upload target is an unmistakable drop-zone rather than a text
                  field that reads as a label — and every lane is named at its
                  real weight, the beta search included. With manuals present
                  the compact button returns; the hinge moment has passed. */}
              {manuals.length === 0 ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => handleOpenAddManual("upload")}
                    className="w-full rounded-xl border-2 border-dashed px-4 py-5 text-center"
                    style={{ borderColor: "var(--hh-teal)", background: "var(--hh-teal-wash)" }}
                  >
                    <span
                      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold"
                      style={{ borderColor: "var(--hh-line2)", background: "var(--hh-surface)", color: "var(--hh-clay)" }}
                    >
                      PDF
                    </span>
                    <span className="mt-2 block text-[14px] font-bold" style={{ color: "var(--hh-teal)" }}>
                      Upload the manual
                    </span>
                    <span className="mt-0.5 block text-[12px]" style={{ color: "var(--hh-sub)" }}>
                      Tap to choose the PDF from your phone
                    </span>
                  </button>
                  <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => handleOpenAddManual("url")}>
                    Paste a link instead
                  </Button>
                  {brand && model && (
                    // HH-89: tapping it IS the ask, so the dialog opens with the
                    // search panel already expanded rather than making them ask
                    // twice. The mode is set on every open, so it is one-shot by
                    // construction — the next door opens on its own panel.
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1.5 w-full text-muted-foreground"
                      onClick={() => handleOpenAddManual("search")}
                    >
                      Find it for me ·&nbsp;
                      <span className="rounded-full border px-1.5 text-[10px] font-bold" style={{ borderColor: "var(--hh-line2)" }}>Beta</span>
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => handleOpenAddManual("upload")}
                >
                  {/* Not "Add the manual": this item has one, and a page that
                      offers to add the manual it is reading contradicts itself
                      (HH-161). This door adds a second document. */}
                  Add another manual
                </Button>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SectionCard>

      {/* Add manual dialog. Radix calls onOpenChange only when the user CLOSES
          it; every open goes through handleOpenAddManual, which is where the
          last attempt's error, role and panel are reset (HH-159). */}
      <Dialog open={addManualOpen} onOpenChange={setAddManualOpen}>
        <DialogContent aria-describedby={undefined} className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add the manual</DialogTitle>
          </DialogHeader>
          {/*
            HH-126. This dialog used to be its own design: Link selected first,
            "Find it for me" in a prominent card, and Document type + Label asked
            BEFORE a file existed. That is the ranking HH-109 and HH-115 were
            about — fixed in the wizard, still live here, because the redesign
            reached one door of two.

            It renders the wizard's own ManualStep now. Not a copy of it: the
            same component, so the next time the ranking changes it changes on
            both doors at once. This is the HH-119 lesson applied before it
            becomes a report.

            Document type and label move AFTER a source is chosen — they were
            asking the user to classify a document they had not picked yet.
          */}
          <ManualStep
            initialPanel={addMode === "upload" ? undefined : addMode}
            brand={brand ?? undefined}
            model={model ?? undefined}
            isSaving={addLoading}
            savingMessage={parsePhase ? "Reading the manual\u2026" : undefined}
            error={addError}
            onRetry={() => setAddError(null)}
            // HH-159: what the user picked goes over as the argument. This used
            // to set mode/URL/file in state and call handleAddManual a
            // microtask later — whose closure was the previous render's, so it
            // read the state from BEFORE the pick.
            onConfirm={(choices) => {
              if (choices[0]) void handleAddManual(choices[0])
            }}
          />
          <div className="mt-4 border-t border-border pt-3">
            <Label className="text-xs text-muted-foreground mb-1.5 block">What is this document?</Label>
            <div className="flex gap-2">
              <Button variant={addRole === "primary" ? "default" : "outline"} size="sm" onClick={() => setAddRole("primary")}>
                <FileTextIcon className="size-4 mr-1" />
                Owner manual
              </Button>
              <Button variant={addRole === "reference" ? "default" : "outline"} size="sm" onClick={() => setAddRole("reference")}>
                <BookOpenIcon className="size-4 mr-1" />
                Reference doc
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {addRole === "reference"
                ? "Reference docs are searchable in chat but won\u2019t generate upkeep."
                : "Owner manuals generate the upkeep schedule. Change this if it\u2019s a recipe book or a guide."}
            </p>
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}
