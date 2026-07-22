import { useState, useRef, useEffect, useMemo } from "react"
import { Camera, ChevronDown, Loader2, ShieldCheckIcon, BookOpenCheck, BellRingIcon, Sparkles, MapPin } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RoomSelector } from "@/components/smart-add/RoomSelector"
import { CategoryPicker } from "@/modules/inventory/components/CategoryPicker"
import { CategoryFields } from "@/modules/inventory/components/CategoryFields"
import { extractFromImage, isEmptyOcrExtraction, type OcrExtraction } from "@/modules/inventory/services/ocrService"
import { isNativePlatform, captureNativePhoto } from "@/lib/nativeCamera"
import { downscaleImage } from "@/lib/downscaleImage"
import { track } from "@/lib/analytics"
import {
  lookupProduct,
  type ProductLookupCandidate,
  type KnowledgeConfidence,
} from "@/modules/inventory/services/productLookupService"
import { ProductSuggestionCard } from "@/components/smart-add/ProductSuggestionCard"
import {
  mapApplianceTypeIdToCategory,
  mapOcrCategoryToTyped,
  getSubTypeLabel,
  legacyCategoryLabelFromItemCategory,
  suggestedRoomForSubType,
  type ItemCategoryId,
} from "@/modules/inventory/constants/itemCategories"
import { useCurrentHome, getRooms } from "@/modules/home"
import { cn } from "@/lib/utils"

export type IdentifyMode = "choice" | "photo" | "manual"

export type IdentifyData = {
  brand: string
  model: string
  name: string
  serialNumber: string
  itemCategory: ItemCategoryId | null
  subType: string | null
  categoryFields: Record<string, unknown>
  confidence: number
  locationId: string | null
  purchaseDate: string | null
  purchasePrice: number | null
}

type IdentifyStepProps = {
  mode: IdentifyMode
  data: IdentifyData
  onModeChange: (mode: IdentifyMode) => void
  onDataChange: (data: IdentifyData) => void
  onConfirm: () => void
  isCreating: boolean
  error: string | null
  onRetry?: () => void
  /** Latest snapped label photo (downscaled), or null when cleared — the
   *  parent attaches it to the item after creation. */
  onLabelPhoto?: (file: File | null) => void
}

export const DEFAULT_IDENTIFY_DATA: IdentifyData = {
  brand: "",
  model: "",
  name: "",
  serialNumber: "",
  itemCategory: null,
  subType: null,
  categoryFields: {},
  confidence: 0,
  locationId: null,
  purchaseDate: null,
  purchasePrice: null,
}

function mergeOcrCategory(raw: string | null | undefined): {
  itemCategory: ItemCategoryId | null
  subType: string | null
} {
  if (!raw?.trim()) return { itemCategory: null, subType: null }
  const fromTyped = mapOcrCategoryToTyped(raw)
  if (fromTyped.itemCategory && fromTyped.subType) return fromTyped
  const fromLegacy = mapApplianceTypeIdToCategory(raw.trim())
  if (fromLegacy.itemCategory && fromLegacy.subType) {
    return { itemCategory: fromLegacy.itemCategory, subType: fromLegacy.subType }
  }
  return fromTyped
}

function hasHiddenAutofill(d: IdentifyData): boolean {
  const cf = d.categoryFields
  const cfKeys = cf && typeof cf === "object" ? Object.keys(cf).filter((k) => {
    const v = (cf as Record<string, unknown>)[k]
    return v !== null && v !== undefined && v !== ""
  }) : []
  return (
    d.brand.trim().length > 0 ||
    d.model.trim().length > 0 ||
    d.serialNumber.trim().length > 0 ||
    (d.purchaseDate ?? "").trim().length > 0 ||
    d.purchasePrice != null ||
    cfKeys.length > 0
  )
}

export function IdentifyStep({
  mode,
  data,
  onModeChange,
  onDataChange,
  onConfirm,
  isCreating,
  error,
  onRetry,
  onLabelPhoto,
}: IdentifyStepProps) {
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)
  // "success" | "empty" (readable call, nothing extractable) | "extract_failed"
  // (the AI extraction call itself failed — not the photo's fault) | null (no
  // call yet / failed — ocrError carries failures). Drives the honest copy.
  const [ocrOutcome, setOcrOutcome] = useState<"success" | "empty" | "extract_failed" | null>(null)
  const [ocrFilledCount, setOcrFilledCount] = useState(0)
  const [ocrRawText, setOcrRawText] = useState<string | null>(null)
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false)
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string | null>(null)

  // Name-first quick add: infer category + a room hint from the typed name (reuses
  // the same text→category mapper as OCR) and surface them as one-tap chips.
  const { home } = useCurrentHome()
  const [quickRooms, setQuickRooms] = useState<Array<{ room_id: string; name: string }>>([])
  useEffect(() => {
    if (!home?.home_id) return
    getRooms(home.home_id).then((r) => setQuickRooms(r.data ?? []))
  }, [home?.home_id])
  const nameInference = useMemo(
    () => (data.name.trim().length >= 3 ? mapOcrCategoryToTyped(data.name) : { itemCategory: null, subType: null }),
    [data.name]
  )
  const suggestedRoom = useMemo(() => {
    const hint = suggestedRoomForSubType(nameInference.subType)
    if (!hint) return null
    const h = hint.toLowerCase()
    return quickRooms.find((r) => {
      const rn = r.name.toLowerCase()
      return rn.includes(h) || h.includes(rn)
    }) ?? null
  }, [nameInference.subType, quickRooms])
  // One-tap chips, only while the field they'd fill is still empty.
  const catChip: ItemCategoryId | null = !data.itemCategory ? nameInference.itemCategory : null
  const roomChip = !data.locationId ? suggestedRoom : null
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const extraImageRef = useRef<HTMLInputElement>(null)
  // Monotonic request id — protects against stale OCR responses overwriting
  // newer extractions when users retry quickly.
  const ocrRequestIdRef = useRef(0)

  // Product-lookup (brand+model → Claude spec suggestions) state.
  // Numeric specs from Claude are NEVER silently merged into the form —
  // the user must tap "Apply" per candidate in the ProductSuggestionCard.
  const [lookupCandidates, setLookupCandidates] = useState<ProductLookupCandidate[]>([])
  const [lookupConfidence, setLookupConfidence] = useState<KnowledgeConfidence>("low")
  const [appliedCandidateKeys, setAppliedCandidateKeys] = useState<Set<string>>(new Set())
  const [lookupLoading, setLookupLoading] = useState(false)
  const [dismissedLookupKey, setDismissedLookupKey] = useState<string | null>(null)
  const lookupRequestIdRef = useRef(0)
  const lastLookupKeyRef = useRef<string>("")
  // Keep a ref to the latest data so the debounced lookup callback can read
  // fresh values without forcing a re-subscribe on every keystroke.
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  })

  const wantAutoExpand = useMemo(() => hasHiddenAutofill(data), [data])

  useEffect(() => {
    if (wantAutoExpand) setMoreDetailsOpen(true)
  }, [wantAutoExpand])

  useEffect(() => {
    return () => {
      if (labelPreviewUrl) URL.revokeObjectURL(labelPreviewUrl)
    }
  }, [labelPreviewUrl])

  // Debounced brand+model → product-lookup edge function.
  // Fires 800ms after brand and model have both settled at ≥2 chars, skipped
  // while OCR is still running so we don't race the nameplate extraction.
  useEffect(() => {
    const brand = data.brand.trim()
    const model = data.model.trim()
    const key = `${brand.toLowerCase()}::${model.toLowerCase()}`

    if (brand.length < 2 || model.length < 2) {
      // Clear stale suggestions when inputs are too short. Don't touch
      // lastLookupKeyRef — we only update it on a successful fetch so the
      // next full entry can re-fire.
      if (lookupCandidates.length > 0) setLookupCandidates([])
      return
    }
    if (ocrLoading) return
    if (dismissedLookupKey === key) return
    if (lastLookupKeyRef.current === key) return

    const handle = window.setTimeout(async () => {
      const requestId = ++lookupRequestIdRef.current
      setLookupLoading(true)
      const result = await lookupProduct({
        brand,
        model,
        category: dataRef.current.itemCategory,
        subType: dataRef.current.subType,
      })
      if (requestId !== lookupRequestIdRef.current) return
      setLookupLoading(false)
      if (result.error) {
        // Soft-fail — user can still fill fields by hand.
        console.warn("[product-lookup] error:", result.error.message)
        return
      }
      lastLookupKeyRef.current = key
      const r = result.data
      const current = dataRef.current
      // Auto-apply SAFE fields only (category/subType) — these are low-harm:
      // getting an item mis-categorized is trivially correctable. Numeric
      // specs always require explicit per-field approval.
      const nextCategory = current.itemCategory ?? r.safe.category
      const nextSubType = current.subType ?? r.safe.subType
      if (nextCategory !== current.itemCategory || nextSubType !== current.subType) {
        onDataChange({
          ...current,
          itemCategory: nextCategory,
          subType: nextSubType,
        })
      }
      setLookupCandidates(r.candidates)
      setLookupConfidence(r.knowledgeConfidence)
      setAppliedCandidateKeys(new Set())
    }, 800)

    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.brand, data.model, ocrLoading, dismissedLookupKey])

  const handleApplyCandidate = (c: ProductLookupCandidate) => {
    const nextFields = { ...(data.categoryFields ?? {}), [c.key]: c.value }
    onDataChange({ ...data, categoryFields: nextFields })
    setAppliedCandidateKeys((prev) => {
      const s = new Set(prev)
      s.add(c.key)
      return s
    })
  }

  const handleRemoveCandidate = (key: string) => {
    const nextFields = { ...(data.categoryFields ?? {}) }
    delete nextFields[key]
    onDataChange({ ...data, categoryFields: nextFields })
    setAppliedCandidateKeys((prev) => {
      const s = new Set(prev)
      s.delete(key)
      return s
    })
  }

  const handleDismissLookup = () => {
    const key = `${data.brand.trim().toLowerCase()}::${data.model.trim().toLowerCase()}`
    setDismissedLookupKey(key)
    setLookupCandidates([])
  }

  const processImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return
    setOcrError(null)
    setOcrOutcome(null)
    setOcrRawText(null)
    if (labelPreviewUrl) URL.revokeObjectURL(labelPreviewUrl)
    const url = URL.createObjectURL(file)
    setLabelPreviewUrl(url)
    const requestId = ++ocrRequestIdRef.current
    setOcrLoading(true)
    const startedAt = performance.now()
    track("label_ocr_attempted", { bytes: file.size })
    let result: Awaited<ReturnType<typeof extractFromImage>>
    try {
      // One downscale, two consumers: the OCR payload and the pending item photo
      // handed up to SmartAddItem (camera originals are 4–12MB; sending them raw
      // is what silently killed this call pre-fix).
      const small = await downscaleImage(file)
      onLabelPhoto?.(small)
      result = await extractFromImage(small)
    } catch (err) {
      // extractFromImage never throws; this guards the downscale/canvas layer
      // so no device quirk can strand the spinner.
      result = {
        data: null,
        error: { message: err instanceof Error ? err.message : "Couldn't process that photo." },
      }
    }
    const ms = Math.round(performance.now() - startedAt)
    // If a newer request started while this one was in flight, discard the
    // stale result entirely — don't clear loading, don't mutate form state.
    if (requestId !== ocrRequestIdRef.current) return
    setOcrLoading(false)
    if (result.error) {
      setOcrError(result.error.message)
      track("label_ocr_failed", { message: result.error.message, ms })
      return
    }
    const r = result.data as OcrExtraction
    if (isEmptyOcrExtraction(r)) {
      // Vision and the Claude-vision fallback both came up empty. Surface the
      // raw OCR text (if any) so the user can copy a serial/model by hand.
      // parseWarning = the AI extraction call itself failed (outage/billing),
      // which is NOT the user's photo's fault — don't tell them to reshoot.
      setOcrOutcome(r.parseWarning ? "extract_failed" : "empty")
      setOcrRawText(r.text?.trim() ? r.text.trim() : null)
      track("label_ocr_empty", {
        ms,
        hasText: !!r.text?.trim(),
        engine: r.engine ?? null,
        parseWarning: r.parseWarning ?? null,
      })
      return
    }
    const { itemCategory, subType } = mergeOcrCategory(r.category)
    // Preserve any values the user has already typed; OCR only fills blanks.
    // Receipt scans typically set purchaseDate/purchasePrice; nameplate scans
    // set serialNumber; both set brand/model/name/category.
    const next: IdentifyData = {
      brand: data.brand || (r.brand ?? ""),
      model: data.model || (r.model ?? ""),
      name:
        data.name ||
        (r.name ?? `${r.brand ?? ""} ${r.model ?? ""}`.trim()) ||
        "Appliance",
      serialNumber: data.serialNumber || (r.serialNumber ?? ""),
      itemCategory: data.itemCategory ?? itemCategory,
      subType: data.subType ?? subType,
      categoryFields: data.categoryFields,
      confidence: r.confidence ?? 0,
      locationId: data.locationId ?? null,
      purchaseDate: data.purchaseDate ?? (r.purchaseDate ?? null),
      purchasePrice:
        data.purchasePrice ?? (typeof r.purchasePrice === "number" ? r.purchasePrice : null),
    }
    // Count what OCR actually changed so the UI can say so honestly.
    let filled = 0
    if (!data.brand && next.brand) filled++
    if (!data.model && next.model) filled++
    if (!data.name && next.name) filled++
    if (!data.serialNumber && next.serialNumber) filled++
    if (data.itemCategory == null && next.itemCategory != null) filled++
    if (!data.purchaseDate && next.purchaseDate) filled++
    if (data.purchasePrice == null && next.purchasePrice != null) filled++
    onDataChange(next)
    setOcrOutcome("success")
    setOcrFilledCount(filled)
    track("label_ocr_succeeded", { filled, docType: r.docType ?? "unknown", engine: r.engine ?? null, ms })
    if (hasHiddenAutofill(next)) setMoreDetailsOpen(true)
    onModeChange("photo")
    // If OCR gave us a purchase date or price (receipt scan), log a telemetry-
    // friendly console line so we can eyeball receipt-extraction quality in
    // prod without needing full analytics.
    if (r.docType === "receipt") {
      console.info("[ocr] receipt extracted", {
        hasDate: !!r.purchaseDate,
        hasPrice: typeof r.purchasePrice === "number",
        hasBrand: !!r.brand,
      })
    }
  }

  const handleImageInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    await processImageFile(file)
  }

  // Native capture with a real failure path: a denied camera permission or a
  // stale installed binary missing the Camera plugin used to collapse into
  // "return null" → zero UI — the exact silent no-op this feature shipped to
  // kill. On error we say so AND fall back to the in-page <input capture>,
  // which WKWebView supports natively, so the feature still works.
  const handleNativeCapture = async (fallbackInput: HTMLInputElement | null) => {
    const result = await captureNativePhoto()
    if (result.kind === "photo") {
      await processImageFile(result.file)
      return
    }
    if (result.kind === "cancelled") return
    track("label_ocr_native_capture_failed", { message: result.message })
    setOcrError(
      "Couldn't open the native camera — using the photo picker instead. If nothing opens, check Settings → Homehub → Camera."
    )
    fallbackInput?.click()
  }

  // "Take photo": native camera in the iOS/Android shell; the hidden file
  // input (which opens the camera in mobile Safari) on the web.
  const handleTakePhoto = async () => {
    if (isNativePlatform()) {
      await handleNativeCapture(cameraInputRef.current)
    } else {
      cameraInputRef.current?.click()
    }
  }

  // In-form snap/re-snap (manual/photo branch) — same native/web split, but
  // wired to the always-rendered extraImageRef input.
  const handleSnapLabel = async () => {
    if (ocrLoading) return
    if (isNativePlatform()) {
      await handleNativeCapture(extraImageRef.current)
    } else {
      extraImageRef.current?.click()
    }
  }

  const clearOcrState = () => {
    setOcrError(null)
    setOcrOutcome(null)
    setOcrRawText(null)
    if (labelPreviewUrl) URL.revokeObjectURL(labelPreviewUrl)
    setLabelPreviewUrl(null)
    onLabelPhoto?.(null)
  }

  const setCategory = (id: ItemCategoryId) => {
    onDataChange({
      ...data,
      itemCategory: id,
      subType: null,
      categoryFields: {},
    })
  }

  const setSubType = (id: string) => {
    onDataChange({ ...data, subType: id })
  }

  const isValid = data.name.trim().length > 0

  if (mode === "choice") {
    return (
      <div className="flex flex-col gap-6 max-w-lg mx-auto">
        <SectionCard className="p-8 border-border/80 bg-gradient-to-b from-muted/40 to-background">
          <div className="flex flex-col items-center text-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <Camera className="h-10 w-10" strokeWidth={1.25} aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Snap a photo of the label</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                (or the receipt — we&apos;ll read what we can)
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:justify-center">
              <Button
                type="button"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleTakePhoto}
              >
                <Camera className="h-4 w-4" aria-hidden />
                Take photo
              </Button>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                Choose file
              </Button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageInput}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageInput}
            />
            <p className="text-xs text-muted-foreground pt-2">
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  clearOcrState()
                  onDataChange({ ...DEFAULT_IDENTIFY_DATA })
                  onModeChange("manual")
                }}
              >
                Enter manually
              </button>
            </p>
          </div>
        </SectionCard>
        {ocrLoading && (
          <div className="flex items-center gap-2 text-muted-foreground justify-center" aria-busy="true" aria-label="Processing image">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="text-sm">Reading label…</span>
          </div>
        )}
        {ocrError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-lg mx-auto">
            {ocrError}
            <Button variant="ghost" size="sm" className="mt-2" onClick={handleTakePhoto}>
              Try again
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto">
      <SectionCard className="p-5 sm:p-6 space-y-5 transition-all duration-200">
        {labelPreviewUrl && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <img
                src={labelPreviewUrl}
                alt="Label preview"
                className="h-14 w-14 rounded-lg object-cover border border-border shrink-0"
              />
              {ocrLoading ? (
                <div
                  className="flex items-center gap-2 text-muted-foreground"
                  aria-busy="true"
                  aria-label="Reading label"
                >
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  <span className="text-sm">Reading label…</span>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {ocrOutcome === "success"
                      ? ocrFilledCount > 0
                        ? `Filled ${ocrFilledCount} field${ocrFilledCount === 1 ? "" : "s"} from your photo — tap Add more details to review.`
                        : "Photo read — everything you'd typed was kept."
                      : ocrOutcome === "empty"
                        ? "Couldn't read details from this photo. Try a straight-on shot in good light."
                        : ocrOutcome === "extract_failed"
                          ? "Our label reader is having trouble right now — not your photo. The text we could read is below."
                          : ocrError
                            ? "Reading the label didn't work."
                            : "Photo attached."}
                  </p>
                  <button
                    type="button"
                    onClick={handleSnapLabel}
                    className="text-xs text-primary underline underline-offset-2 hover:no-underline mt-0.5"
                  >
                    Re-snap photo
                  </button>
                </div>
              )}
            </div>
            {!ocrLoading && (ocrOutcome === "empty" || ocrOutcome === "extract_failed") && ocrRawText && (
              <details className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <summary className="text-xs font-medium text-foreground cursor-pointer">
                  Show text found on the label
                </summary>
                <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                  {ocrRawText}
                </pre>
              </details>
            )}
            {!ocrLoading && ocrError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {ocrError}
                <Button variant="ghost" size="sm" className="mt-2" onClick={handleSnapLabel}>
                  Try again
                </Button>
              </div>
            )}
          </div>
        )}
        {!labelPreviewUrl && (mode === "manual" || mode === "photo") && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleSnapLabel}
              disabled={ocrLoading}
            >
              Snap label photo
            </Button>
            {ocrLoading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-busy="true">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Reading label…
              </span>
            )}
          </div>
        )}
        {(mode === "manual" || mode === "photo") && (
          <input
            ref={extraImageRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageInput}
          />
        )}

        <div>
          <label htmlFor="identify-name" className="text-sm font-medium text-foreground block mb-1.5">
            Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="identify-name"
            value={data.name}
            onChange={(e) => onDataChange({ ...data, name: e.target.value })}
            placeholder="e.g., Kitchen refrigerator"
            maxLength={255}
            required
            aria-invalid={data.name.trim().length === 0}
          />
        </div>

        {(catChip || roomChip) && (
          <div className="flex flex-wrap items-center gap-2 -mt-1">
            <span className="text-xs text-muted-foreground">Suggested</span>
            {catChip && (
              <button
                type="button"
                onClick={() =>
                  onDataChange({ ...data, itemCategory: catChip, subType: nameInference.subType, categoryFields: {} })
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <Sparkles className="size-3.5" aria-hidden />
                {getSubTypeLabel(catChip, nameInference.subType) ?? legacyCategoryLabelFromItemCategory(catChip)}
              </button>
            )}
            {roomChip && (
              <button
                type="button"
                onClick={() => onDataChange({ ...data, locationId: roomChip.room_id })}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <MapPin className="size-3.5" aria-hidden />
                {roomChip.name}
              </button>
            )}
          </div>
        )}

        <div>
          <RoomSelector
            value={data.locationId}
            onChange={(id) => onDataChange({ ...data, locationId: id })}
            id="identify-room"
          />
          <p className="text-xs text-muted-foreground mt-1">Pick where this item lives in your home.</p>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground mb-1">Category <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
          <p className="text-xs text-muted-foreground mb-3">Helps us suggest the right maintenance tasks. You can add it later.</p>
          <CategoryPicker
            categoryId={data.itemCategory}
            subType={data.subType}
            onCategoryChange={setCategory}
            onSubTypeChange={setSubType}
          />
        </div>

        {moreDetailsOpen ? (
          <button
            type="button"
            onClick={() => setMoreDetailsOpen(false)}
            className="text-sm font-medium text-primary hover:underline text-left flex items-center gap-1"
            aria-expanded={true}
            aria-controls="identify-more-details"
          >
            <ChevronDown className="size-4 rotate-180 transition-transform" aria-hidden />
            Hide extra details
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMoreDetailsOpen(true)}
            className="group text-left rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 hover:border-primary/40 hover:bg-primary/[0.03] transition-colors"
            aria-expanded={false}
            aria-controls="identify-more-details"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-semibold text-foreground">Add more details</span>
              <ChevronDown className="size-4 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <ShieldCheckIcon className="size-3.5 text-emerald-600 shrink-0" aria-hidden />
                <span><span className="font-medium text-foreground">Purchase date</span> → warranty tracking &amp; age-based reminders</span>
              </li>
              <li className="flex items-center gap-1.5">
                <BookOpenCheck className="size-3.5 text-sky-600 shrink-0" aria-hidden />
                <span><span className="font-medium text-foreground">Brand &amp; model</span> → better manual matches</span>
              </li>
              <li className="flex items-center gap-1.5">
                <BellRingIcon className="size-3.5 text-amber-600 shrink-0" aria-hidden />
                <span><span className="font-medium text-foreground">Serial number</span> → recall alerts &amp; warranty claims</span>
              </li>
            </ul>
          </button>
        )}

        <div
          id="identify-more-details"
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            moreDetailsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
          aria-hidden={!moreDetailsOpen}
          inert={!moreDetailsOpen}
        >
          <div className="overflow-hidden min-h-0">
            <div className="space-y-4 pt-1 border-t border-border/60">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="identify-brand" className="text-sm font-medium text-foreground block mb-1.5">
                    Brand
                  </label>
                  <Input
                    id="identify-brand"
                    value={data.brand}
                    onChange={(e) => onDataChange({ ...data, brand: e.target.value })}
                    placeholder="e.g., Samsung"
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground mt-1">helps find the right manual online</p>
                </div>
                <div>
                  <label htmlFor="identify-model" className="text-sm font-medium text-foreground block mb-1.5">
                    Model
                  </label>
                  <Input
                    id="identify-model"
                    value={data.model}
                    onChange={(e) => onDataChange({ ...data, model: e.target.value })}
                    placeholder="e.g., RF28R7551SR"
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground mt-1">helps find the right manual online</p>
                </div>
              </div>
              <div>
                <label htmlFor="identify-serial" className="text-sm font-medium text-foreground block mb-1.5">
                  Serial number
                </label>
                <Input
                  id="identify-serial"
                  value={data.serialNumber}
                  onChange={(e) => onDataChange({ ...data, serialNumber: e.target.value })}
                  placeholder="Optional"
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground mt-1">useful for warranty claims and recalls</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="identify-purchase-date" className="text-sm font-medium text-foreground block mb-1.5">
                    Purchase date
                  </label>
                  <Input
                    id="identify-purchase-date"
                    type="date"
                    value={data.purchaseDate ?? ""}
                    onChange={(e) =>
                      onDataChange({ ...data, purchaseDate: e.target.value ? e.target.value : null })
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">unlocks warranty tracking + age-based reminders</p>
                </div>
                <div>
                  <label htmlFor="identify-purchase-price" className="text-sm font-medium text-foreground block mb-1.5">
                    Purchase price (USD)
                  </label>
                  <Input
                    id="identify-purchase-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={data.purchasePrice != null ? String(data.purchasePrice) : ""}
                    onChange={(e) => {
                      const t = e.target.value
                      onDataChange({
                        ...data,
                        purchasePrice: t === "" ? null : Number(t),
                      })
                    }}
                    placeholder="Optional"
                  />
                </div>
              </div>
              {data.itemCategory && data.subType && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Category-specific details</p>
                  <CategoryFields
                    categoryId={data.itemCategory}
                    subType={data.subType}
                    value={data.categoryFields}
                    onChange={(categoryFields) => onDataChange({ ...data, categoryFields })}
                    idPrefix="identify-cf"
                  />
                </div>
              )}
              {(lookupLoading || lookupCandidates.length > 0) && (
                <ProductSuggestionCard
                  candidates={lookupCandidates}
                  knowledgeConfidence={lookupConfidence}
                  appliedKeys={appliedCandidateKeys}
                  onApply={handleApplyCandidate}
                  onRemove={handleRemoveCandidate}
                  onDismiss={handleDismissLookup}
                  loading={lookupLoading}
                />
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          {onRetry && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {(mode === "photo" || mode === "manual") && (
          <Button
            variant="outline"
            onClick={() => {
              clearOcrState()
              onModeChange("choice")
            }}
            disabled={isCreating}
          >
            Back
          </Button>
        )}
        <Button onClick={onConfirm} disabled={!isValid || isCreating} className="gap-2">
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Add item"
          )}
        </Button>
      </div>
    </div>
  )
}
