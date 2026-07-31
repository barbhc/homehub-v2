import { useState, useCallback, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { PageContainer, PageHeader, SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Stepper } from "@/components/smart-add/Stepper"
import {
  IdentifyStep,
  DEFAULT_IDENTIFY_DATA,
  type IdentifyData,
  type IdentifyMode,
} from "@/components/smart-add/IdentifyStep"
import { ManualStep, type ManualSourceChoice } from "@/components/smart-add/ManualStep"
import { PlanStep, type EditableTask } from "@/components/smart-add/PlanStep"
import { PurchaseStep } from "@/components/smart-add/PurchaseStep"
import { ParseProgressStep, type ParseProgressState } from "@/components/smart-add/ParseProgressStep"
import { ParseReviewStep } from "@/components/smart-add/ParseReviewStep"
import { useCurrentPropertyCompat as useCurrentProperty } from "@/modules/home"
import { useAuth } from "@/modules/auth"
import { createItemUnit } from "@/modules/items"
import { createTasksFromEditable } from "@/modules/care"
import { uploadManualPdf, removeManualPdf, uploadItemPhoto } from "@/modules/inventory/services/storageService"
import { resolveStorageUrl } from "@/integrations/firebase"
import { deleteManualDocument } from "@/modules/knowledge/services/manualDocumentService"
import { createManualDocument, parseManualAndWait, getChunksByItem, detectDocType, type DocType, type ParsedConfidence } from "@/modules/knowledge"
import { getTaskTemplatesWithSchedulesByItem, type TaskTemplateWithSchedule } from "@/modules/care"
import type { KnowledgeChunk } from "@/integrations/types"
import {
  getWizardSession,
  updateWizardSession,
  clearWizardSession,
  type WizardStep,
} from "@/lib/wizardSession"
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
  const [resumePrompt, setResumePrompt] = useState(false)

  const [parsedChunks, setParsedChunks] = useState<KnowledgeChunk[]>([])
  const [parsedTasks, setParsedTasks] = useState<TaskTemplateWithSchedule[]>([])
  const [parseConfidence, setParseConfidence] = useState<ParsedConfidence | null>(null)
  const [parseProgress, setParseProgress] = useState<ParseProgressState>("idle")
  /** True after a successful parse when entering the review step (not plan fallback). */
  const [parseFlowCompleted, setParseFlowCompleted] = useState(false)

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
  if (hasManual && (step === "review" || step === "purchase") && parseFlowCompleted) {
    completedSteps.add("parsing")
  }
  if (hasManual && step === "purchase" && parseFlowCompleted) completedSteps.add("review")
  if (step === "plan") completedSteps.add("manual")
  if (step === "purchase" && !hasManual) completedSteps.add("plan")

  const stepperMode =
    step === "plan" || (step === "purchase" && !hasManual) ? "skip-manual" : "full"

  const checkResume = useCallback(() => {
    const session = getWizardSession()
    if (!session || !propertyId || session.propertyId !== propertyId) {
      setLoading(false)
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
    setResumePrompt(false)
    setLoading(false)
  }, [propertyId])

  useEffect(() => {
    const session = getWizardSession()
    if (session && propertyId && session.propertyId === propertyId) {
      setResumePrompt(true)
    }
    setLoading(false)
  }, [propertyId])

  const handleResume = () => {
    checkResume()
  }

  const handleStartFresh = () => {
    clearWizardSession()
    setResumePrompt(false)
    setItemId(null)
    setIdentifyMode("choice")
    setIdentifyData({ ...DEFAULT_IDENTIFY_DATA })
    setLabelPhotoFile(null)
    setManualDocGate(null)
    setManualStepKey((k) => k + 1)
    setHasManual(false)
    setManualUrl(null)
    setHasTasks(false)
    setParsedChunks([])
    setParsedTasks([])
    setParseConfidence(null)
    setParseProgress("idle")
    setParseFlowCompleted(false)
    setStep("identify")
  }

  const handleIdentifyConfirm = useCallback(async () => {
    if (!propertyId) return
    setError(null)
    setActionLoading(true)
    // Firestore item (homes/{homeId}/items): `category` is the specific type
    // slug (matches sub_type); the RoomSelector's locationId is a room id.
    const result = await createItemUnit({
      home_id: propertyId,
      room_id: identifyData.locationId,
      display_name: identifyData.name.trim(),
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
    clearWizardSession()
    navigate(`/items/${created.item_unit_id}`)
  }, [propertyId, identifyData, labelPhotoFile, user?.id, navigate])

  const runParseAfterManualUpload = useCallback(
    async (firstManualId: string, firstUrl: string | null) => {
      if (!propertyId || !itemId) return
      setStep("parsing")
      setParseProgress("uploading")
      updateWizardSession({ step: "parsing" })
      setParsedChunks([])
      setParsedTasks([])

      try {
        setManualUrl(firstUrl)
        setSavingMessage(undefined)
        // Trust arc (fix B): stream the worker's live stages and resolve ONLY at
        // a terminal state. The worker reaches "done" only after committing to
        // Firestore, so the review below can never be empty. State lives in
        // Firestore → the wizard survives a tab refresh mid-parse.
        const parseResult = await parseManualAndWait(
          firstManualId,
          { homeId: propertyId },
          (ui) => {
            if (isMountedRef.current) setParseProgress(ui)
          }
        )

        if (!parseResult.ok) {
          // onStage already set "error"; fall back to the manual plan step.
          setStep("plan")
          updateWizardSession({ step: "plan" })
          setHasTasks(false)
          return
        }

        const nextConfidence: ParsedConfidence | null = parseResult.confidence ?? null
        setParseConfidence(nextConfidence)

        // done → the commit has already happened server-side; now the fetched
        // chunks/tasks are guaranteed populated (no more fire-and-forget race).
        const [chunksRes, tasksRes] = await Promise.all([
          getChunksByItem(propertyId, itemId),
          getTaskTemplatesWithSchedulesByItem(propertyId, itemId),
        ])

        setParsedChunks(chunksRes.data ?? [])
        setParsedTasks(tasksRes.data ?? [])
        setHasTasks(true)
        setParseProgress("done")
        updateWizardSession({ hasTasks: true, step: "review", parseConfidence: nextConfidence })

        setParseFlowCompleted(true)
        await new Promise((r) => setTimeout(r, 700))
        if (isMountedRef.current) setStep("review")
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong"
        setError(msg)
        setParseProgress("error")
        setStep("manual")
      } finally {
        setSavingMessage(undefined)
      }
    },
    [propertyId, itemId]
  )

  const handleManualConfirm = useCallback(
    async (choices: ManualSourceChoice[]) => {
      if (!propertyId || !itemId) return
    setActionLoading(true)
      setError(null)
      setParsedChunks([])
      setParsedTasks([])

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
            const uploadRes = await uploadManualPdf(itemId, choice.file, user?.id)
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

        await runParseAfterManualUpload(firstManualId, firstUrl)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong"
        setError(msg)
        setParseProgress("error")
        setStep("manual")
      } finally {
        setActionLoading(false)
        setSavingMessage(undefined)
      }
    },
    [propertyId, itemId, user?.id, runParseAfterManualUpload]
  )

  const handleDocClassificationUseAnyway = useCallback(async () => {
    if (!manualDocGate) return
    const g = manualDocGate
    setManualDocGate(null)
    setActionLoading(true)
    setError(null)
    try {
      await runParseAfterManualUpload(g.firstManualId, g.firstUrl)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      setStep("manual")
    } finally {
      setActionLoading(false)
    }
  }, [manualDocGate, runParseAfterManualUpload])

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

  const handleReviewFinish = useCallback(() => {
    setStep("purchase")
    updateWizardSession({ step: "purchase" })
  }, [])

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
    updateWizardSession({ step: "purchase" })
    setStep("purchase")
  }, [propertyId, itemId])

  if (!propertyId) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">No property selected. Set up your home first.</p>
      </PageContainer>
    )
  }

  if (resumePrompt) {
    return (
      <PageContainer>
        <PageHeader title="Smart Add Item" subtitle="Add an appliance with guided setup" />
        <SectionCard className="p-6">
          <p className="text-sm text-muted-foreground mb-4">
            You have an incomplete setup. Would you like to resume?
          </p>
          <div className="flex gap-3">
            <Button onClick={handleResume}>Resume setup</Button>
            <Button variant="outline" onClick={handleStartFresh}>
              Start fresh
            </Button>
          </div>
        </SectionCard>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Add item"
        subtitle="Give it a name to get started — add details and a manual after"
      />

      <Stepper
        currentStep={step}
        completedSteps={completedSteps}
        className="mb-8"
        mode={stepperMode}
      />

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

      {step === "parsing" && (
        <ParseProgressStep
          progress={parseProgress}
          parsedChunks={parsedChunks}
          parsedTasks={parsedTasks}
        />
      )}

      {step === "review" && propertyId && (
        <ParseReviewStep
          homeId={propertyId}
          itemUnitId={itemId ?? undefined}
          chunks={parsedChunks}
          tasks={parsedTasks}
          confidence={parseConfidence}
          onChunksChange={setParsedChunks}
          onTasksChange={setParsedTasks}
          onFinish={handleReviewFinish}
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

      {step === "purchase" && itemId && (
        <PurchaseStep
          homeId={propertyId}
          itemUnitId={itemId}
          onComplete={() => {
            clearWizardSession()
            navigate(`/inventory/${itemId}`, { state: { smartAddSuccess: true } })
          }}
          onSkip={() => {
            clearWizardSession()
            navigate(`/inventory/${itemId}`, { state: { smartAddSuccess: true } })
          }}
        />
      )}
    </PageContainer>
  )
}
