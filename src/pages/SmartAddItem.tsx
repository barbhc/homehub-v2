import { useState, useCallback, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { PageContainer, PageHeader, SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import {
  IdentifyStep,
  DEFAULT_IDENTIFY_DATA,
  type IdentifyData,
  type IdentifyMode,
} from "@/components/smart-add/IdentifyStep"
import { ManualStep, type ManualSourceChoice } from "@/components/smart-add/ManualStep"
import { PlanStep, type EditableTask } from "@/components/smart-add/PlanStep"
import { useCurrentPropertyCompat as useCurrentProperty } from "@/modules/home"
import { useAuth } from "@/modules/auth"
import { createItemUnit } from "@/modules/items"
import { createTasksFromEditable } from "@/modules/care"
import { uploadManualPdf, removeManualPdf, uploadItemPhoto } from "@/modules/inventory/services/storageService"
import { resolveStorageUrl } from "@/integrations/firebase"
import { deleteManualDocument } from "@/modules/knowledge/services/manualDocumentService"
import {
  createManualDocument,
  detectDocType,
  type DocType,
  type ParsedConfidence,
} from "@/modules/knowledge"
import { startParse } from "@/modules/knowledge/services/parseManualService"
import type { WizardSession } from "@/lib/wizardSession"
import {
  getWizardSession,
  setWizardSession,
  updateWizardSession,
  clearWizardSession,
  type WizardStep,
} from "@/lib/wizardSession"
import { markParsePending } from "@/lib/parsePickup"
import { resumeSummary } from "@/lib/resumeSummary"
import { isCapacityRefusal, queueScan } from "@/lib/scanCapacity"
import { composeItemName } from "@/lib/itemName"
import { categoryLabel } from "@/lib/categoryLabel"
import { getRooms } from "@/modules/home"
import { getItemUnits } from "@/modules/items"
import { subTypeToLegacyApplianceTypeId } from "@/modules/inventory/constants/itemCategories"

type ManualClassificationGate = {
  choices: ManualSourceChoice[]
  manualIds: string[]
  /** Storage paths for upload-type choices only; used to clean up on Replace. */
  uploadPaths: string[]
  firstManualId: string
  firstUrl: string | null
  filename: string
  docType: DocType
  confidence: number
  reason: string
}

function shouldPromptDocClassification(docType: DocType, confidence: number): boolean {
  if (docType === "manual") return false
  if (docType === "other" && confidence < 0.5) return false
  if (docType === "other") return false
  return confidence >= 0.45
}

export default function SmartAddItem() {
  const navigate = useNavigate()
  const { property } = useCurrentProperty()
  const { user } = useAuth()

  const [step, setStep] = useState<WizardStep>("identify")
  // Flow A: every add starts at the lane chooser ("Appliance or device" vs
  // "Everything else") — brand+model lead in the appliance lane, name leads in
  // the simple lane. The label photo is an assist inside the appliance lane.
  const [identifyMode, setIdentifyMode] = useState<IdentifyMode>("choice")
  const [identifyData, setIdentifyData] = useState<IdentifyData>({ ...DEFAULT_IDENTIFY_DATA })
  // Downscaled nameplate photo from IdentifyStep — attached as the item photo
  // after creation. Not persisted in the wizard session (a File can't be), so
  // a resumed session simply starts without one.
  const [labelPhotoFile, setLabelPhotoFile] = useState<File | null>(null)
  const [manualDocGate, setManualDocGate] = useState<ManualClassificationGate | null>(null)
  const [manualStepKey, setManualStepKey] = useState(0)
  const [itemId, setItemId] = useState<string | null>(null)
  const [hasManual, setHasManual] = useState(false)
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [, setHasTasks] = useState(false)
  const [, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [savingMessage, setSavingMessage] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [resumePrompt, setResumePrompt] = useState<WizardSession | null>(null)

  // Kept only for the wizard-session round-trip (checkResume restores it);
  // nothing in the two remaining steps reads it.
  const [, setParseConfidence] = useState<ParsedConfidence | null>(null)

  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const propertyId = property?.id ?? null

  const completedSteps = new Set<WizardStep>()
  if (itemId) completedSteps.add("identify")
  if (hasManual) completedSteps.add("manual")
  if (step === "plan") completedSteps.add("manual")


  const checkResume = useCallback(() => {
    const session = getWizardSession()
    if (!session || !propertyId || session.propertyId !== propertyId) {
      setLoading(false)
      return
    }
    // A session saved on the retired Purchase step has nothing left to resume
    // INTO — the item exists, its manual is attached, and purchase details are
    // the item page's Details sheet now. Send them to the item rather than to a
    // step that no longer exists.
    if ((session.step as string) === "purchase" && session.itemId) {
      clearWizardSession()
      navigate(`/items/${session.itemId}`)
      return
    }
    setManualDocGate(null)
    setItemId(session.itemId)
    setIdentifyData({
      brand: session.brand ?? "",
      model: session.model ?? "",
      name: session.itemName,
      serialNumber: "",
      itemCategory: (session.itemCategory as IdentifyData["itemCategory"]) ?? null,
      subType: session.subType ?? null,
      categoryFields: session.categoryFields ?? {},
      confidence: 0,
      locationId: session.locationId ?? null,
      purchaseDate: session.purchaseDate ?? null,
      purchasePrice: session.purchasePrice ?? null,
    })
    setHasManual(session.hasManual)
    setHasTasks(session.hasTasks)
    setParseConfidence((session.parseConfidence as ParsedConfidence | null | undefined) ?? null)
    // Steps retired when the wizard stopped waiting on the parse. "parsing"
    // and "review" both mean "the manual was attached", so resuming at the
    // manual step is honest — attaching again re-runs the read.
    const raw = session.step as string
    const safeStep: WizardStep =
      raw === "parsing" || raw === "review"
        ? "manual"
        : raw === "add"
          ? "identify"
          : (session.step as WizardStep)
    setStep(safeStep)
    if (session.step === "identify") {
      // Resume into the lane that matches the saved data (legacy sessions from
      // the manual/photo modes land in "simple" unless they carried a brand or
      // model, which belongs to the appliance lane).
      setIdentifyMode(session.brand?.trim() || session.model?.trim() ? "appliance" : "simple")
    }
    setResumePrompt(null)
    setLoading(false)
  }, [propertyId, navigate])

  useEffect(() => {
    const session = getWizardSession()
    if (session && propertyId && session.propertyId === propertyId) {
      setResumePrompt(session)
    }
    setLoading(false)
  }, [propertyId])

  const handleResume = () => {
    checkResume()
  }

  const handleStartFresh = () => {
    clearWizardSession()
    setResumePrompt(null)
    setItemId(null)
    setIdentifyMode("choice")
    setIdentifyData({ ...DEFAULT_IDENTIFY_DATA })
    setLabelPhotoFile(null)
    setManualDocGate(null)
    setManualStepKey((k) => k + 1)
    setHasManual(false)
    setManualUrl(null)
    setHasTasks(false)
    setParseConfidence(null)
    setStep("identify")
  }

  const handleIdentifyConfirm = useCallback(async () => {
    if (!propertyId) return
    setError(null)
    setActionLoading(true)
    // Firestore item (homes/{homeId}/items): `category` is the specific type
    // slug (matches sub_type); the RoomSelector's locationId is a room id.
    // Round 11: the name is the KIND of thing — "Refrigerator", not
    // "Fisher & Paykel RF135BDRUX4". The room is appended ONLY when the plain
    // type is already taken in this home, so a kitchen full of items doesn't
    // read "Kitchen… Kitchen… Kitchen…". Rules and fallbacks live in
    // composeItemName; both reads are needed to answer "is this name taken".
    const [existing, rooms] = await Promise.all([
      getItemUnits(propertyId),
      getRooms(propertyId),
    ])
    const composedName = composeItemName({
      typed: identifyData.name,
      typeLabel: categoryLabel({
        item_category: identifyData.itemCategory,
        sub_type: identifyData.subType,
      }),
      brand: identifyData.brand,
      model: identifyData.model,
      room: rooms.data?.find((r) => r.room_id === identifyData.locationId)?.name ?? null,
      existingNames: (existing.data ?? []).map((i) => i.display_name),
    })
    const result = await createItemUnit({
      home_id: propertyId,
      room_id: identifyData.locationId,
      display_name: composedName,
      category: identifyData.subType ?? "other",
      item_category: identifyData.itemCategory,
      sub_type: identifyData.subType,
      category_fields: identifyData.categoryFields,
      brand: identifyData.brand.trim() || null,
      model: identifyData.model.trim() || null,
      serial_number: identifyData.serialNumber.trim() || null,
      purchase_date: identifyData.purchaseDate?.trim() || null,
      price_paid: identifyData.purchasePrice,
    })
    setActionLoading(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    const created = result.data
    if (!created) {
      setError("Could not create item")
      return
    }
    // Attach the snapped nameplate as the item photo. Fire-and-forget: the
    // upload survives the route change below, and a failure only costs the
    // photo — never the item.
    if (labelPhotoFile && user?.id) {
      uploadItemPhoto(propertyId, created.item_unit_id, labelPhotoFile, user.id).then((r) => {
        if (r.error) console.warn("[smart-add] label photo attach failed:", r.error.message)
      })
    }

    // An appliance goes on to its manual — that is the step that makes the rest
    // of the app work, and it earns far more attachments as a screen the user is
    // already on than as a button on a page they have to notice. Everything else
    // (a sofa, a deck, a houseplant) usually has no manual to add, so it lands
    // on its item page and is done.
    //
    // Until now BOTH lanes navigated away here, which left the wizard a
    // one-step form advertising a five-step Stepper — step 2 was reachable only
    // by resuming an old session.
    if (identifyMode === "appliance") {
      setItemId(created.item_unit_id)
      setWizardSession({
        itemId: created.item_unit_id,
        propertyId,
        step: "manual",
        itemName: composedName,
        brand: identifyData.brand.trim() || null,
        model: identifyData.model.trim() || null,
        locationId: identifyData.locationId,
        itemCategory: identifyData.itemCategory,
        subType: identifyData.subType,
        categoryFields: identifyData.categoryFields,
        purchaseDate: identifyData.purchaseDate ?? null,
        purchasePrice: identifyData.purchasePrice,
        hasManual: false,
        hasTasks: false,
        createdAt: new Date().toISOString(),
      })
      setStep("manual")
      return
    }

    clearWizardSession()
    navigate(`/items/${created.item_unit_id}`)
  }, [propertyId, identifyData, identifyMode, labelPhotoFile, user?.id, navigate])

  /**
   * Kick the parse off and LEAVE. The wizard's job ends when the manual is
   * attached.
   *
   * The old flow parked the user on a Reading screen for the couple of minutes
   * the worker takes, then walked them through a review of every bucket. Both
   * are now the item page's job: the page fills in as tasks are found, and asks
   * for one review when the read finishes.
   *
   * Nothing here is new machinery — `markParsePending` + ParsePickupCard were
   * built for the user who walked away mid-parse. That exit is now the front
   * door, so the parse is started and never awaited: the worker runs
   * server-side and the item page watches it.
   */
  const startParseAndLeave = useCallback(
    async (firstManualId: string, firstUrl: string | null) => {
      if (!propertyId || !itemId) return
      setManualUrl(firstUrl)
      setSavingMessage(undefined)

      const started = await startParse(firstManualId, { homeId: propertyId, mode: "preview" })
      if (!started.ok) {
        // Enqueue failed — the manual is attached but nothing is reading it.
        // Say so here rather than dropping them on a page that will never
        // change.
        // HH-124: a ceiling is not a lost manual. Record it so the app can
        // start the scan the next time it is opened with capacity available —
        // the manual itself is already saved either way.
        if (isCapacityRefusal(started.error) && itemId) {
          queueScan(firstManualId, itemId, Date.now())
        }
        setError(started.error)
        setStep("manual")
        return
      }

      markParsePending(firstManualId)
      clearWizardSession()
      navigate(`/items/${itemId}`)
    },
    [propertyId, itemId, navigate],
  )

  const handleManualConfirm = useCallback(
    async (choices: ManualSourceChoice[]) => {
      if (!propertyId || !itemId) return
    setActionLoading(true)
      setError(null)

      try {
        let firstManualId: string | null = null
        let firstUrl: string | null = null
        const manualIds: string[] = []
        const uploadPaths: string[] = []
        let uploadFilename = ""

        for (const choice of choices) {
          let sourceType: "url" | "upload" = "url"
          let sourceRef = ""

          if (choice.type === "upload") {
            setSavingMessage("Uploading PDF…")
            const uploadRes = await uploadManualPdf(propertyId, itemId, choice.file, user?.id)
            if (!uploadRes.data?.path) throw new Error("Upload failed")
            sourceRef = uploadRes.data.path
            sourceType = "upload"
            uploadFilename = choice.file.name
            firstUrl = (await resolveStorageUrl(sourceRef).catch(() => null)) ?? firstUrl
            uploadPaths.push(sourceRef)
          } else {
            sourceRef = choice.url
            firstUrl = firstUrl ?? choice.url
            uploadFilename = sourceRef
          }

          const manualRes = await createManualDocument(propertyId, {
            item_unit_id: itemId,
            title: choice.type === "upload" ? choice.file.name : sourceRef,
            source_type: sourceType,
            source_ref: sourceRef,
          })
          if (!manualRes.data) {
            throw new Error(manualRes.error?.message ?? "Could not save manual record")
          }
          manualIds.push(manualRes.data.manual_id)
          if (!firstManualId) firstManualId = manualRes.data.manual_id
        }

        if (!firstManualId) throw new Error("No manual created")

        setHasManual(true)
        setManualUrl(firstUrl)
        updateWizardSession({ hasManual: true })

        const det = await detectDocType(propertyId, firstManualId)
        const d = det.data
        if (d && shouldPromptDocClassification(d.docType, d.confidence)) {
          setManualDocGate({
            choices,
            manualIds,
            uploadPaths,
            firstManualId,
            firstUrl,
            filename: uploadFilename || "document.pdf",
            docType: d.docType,
            confidence: d.confidence,
            reason: d.reason,
          })
          setActionLoading(false)
          setSavingMessage(undefined)
          return
        }

        await startParseAndLeave(firstManualId, firstUrl)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong"
        setError(msg)
        setStep("manual")
      } finally {
        setActionLoading(false)
        setSavingMessage(undefined)
      }
    },
    [propertyId, itemId, user?.id, startParseAndLeave]
  )

  const handleDocClassificationUseAnyway = useCallback(async () => {
    if (!manualDocGate) return
    const g = manualDocGate
    setManualDocGate(null)
    setActionLoading(true)
    setError(null)
    try {
      await startParseAndLeave(g.firstManualId, g.firstUrl)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      setStep("manual")
    } finally {
      setActionLoading(false)
    }
  }, [manualDocGate, startParseAndLeave])

  const handleDocClassificationReplace = useCallback(async () => {
    if (!manualDocGate) {
      setManualStepKey((k) => k + 1)
      return
    }
    const g = manualDocGate
    setActionLoading(true)
    setSavingMessage("Removing previous upload…")
    try {
      // Soft-delete manual_document rows so they don't appear as active docs on the item.
      const rowResults = await Promise.all(g.manualIds.map((id) => deleteManualDocument(propertyId ?? "", id)))
      const rowFailure = rowResults.find((r) => r.error)
      if (rowFailure?.error) {
        throw new Error(rowFailure.error.message)
      }
      // Best-effort: remove uploaded storage objects (url-sourced choices have no path).
      if (g.uploadPaths.length > 0) {
        const storageResults = await Promise.all(g.uploadPaths.map((p) => removeManualPdf(p)))
        const storageFailure = storageResults.find((r) => r.error)
        if (storageFailure?.error) {
          // Storage cleanup is best-effort; log but don't block the user.
          console.warn("Storage cleanup failed:", storageFailure.error.message)
        }
      }
      setManualDocGate(null)
      setHasManual(false)
      setManualUrl(null)
      updateWizardSession({ hasManual: false })
      setManualStepKey((k) => k + 1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not remove previous upload"
      setError(msg)
    } finally {
      setActionLoading(false)
      setSavingMessage(undefined)
    }
  }, [manualDocGate])

  const handleManualSkip = useCallback(() => {
    updateWizardSession({ step: "plan" })
    setStep("plan")
  }, [])

  const handlePlanFinish = useCallback(async (tasks: EditableTask[]) => {
    if (!propertyId || !itemId) return
    setError(null)
    setActionLoading(true)

    const result = await createTasksFromEditable(
      propertyId,
      itemId,
      tasks.map((t) => ({
        title: t.title,
        instructions: t.instructions || null,
        priority: t.priority,
        effort: t.effort ?? null,
        afterEachUse: t.afterEachUse,
        frequencyValue: t.frequencyValue,
        frequencyUnit: t.frequencyUnit,
      }))
    )
    setActionLoading(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    setHasTasks(true)
    // Purchase details are the item page's Details & records sheet now — asked
    // there, when the user chooses, instead of as a wizard toll booth.
    clearWizardSession()
    navigate(`/items/${itemId}`)
  }, [propertyId, itemId, navigate])

  if (!propertyId) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">No property selected. Set up your home first.</p>
      </PageContainer>
    )
  }

  if (resumePrompt) {
    // HH-113. This said "You have an incomplete setup" while holding the item's
    // name, brand, model, which step it stopped on and when it started — so
    // "Start fresh", the one irreversible button here, was a guess about what
    // you would be discarding. It also carried the pre-round-11 title, which is
    // why the owner's first screen did not look like the new flow.
    const summary = resumeSummary(resumePrompt, Date.now())
    return (
      <PageContainer>
        <PageHeader title="Pick up where you left off" subtitle={summary.when ? `You started this ${summary.when}.` : undefined} />
        <SectionCard className="p-6">
          <p className="text-lg font-semibold text-foreground">{summary.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{summary.missing}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleResume} className="sm:flex-1">Finish adding it</Button>
            <Button variant="outline" onClick={handleStartFresh} className="sm:flex-1">
              Start something else
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Starting something else leaves this item where it is — you can come back to it from Items.
          </p>
        </SectionCard>
      </PageContainer>
    )
  }

  // The header used to promise "Give it a name to get started" on every step —
  // including step 1, which asks for brand and model and has no name field at
  // all, and the lane chooser, which asks its own question. A subtitle that
  // describes a different screen is worse than none.
  const stepSubtitle =
    step === "identify"
      ? identifyMode === "choice"
        ? undefined
        : identifyMode === "appliance"
          // HH-123: name BOTH routes before either is used, so the choice is
          // known before the fields are even looked at.
          ? "Type the brand and model — or scan the label and we'll read it."
          : "A name is enough to start. Details can come later."
      : step === "manual"
        ? "This is where the upkeep comes from."
        : undefined

  return (
    <PageContainer>
      <PageHeader title={step === "manual" ? "Add the manual" : "Add an item"} subtitle={stepSubtitle} />

      {/* The stepper is gone. Owner, round 11: "the 1 - 2 breadcrumb at the top
          is not helpful and I don't think even accurate." Both true. At phone
          width its labels are hidden, so it was two unlabelled circles; it
          promised two steps for an arc that is really identify -> manual ->
          item page -> review -> track purchase; and in the SIMPLE lane
          handleIdentifyConfirm navigates straight to the item page, so "1 - 2"
          advertised a second step that lane never has. The buttons already name
          where they go ("Add the manual"), which is better wayfinding than a
          dot that cannot say what it is counting. */}

      {step === "identify" && (
        <IdentifyStep
          mode={identifyMode}
          data={identifyData}
          onModeChange={setIdentifyMode}
          onDataChange={setIdentifyData}
          onConfirm={handleIdentifyConfirm}
          isCreating={actionLoading}
          error={error}
          onRetry={() => setError(null)}
          onLabelPhoto={setLabelPhotoFile}
        />
      )}

      {step === "manual" && (
        <ManualStep
            brand={identifyData.brand}
            model={identifyData.model}
          key={manualStepKey}
          onConfirm={handleManualConfirm}
          onSkip={handleManualSkip}
          isSaving={actionLoading}
          savingMessage={savingMessage}
          error={error}
          onRetry={() => setError(null)}
          docClassification={
            manualDocGate
              ? {
                  docType: manualDocGate.docType,
                  confidence: manualDocGate.confidence,
                  reason: manualDocGate.reason,
                  filename: manualDocGate.filename,
                }
              : null
          }
          onDocClassificationUseAnyway={handleDocClassificationUseAnyway}
          onDocClassificationReplace={handleDocClassificationReplace}
        />
      )}

      {step === "plan" && itemId && (
        <PlanStep
          itemName={identifyData.name}
          brand={identifyData.brand || null}
          applianceTypeId={subTypeToLegacyApplianceTypeId(identifyData.subType)}
          itemCategory={identifyData.itemCategory}
          subType={identifyData.subType}
          categoryFields={identifyData.categoryFields}
          manualUrl={manualUrl}
          onFinish={handlePlanFinish}
          isSaving={actionLoading}
          error={error}
          onRetry={() => setError(null)}
        />
      )}

    </PageContainer>
  )
}
