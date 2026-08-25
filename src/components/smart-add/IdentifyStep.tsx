/**
 * IdentifyStep — step 1 of add-item, redesigned as Flow A ("two-lane start").
 *
 *   choice     "What are you adding?" — Appliance/device vs Everything else
 *   appliance  brand + model lead; the layered identity lookup fills the rest
 *              ("We found this" card — explicit apply, undoable, never a gate)
 *   simple     name-first quick add for items without a nameplate
 *
 * The label photo is an ASSIST, not a lane: it lives under the "find the model
 * another way" disclosure and runs the same Vision→Haiku OCR as before. A
 * receipt scan still reads purchase date and price, but those are no longer
 * ASKED for here — they belong to the Purchase step, which prefills from them
 * so the owner sees what was read before it is saved. Nothing the user typed is
 * ever overwritten by any automation: identity apply fills blanks (and the
 * auto-composed placeholder name) only, and Undo restores exactly what it
 * changed.
 */
import { useState, useRef, useEffect, useMemo } from "react"
import { Camera, ChevronDown, ChevronRight, Loader2, BookOpenCheck, BellRingIcon, Sparkles, MapPin, Refrigerator, Armchair, ImageIcon } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RoomSelector } from "@/components/smart-add/RoomSelector"
import { CategoryPicker } from "@/modules/inventory/components/CategoryPicker"
import { CategoryFields } from "@/modules/inventory/components/CategoryFields"
import { extractFromImage, isEmptyOcrExtraction, type OcrExtraction } from "@/modules/inventory/services/ocrService"
import { isNativePlatform, captureNativePhoto, pickNativeLibraryPhoto } from "@/lib/nativeCamera"
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
import { LabelPhotoTips } from "@/components/smart-add/LabelPhotoTips"
import { BrandAutocomplete } from "@/components/smart-add/BrandAutocomplete"
import {
  mapApplianceTypeIdToCategory,
  mapOcrCategoryToTyped,
  getSubTypeLabel,
  legacyCategoryLabelFromItemCategory,
  suggestedRoomForSubType,
  type ItemCategoryId,
} from "@/modules/inventory/constants/itemCategories"
import { useCurrentHome, getRooms } from "@/modules/home"
import { isAllowedSpecKey } from "../../../shared/products/specKeys"
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
  const [otherWaysOpen, setOtherWaysOpen] = useState(false)
  const [nameTouched, setNameTouched] = useState(false)
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string | null>(null)
  const [labelPhotoUse, setLabelPhotoUse] = useState<"unset" | "yes" | "no">("unset")

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
  // Library lane: same OCR pipeline, but the photo already exists — no capture attr.
  const libraryImageRef = useRef<HTMLInputElement>(null)
  // Ask-before-attach: the processed label shot is HELD here until the user says
  // it should be the item's picture. Suggest, never assume — a nameplate
  // close-up silently becoming the product photo was beta feedback.
  const pendingLabelFileRef = useRef<File | null>(null)
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
  // No "applied" set: which chips were tapped is not evidence of what the form
  // holds. Applied is derived from data.categoryFields inside the card.
  const [dismissedCandidateKeys, setDismissedCandidateKeys] = useState<Set<string>>(new Set())
  const [lookupLoading, setLookupLoading] = useState(false)
  /** Actionable lookup-failure notice (quota) — shown quietly under the fields. */
  const [lookupNotice, setLookupNotice] = useState<string | null>(null)
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

  // A found product's specs (capacity, wattage, filter size…) live in the
  // ProductSuggestionCard inside "Add more details". Surface them automatically
  // when the lookup returns candidates — otherwise a match appears to fill only
  // the category, when there was more to apply one tap away.
  useEffect(() => {
    if (lookupCandidates.length > 0) setMoreDetailsOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupCandidates.length])

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
        // But never SILENTLY: track every failure (a retired model 404'd every
        // lookup for days and nothing surfaced), and tell the user about quota
        // exhaustion, which is actionable.
        console.warn("[product-lookup] error:", result.error.message)
        track("identity_lookup_error", { message: result.error.message.slice(0, 120) })
        if (/limit reached/i.test(result.error.message)) {
          setLookupNotice("Daily lookup limit reached — the form still works, fill it in manually.")
        }
        return
      }
      setLookupNotice(null)
      lastLookupKeyRef.current = key
      const r = result.data
      setLookupResult({ key, identity: r.identity, variants: r.variantCandidates })
      setLookupCandidates(r.candidates)
      setLookupConfidence(r.knowledgeConfidence)
      setDismissedCandidateKeys(new Set())
      track("identity_lookup_done", {
        outcome: r.identity ? "found" : r.variantCandidates.length > 0 ? "fuzzy" : "miss",
        source: r.identity?.source ?? null,
        cacheHit: r.cacheHit,
      })
    }, 800)

    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.brand, data.model, ocrLoading])

  // An applied identity must not outlive the model it was for.
  //
  // Typing "Core", accepting "Levoit Core …", then finishing the model to
  // "Core 300" left the earlier name in place: applyIdentity had already made
  // it a non-placeholder, so neither the auto-compose nor a later apply would
  // replace it. The item shipped named after the family while the field right
  // above it read "Core 300". Withdrawing is not the same as auto-applying —
  // we are retracting a suggestion that no longer refers to what they typed,
  // and only when they have not edited it themselves.
  useEffect(() => {
    if (!identityApplied || identityApplied.key === currentKey) return
    if (dataRef.current.name !== identityApplied.identity.name) {
      // They renamed it. Their text stands; just stop calling it applied.
      setIdentityApplied(null)
      return
    }
    const reverted = undoIdentity(dataRef.current, identityApplied.snapshot)
    const composed = `${data.brand.trim()} ${data.model.trim()}`.trim()
    // Recompose here rather than leaning on the auto-compose effect: that one
    // reads dataRef, which still holds the pre-undo value in this commit.
    const nameIsOurs = !reverted.name.trim() || placeholderNamesRef.current.has(reverted.name)
    if (composed && nameIsOurs) placeholderNamesRef.current.add(composed)
    onDataChange(composed && nameIsOurs ? { ...reverted, name: composed } : reverted)
    setIdentityApplied(null)
    track("identity_withdrawn", { reason: "model_changed" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey])

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

  // Defence in depth: the server already drops keys outside the category's
  // schema, but a cached lookup from before that gate can still carry one. A
  // value written to a key no field renders is invisible AND unremovable — the
  // exact shape of the reported bug — so refuse it here too.
  const handleApplyCandidate = (c: ProductLookupCandidate) => {
    if (!isAllowedSpecKey(data.itemCategory ?? null, c.key)) {
      console.warn("[identify] refused off-schema spec key", { key: c.key, category: data.itemCategory })
      setDismissedCandidateKeys((prev) => new Set(prev).add(c.key))
      return
    }
    const nextFields = { ...(data.categoryFields ?? {}), [c.key]: c.value }
    onDataChange({ ...data, categoryFields: nextFields })
  }

  const handleRemoveCandidate = (key: string) => {
    const nextFields = { ...(data.categoryFields ?? {}) }
    delete nextFields[key]
    onDataChange({ ...data, categoryFields: nextFields })
  }

  /** "Keep mine" — hide the suggestion, leave the user's value alone. */
  const handleDismissCandidate = (key: string) => {
    setDismissedCandidateKeys((prev) => new Set(prev).add(key))
  }

  // Also drops any key the form cannot display. A cached lookup predating the
  // server-side gate can still carry one, and offering "Apply" for a field that
  // will never appear is offering a button that does nothing visible.
  const visibleCandidates = useMemo(
    () =>
      lookupCandidates.filter(
        (c) => !dismissedCandidateKeys.has(c.key) && isAllowedSpecKey(data.itemCategory ?? null, c.key),
      ),
    [lookupCandidates, dismissedCandidateKeys, data.itemCategory],
  )

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
      // (camera originals are 4–12MB; sending them raw is what silently killed
      // this call pre-fix). The photo only becomes the item's picture if the
      // user opts in below — carried forward automatically once they have.
      const small = await downscaleImage(file)
      pendingLabelFileRef.current = small
      onLabelPhoto?.(labelPhotoUse === "yes" ? small : null)
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
    track("label_ocr_native_capture_failed", { reason: result.reason, message: result.message })

    // Two failures, two different answers — the old handler gave one answer to
    // both, and it was wrong for each:
    //
    // PERMISSION DENIED needs the user; only they can flip the iOS setting, and
    // the in-page fallback uses the same camera permission, so opening it here
    // would just fail again. Say the one true, actionable thing.
    //
    // ANYTHING ELSE is our problem. The fallback <input capture> opens the same
    // native camera sheet, so the user still gets their photo — announcing our
    // internal rerouting as a red error was the bug the tester reported twice:
    // "it allowed me to take the photo and then this message popped up."
    // Mechanism is not the user's business when their goal still succeeds.
    if (result.reason === "permission") {
      setOcrError("Camera access is off for Homehub. Enable it in iOS Settings → Homehub → Camera, then try again.")
      return
    }
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

  // "From library": the label shot people already have on their phone. Same OCR
  // pipeline; iOS shows the system photo picker (no permission prompt), so the
  // only failure worth words is a real one.
  const handlePickFromLibrary = async () => {
    if (ocrLoading) return
    if (!isNativePlatform()) {
      libraryImageRef.current?.click()
      return
    }
    const result = await pickNativeLibraryPhoto()
    if (result.kind === "photo") {
      await processImageFile(result.file)
      return
    }
    if (result.kind === "cancelled") return
    track("label_ocr_library_pick_failed", { reason: result.reason, message: result.message })
    if (result.reason === "permission") {
      setOcrError("Photo access is off for Homehub. Enable it in iOS Settings → Homehub → Photos, then try again.")
      return
    }
    libraryImageRef.current?.click()
  }

  const clearOcrState = () => {
    setOcrError(null)
    setOcrOutcome(null)
    setOcrRawText(null)
    if (labelPreviewUrl) URL.revokeObjectURL(labelPreviewUrl)
    setLabelPreviewUrl(null)
    pendingLabelFileRef.current = null
    setLabelPhotoUse("unset")
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

  // HH-23: the appliance lane no longer waits for a NAME. Brand + model is
  // everything the manual lookup needs, and a name typed before the manual is
  // read is the worst version of the name — it produced "Levoit Core Series Air
  // Purifiers" for a Core 300. Blank composes to "Brand Model" on save and the
  // parse improves it. The other lane still needs a name, because there it is
  // the only thing identifying the item at all.
  const isValid =
    mode === "appliance"
      ? data.brand.trim().length >= 2 && data.model.trim().length >= 1
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
      {/* HH-74: no space-y here — SectionCard is already flex-col gap-6, and
          stacking margin-based spacing on top produced 44px between every
          section (24 gap + 20 margin), which is the "big gaps" she reported
          once the screen slimmed down. One spacing system, the card's own. */}
      <SectionCard className="p-5 sm:p-6 transition-all duration-200">
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
                        ? "Couldn't read anything usable from that photo."
                        : ocrOutcome === "extract_failed"
                          ? "Our label reader is having trouble right now — not your photo. The text we could read is below."
                          : ocrError
                            ? "Reading the label didn't work."
                            : "Photo attached."}
                  </p>
                  <span className="flex items-center gap-3 mt-0.5">
                    <button
                      type="button"
                      onClick={handleSnapLabel}
                      className="text-xs text-primary underline underline-offset-2 hover:no-underline"
                    >
                      Re-snap photo
                    </button>
                    <button
                      type="button"
                      onClick={handlePickFromLibrary}
                      className="text-xs text-primary underline underline-offset-2 hover:no-underline"
                    >
                      From library
                    </button>
                  </span>
                </div>
              )}
            </div>
            {/* The label photo is NOT the item photo, and asking implied it
                might be: "if the photo I take should always be a label, I would
                never want that to be my photo used to identify the item." So
                it stays out by default and the offer is a single quiet link,
                not a question you have to answer to move on. */}
            {!ocrLoading && labelPhotoUse !== "yes" && (
              <button
                type="button"
                onClick={() => {
                  setLabelPhotoUse("yes")
                  onLabelPhoto?.(pendingLabelFileRef.current)
                }}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Use this shot as the item's photo
              </button>
            )}
            {!ocrLoading && labelPhotoUse === "yes" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Using this as the item's photo.</span>
                <button
                  type="button"
                  onClick={() => {
                    setLabelPhotoUse("no")
                    onLabelPhoto?.(null)
                  }}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Undo
                </button>
              </div>
            )}
            {!ocrLoading && ocrOutcome === "empty" && <LabelPhotoTips variant="after-empty" />}
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
          <>
            <input
              ref={extraImageRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageInput}
            />
            {/* No capture attr → browsers offer the photo library. */}
            <input
              ref={libraryImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageInput}
            />
          </>
        )}

        {mode === "appliance" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="identify-brand" className="text-sm font-medium text-foreground block mb-1.5">
                  Brand <span className="text-destructive">*</span>
                </label>
                <BrandAutocomplete
                  id="identify-brand"
                  value={data.brand}
                  onChange={(brand) => onDataChange({ ...dataRef.current, brand })}
                  placeholder="e.g., LG"
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
                  // Model numbers are uppercase alphanumerics — stop the iOS
                  // keyboard fighting the user (lowercase default, autocorrect
                  // "SMD2470" → words, spellcheck red squiggles).
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  On the nameplate — usually inside the door or on the back
                </p>
              </div>
            </div>

            {/* The lookup result sits DIRECTLY under the fields that produced
                it — cause then effect. The snap/no-model row (a fallback for
                when typing didn't get you there) follows below. */}
            {lookupNotice && !identityCardState && (
              <p className="text-xs text-muted-foreground">{lookupNotice}</p>
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

            {!labelPreviewUrl && (
              /* Three sibling buttons used to float here with no heading, so it
                 was never clear what they were alternatives TO. One disclosure,
                 named for the job: you are here because typing the model is
                 hard. "From library" also read as a MANUAL library in this app
                 — the one library it isn't. */
              <div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setOtherWaysOpen((v) => !v)}
                    aria-expanded={otherWaysOpen}
                    className="flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    <ChevronRight
                      className={cn("size-3.5 transition-transform", otherWaysOpen && "rotate-90")}
                      aria-hidden
                    />
                    Can&apos;t find the model?
                  </button>
                  {ocrLoading && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-busy="true">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Reading label…
                    </span>
                  )}
                </div>

                {otherWaysOpen && (
                  <div className="mt-2">
                    {/* Says WHAT to photograph before the camera opens. A
                        first-timer points at the front of the appliance —
                        that is what "photograph your dishwasher" means in
                        English — and the model number is on a sticker inside
                        the door frame. A capture problem wearing an OCR
                        problem's clothes, and no pipeline work fixes it. */}
                    <LabelPhotoTips variant="before" />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={handleSnapLabel}
                      disabled={ocrLoading}
                    >
                      <Camera className="size-3.5" aria-hidden />
                      Snap the label
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={handlePickFromLibrary}
                      disabled={ocrLoading}
                    >
                      <ImageIcon className="size-3.5" aria-hidden />
                      Choose a photo
                    </Button>
                    <button
                      type="button"
                      onClick={() => onModeChange("simple")}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      I don't have a model number
                    </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Simple lane: the name IS the item — main column, never collapsed.
            (Regression guard: e2e/emu/smart-add.spec.ts types here without
            opening "Add more details".) */}
        {mode === "simple" && (
          <div>
            <label htmlFor="identify-name" className="text-sm font-medium text-foreground block mb-1.5">
              Name
            </label>
            <Input
              id="identify-name"
              value={data.name}
              onChange={(e) => onDataChange({ ...data, name: e.target.value })}
              placeholder="e.g., Kitchen faucet"
              maxLength={255}
              onBlur={() => setNameTouched(true)}
              aria-invalid={nameTouched && data.name.trim().length === 0}
            />
          </div>
        )}

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



        {/* Round 11: the approved first screen is "two fields, nothing else — no
            room picker, no category grid, no serial number, no 'Add more
            details' disclosure, because there is nothing behind it to open."
            The appliance lane now honours that. Everything that used to hide
            here has a home on the item page: Room and Serial in Details &
            records, Category in its own picker, and the category-specific
            fields moved into that same sheet in this change (they had no other
            home, which is why the disclosure could not simply be deleted).

            The SIMPLE lane keeps it — brand and model live in there, and that
            lane is deliberately untouched this round. */}
        {mode === "simple" && (moreDetailsOpen ? (
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
              <span className="text-sm font-semibold text-foreground">Add more details <span className="font-normal text-muted-foreground">(optional)</span></span>
              <ChevronDown className="size-4 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
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
        ))}

        {/* Not merely collapsed — NOT MOUNTED outside the simple lane. The
            approved design says "there is nothing behind it to open", and an
            inert subtree that can never be revealed still puts Serial number,
            Room and a category grid in the page for anything reading it. */}
        {mode === "simple" && <div
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
                    <BrandAutocomplete
                      id="identify-brand"
                      value={data.brand}
                      onChange={(brand) => onDataChange({ ...dataRef.current, brand })}
                      placeholder="e.g., Samsung"
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
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                    <p className="text-xs text-muted-foreground mt-1">helps find the right manual online</p>
                  </div>
                </div>
              )}
              {/* The appliance lane's Name field used to live here. It is gone:
                  the name is composed from the item TYPE (composeItemName) and
                  is now editable in the item page's Details & records sheet,
                  which is the first time this app has HAD a rename. Asking for
                  a name before the manual has been read is also how a Core 300
                  once got called "Levoit Core Series Air Purifiers". */}
              {/* HH-76: Room and Category used to sit on the main column,
                  between the model field and the button. The agreed design was
                  brand + model + one call to action, so they moved in here —
                  still prefilled, still one tap away, no longer in the way.
                  Room fills itself in from the item type; Category is filled by
                  the lookup and again by the manual. Neither is a question the
                  user is better placed to answer than we are. */}
              <div>
                <RoomSelector
                  value={data.locationId}
                  onChange={(id) => onDataChange({ ...data, locationId: id })}
                  id="identify-room"
                  suggestForSubType={data.subType}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Category <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
                <p className="text-xs text-muted-foreground mb-3">Helps us suggest the right maintenance tasks. You can add it later.</p>
                <CategoryPicker
                  categoryId={data.itemCategory}
                  subType={data.subType}
                  onCategoryChange={setCategory}
                  onSubTypeChange={setSubType}
                  showHeading={false}
                />
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
              {/* Purchase date and price used to sit here AND on the final
                  Purchase step, which asks for date, store, price and receipt.
                  The same facts, requested twice, the first time before the
                  item even exists — the "overwhelming, and purchase-specific
                  details should happen later" report. They live on the Purchase
                  step now, prefilled from a receipt scan when OCR found them,
                  so nothing is lost and nothing is saved unseen. */}
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
              {dismissedSpecKey !== currentKey && (lookupLoading || visibleCandidates.length > 0) && (
                <ProductSuggestionCard
                  candidates={visibleCandidates}
                  knowledgeConfidence={lookupConfidence}
                  currentValues={data.categoryFields ?? {}}
                  onApply={handleApplyCandidate}
                  onRemove={handleRemoveCandidate}
                  onDismissCandidate={handleDismissCandidate}
                  onDismiss={handleDismissLookup}
                  loading={lookupLoading}
                />
              )}
            </div>
          </div>
        </div>}
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
            // HH-23 / owner direction: name the DESTINATION, not the record.
            // "Add item" made this screen feel like the point; the manual is
            // the point, and it is the next screen. Round 11: dropped the
            // "Next:" prefix so the button and the title of the screen it opens
            // are the SAME words — an action keeps its name through the flow.
            mode === "appliance" ? "Add the manual" : "Add item"
          )}
        </Button>
      </div>
    </div>
  )
}
