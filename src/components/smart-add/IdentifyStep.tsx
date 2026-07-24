/**
 * IdentifyStep — step 1 of add-item, redesigned as Flow A ("two-lane start").
 *
 *   choice     "What are you adding?" — Appliance/device vs Everything else
 *   appliance  brand + model lead; the layered identity lookup fills the rest
 *              ("We found this" card — explicit apply, undoable, never a gate)
 *   simple     name-first quick add for items without a nameplate
 *
 * The label photo is an ASSIST, not a lane: "Snap label instead" in the
 * appliance lane runs the same Vision→Haiku OCR as before. Receipt scans keep
 * filling purchase fields. Nothing the user typed is ever overwritten by any
 * automation — identity apply fills blanks (and the auto-composed placeholder
 * name) only, and Undo restores exactly what it changed.
 */
import { useState, useRef, useEffect, useMemo } from "react"
import { Camera, ChevronDown, Loader2, ShieldCheckIcon, BookOpenCheck, BellRingIcon, Sparkles, MapPin, Refrigerator, Armchair } from "lucide-react"
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
  type ProductIdentity,
  type VariantCandidate,
  type KnowledgeConfidence,
} from "@/modules/inventory/services/productLookupService"
import { ProductSuggestionCard } from "@/components/smart-add/ProductSuggestionCard"
import { IdentityCard, type IdentityCardState } from "@/components/smart-add/IdentityCard"
import { applyIdentity, undoIdentity, type IdentitySnapshot } from "@/components/smart-add/identityApply"
import { COMMON_BRANDS } from "@/modules/inventory/constants/brands"
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

export type IdentifyMode = "choice" | "appliance" | "simple"

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

/** Fields hidden inside "Add more details" that autofill may have populated —
 *  auto-expands the section so nothing lands invisibly. In the appliance lane
 *  brand/model are top-level, so only the genuinely hidden fields count. */
function hasHiddenAutofill(d: IdentifyData, mode: IdentifyMode): boolean {
  const cf = d.categoryFields
  const cfKeys = cf && typeof cf === "object" ? Object.keys(cf).filter((k) => {
    const v = (cf as Record<string, unknown>)[k]
    return v !== null && v !== undefined && v !== ""
  }) : []
  const hiddenBrandModel = mode === "simple" && (d.brand.trim().length > 0 || d.model.trim().length > 0)
  return (
    hiddenBrandModel ||
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

  // Name-first inference (simple lane) + room hint: infer category + room from
  // the typed name / applied subType and surface them as one-tap chips.
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
    // Applied identity (data.subType) beats name inference — after "Use this"
    // the room chip should reflect the resolved product.
    const hint = suggestedRoomForSubType(data.subType ?? nameInference.subType)
    if (!hint) return null
    const h = hint.toLowerCase()
    return quickRooms.find((r) => {
      const rn = r.name.toLowerCase()
      return rn.includes(h) || h.includes(rn)
    }) ?? null
  }, [data.subType, nameInference.subType, quickRooms])
  // One-tap chips, only while the field they'd fill is still empty.
  const catChip: ItemCategoryId | null = !data.itemCategory ? nameInference.itemCategory : null
  const roomChip = !data.locationId ? suggestedRoom : null
  const extraImageRef = useRef<HTMLInputElement>(null)
  // Monotonic request id — protects against stale OCR responses overwriting
  // newer extractions when users retry quickly.
  const ocrRequestIdRef = useRef(0)

  // ── Product lookup (identity card + spec candidates) ──────────────────────
  // Identity: the layered resolver's answer for the CURRENT brand+model key.
  // Specs: the existing per-field review card. Numeric specs from Claude are
  // NEVER silently merged — the user taps Apply per candidate. Identity is the
  // same contract: "Use this" is the only write, and it's undoable.
  const [lookupResult, setLookupResult] = useState<{
    key: string
    identity: ProductIdentity | null
    variants: VariantCandidate[]
  } | null>(null)
  const [identityApplied, setIdentityApplied] = useState<{
    key: string
    snapshot: IdentitySnapshot
    identity: ProductIdentity
  } | null>(null)
  // "Not my product" / "None of these" per brand+model key — session-scoped.
  const [dismissedIdentityKeys, setDismissedIdentityKeys] = useState<Set<string>>(new Set())
  const [lookupCandidates, setLookupCandidates] = useState<ProductLookupCandidate[]>([])
  const [lookupConfidence, setLookupConfidence] = useState<KnowledgeConfidence>("low")
  const [appliedCandidateKeys, setAppliedCandidateKeys] = useState<Set<string>>(new Set())
  const [lookupLoading, setLookupLoading] = useState(false)
  const [dismissedSpecKey, setDismissedSpecKey] = useState<string | null>(null)
  const lookupRequestIdRef = useRef(0)
  const lastLookupKeyRef = useRef<string>("")
  // Keep a ref to the latest data so debounced/apply callbacks read fresh
  // values without re-subscribing on every keystroke.
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  })
  // Every placeholder name this mount has auto-composed ("LG WM4000HWA", …).
  // A name in this set is OURS to replace (recompose on brand/model change,
  // upgrade on identity apply); anything else is user-typed and untouchable.
  // A set — not "the last one" — so a raced state update can never strand a
  // stale placeholder outside our tracking.
  const placeholderNamesRef = useRef<Set<string>>(new Set())

  const currentKey = `${data.brand.trim().toLowerCase()}::${data.model.trim().toLowerCase()}`

  const wantAutoExpand = useMemo(() => hasHiddenAutofill(data, mode), [data, mode])

  useEffect(() => {
    if (wantAutoExpand) setMoreDetailsOpen(true)
  }, [wantAutoExpand])

  useEffect(() => {
    return () => {
      if (labelPreviewUrl) URL.revokeObjectURL(labelPreviewUrl)
    }
  }, [labelPreviewUrl])

  // Appliance lane: keep the Name synced to "<brand> <model>" while the user
  // hasn't named it themselves. Once they type their own name (or identity
  // apply sets the product name), the placeholder never touches it again.
  useEffect(() => {
    if (mode !== "appliance") return
    const composed = `${data.brand.trim()} ${data.model.trim()}`.trim()
    if (!composed) return
    const current = dataRef.current
    if (current.name === "" || placeholderNamesRef.current.has(current.name)) {
      if (current.name !== composed) onDataChange({ ...current, name: composed })
      placeholderNamesRef.current.add(composed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, data.brand, data.model])

  // Debounced brand+model → product lookup (identity + spec candidates).
  // Fires 800ms after both have settled at ≥2 chars, skipped while OCR is
  // running so we don't race the nameplate extraction. Transport errors leave
  // lookupResult null — no card at all; an error is NOT a product miss.
  useEffect(() => {
    const brand = data.brand.trim()
    const model = data.model.trim()
    const key = `${brand.toLowerCase()}::${model.toLowerCase()}`

    if (brand.length < 2 || model.length < 2) {
      if (lookupCandidates.length > 0) setLookupCandidates([])
      return
    }
    if (ocrLoading) return
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
        // Soft-fail — the form stays fully usable; typed data is the data.
        console.warn("[product-lookup] error:", result.error.message)
        return
      }
      lastLookupKeyRef.current = key
      const r = result.data
      setLookupResult({ key, identity: r.identity, variants: r.variantCandidates })
      setLookupCandidates(r.candidates)
      setLookupConfidence(r.knowledgeConfidence)
      setAppliedCandidateKeys(new Set())
      track("identity_lookup_done", {
        outcome: r.identity ? "found" : r.variantCandidates.length > 0 ? "fuzzy" : "miss",
        source: r.identity?.source ?? null,
        cacheHit: r.cacheHit,
      })
    }, 800)

    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.brand, data.model, ocrLoading])

  // ── Identity card state machine ───────────────────────────────────────────
  const identityCardState: IdentityCardState | null = (() => {
    if (mode !== "appliance") return null
    if (lookupLoading) return "loading"
    if (identityApplied && identityApplied.key === currentKey) return "applied"
    if (!lookupResult || lookupResult.key !== currentKey) return null
    if (dismissedIdentityKeys.has(currentKey)) return "miss"
    if (lookupResult.identity) return "found"
    if (lookupResult.variants.length > 0) return "fuzzy"
    return "miss"
  })()

  const identityCategoryLabel = useMemo(() => {
    const identity = lookupResult?.identity
    if (!identity) return null
    const mapped = mergeOcrCategory(identity.rawCategory)
    if (!mapped.itemCategory) return null
    return getSubTypeLabel(mapped.itemCategory, mapped.subType) ?? legacyCategoryLabelFromItemCategory(mapped.itemCategory)
  }, [lookupResult?.identity])

  const handleUseIdentity = () => {
    const identity = lookupResult?.identity
    if (!identity || lookupResult?.key !== currentKey) return
    const { next, snapshot } = applyIdentity(dataRef.current, identity, {
      nameIsPlaceholder: placeholderNamesRef.current.has(dataRef.current.name),
    })
    onDataChange(next)
    setIdentityApplied({ key: currentKey, snapshot, identity })
    track("identity_applied", { source: identity.source })
  }

  const handleUndoIdentity = () => {
    if (!identityApplied) return
    onDataChange(undoIdentity(dataRef.current, identityApplied.snapshot))
    setIdentityApplied(null)
    track("identity_undone")
  }

  const handleNotMyProduct = () => {
    if (identityApplied) onDataChange(undoIdentity(dataRef.current, identityApplied.snapshot))
    setIdentityApplied(null)
    setDismissedIdentityKeys((prev) => new Set(prev).add(currentKey))
    track("identity_rejected", { source: lookupResult?.identity?.source ?? null })
  }

  const handlePickVariant = (model: string) => {
    // Setting the full model refires the debounced lookup → found state.
    onDataChange({ ...dataRef.current, model })
    track("identity_variant_picked")
  }

  const handleNoneOfThese = () => {
    setDismissedIdentityKeys((prev) => new Set(prev).add(currentKey))
    track("identity_variants_rejected")
  }

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
    setDismissedSpecKey(currentKey)
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
        data.name && !placeholderNamesRef.current.has(data.name)
          ? data.name
          : (r.name ?? `${r.brand ?? ""} ${r.model ?? ""}`.trim()) || data.name || "Appliance",
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
    if (data.name !== next.name) filled++
    if (!data.serialNumber && next.serialNumber) filled++
    if (data.itemCategory == null && next.itemCategory != null) filled++
    if (!data.purchaseDate && next.purchaseDate) filled++
    if (data.purchasePrice == null && next.purchasePrice != null) filled++
    onDataChange(next)
    setOcrOutcome("success")
    setOcrFilledCount(filled)
    track("label_ocr_succeeded", { filled, docType: r.docType ?? "unknown", engine: r.engine ?? null, ms })
    if (hasHiddenAutofill(next, mode)) setMoreDetailsOpen(true)
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

  // "Snap label instead": native camera in the iOS/Android shell; the hidden
  // file input (which opens the camera in mobile Safari) on the web.
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

  const isValid =
    mode === "appliance"
      ? data.brand.trim().length >= 2 && data.model.trim().length >= 1 && data.name.trim().length > 0
      : data.name.trim().length > 0

  // ── Lane chooser ──────────────────────────────────────────────────────────
  if (mode === "choice") {
    return (
      <div className="flex flex-col gap-4 max-w-lg mx-auto">
        <div>
          <h2 className="text-lg font-semibold text-foreground">What are you adding?</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            track("add_lane_selected", { lane: "appliance" })
            onModeChange("appliance")
          }}
          className="group text-left rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/50 hover:bg-primary/[0.02] transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Refrigerator className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <p className="font-semibold text-foreground">Appliance or device</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Has a brand &amp; model — washer, fridge, thermostat, TV…
              </p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            track("add_lane_selected", { lane: "simple" })
            onModeChange("simple")
          }}
          className="group text-left rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/50 hover:bg-primary/[0.02] transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Armchair className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <p className="font-semibold text-foreground">Everything else</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Faucet, toilet, sofa, deck, houseplant — just name it.
              </p>
            </div>
          </div>
        </button>
        <p className="text-xs text-muted-foreground text-center">
          Photo of a label? You can snap it inside the appliance form.
        </p>
      </div>
    )
  }

  // ── Form lanes (appliance / simple) ───────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto">
      {/* Native brand autocomplete — the browser filters COMMON_BRANDS as the
          user types ("Sha…" → "Sharp"). Offline, zero API cost, and it never
          restricts input: any brand can still be typed in full. */}
      <datalist id="brand-suggestions">
        {COMMON_BRANDS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <SectionCard className="p-5 sm:p-6 space-y-5 transition-all duration-200">
        {mode === "appliance" && labelPreviewUrl && (
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
        {mode === "appliance" && !labelPreviewUrl && ocrError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {ocrError}
            <Button variant="ghost" size="sm" className="mt-2" onClick={handleSnapLabel}>
              Try again
            </Button>
          </div>
        )}
        {mode === "appliance" && (
          <input
            ref={extraImageRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageInput}
          />
        )}

        {mode === "appliance" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="identify-brand" className="text-sm font-medium text-foreground block mb-1.5">
                  Brand <span className="text-destructive">*</span>
                </label>
                <Input
                  id="identify-brand"
                  list="brand-suggestions"
                  value={data.brand}
                  onChange={(e) => onDataChange({ ...data, brand: e.target.value })}
                  placeholder="e.g., LG"
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label htmlFor="identify-model" className="text-sm font-medium text-foreground block mb-1.5">
                  Model <span className="text-destructive">*</span>
                </label>
                <Input
                  id="identify-model"
                  value={data.model}
                  onChange={(e) => onDataChange({ ...data, model: e.target.value })}
                  placeholder="e.g., WM4000HWA"
                  maxLength={100}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  On the nameplate — usually inside the door or on the back
                </p>
              </div>
            </div>

            {!labelPreviewUrl && (
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={handleSnapLabel}
                  disabled={ocrLoading}
                >
                  <Camera className="size-3.5" aria-hidden />
                  Snap label instead
                </Button>
                {ocrLoading && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-busy="true">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Reading label…
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onModeChange("simple")}
                  className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  No model number?
                </button>
              </div>
            )}

            {identityCardState && (
              <IdentityCard
                state={identityCardState}
                identity={identityCardState === "applied" ? identityApplied?.identity : lookupResult?.identity}
                categoryLabel={identityCategoryLabel}
                variants={lookupResult?.variants ?? []}
                onUse={handleUseIdentity}
                onUndo={handleUndoIdentity}
                onNotMine={handleNotMyProduct}
                onPickVariant={handlePickVariant}
                onNoneOfThese={handleNoneOfThese}
                onSnapLabel={labelPreviewUrl ? undefined : handleSnapLabel}
              />
            )}
          </>
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
              {mode === "simple" && (
                <li className="flex items-center gap-1.5">
                  <BookOpenCheck className="size-3.5 text-sky-600 shrink-0" aria-hidden />
                  <span><span className="font-medium text-foreground">Brand &amp; model</span> → better manual matches</span>
                </li>
              )}
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
              {mode === "simple" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="identify-brand" className="text-sm font-medium text-foreground block mb-1.5">
                      Brand
                    </label>
                    <Input
                      id="identify-brand"
                      list="brand-suggestions"
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
              )}
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
              {dismissedSpecKey !== currentKey && (lookupLoading || lookupCandidates.length > 0) && (
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
