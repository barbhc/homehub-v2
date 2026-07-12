import { useState, useCallback, useEffect } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { Loader2, Upload } from "lucide-react"
import { PageContainer, PageHeader, SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Stepper } from "@/components/smart-add/Stepper"
import { PlanStep, type EditableTask } from "@/components/smart-add/PlanStep"
import { useItem } from "@/modules/inventory"
import { useCurrentPropertyCompat as useCurrentProperty } from "@/modules/home"
import { useAuth } from "@/modules/auth"
import { updateItemUnit } from "@/modules/items"
import { createManualDocument } from "@/modules/knowledge"
import { mapApplianceTypeIdToCategory, subTypeToLegacyApplianceTypeId } from "@/modules/inventory/constants/itemCategories"
import { uploadManualPdfWithUrl, MAX_UPLOAD_BYTES } from "@/modules/inventory/services/storageService"
import { createTasksFromEditable } from "@/modules/care"
import { APPLIANCE_TYPES } from "@/modules/inventory/constants/applianceTypes"
import { RoomSelector } from "@/components/smart-add/RoomSelector"
import { DASHBOARD_PROPERTY_ID } from "@/lib/dashboard"
import type { WizardStep } from "@/lib/wizardSession"
import { cn } from "@/lib/utils"

type SetupStep = "confirm" | "manual" | "plan"

export default function InventoryItemSetup() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { item, loading: itemLoading, error: itemError } = useItem(id)
  const { property } = useCurrentProperty()
  const { user } = useAuth()

  const [step, setStep] = useState<SetupStep>("confirm")
  const [confirmData, setConfirmData] = useState({
    name: "",
    brand: "",
    model: "",
    applianceTypeId: "",
    locationId: null as string | null,
  })
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const propertyId = property?.id ?? item?.home_id ?? DASHBOARD_PROPERTY_ID

  // Seed confirm data from item once on first load
  const itemId = item?.item_unit_id
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- one-time sync from prop */
  useEffect(() => {
    if (!item) return
    setConfirmData((prev) =>
      prev.name ? prev : {
        name: item.display_name,
        brand: item.brand ?? "",
        model: item.model ?? "",
        // The legacy appliance-type grid id derives from the typed sub_type.
        applianceTypeId: subTypeToLegacyApplianceTypeId(item.sub_type) ?? "",
        locationId: item.room_id ?? null,
      }
    )
  }, [itemId])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const completedSteps = new Set<WizardStep>()
  if (step !== "confirm") completedSteps.add("identify")
  if (step === "plan") completedSteps.add("manual")

  const handleConfirmContinue = useCallback(async () => {
    if (!item || !propertyId) return
    setError(null)
    setActionLoading(true)
    // The legacy appliance-type grid pick maps onto the typed category fields.
    const mapped = mapApplianceTypeIdToCategory(confirmData.applianceTypeId || null)
    const result = await updateItemUnit(propertyId, item.item_unit_id, {
      display_name: confirmData.name.trim(),
      brand: confirmData.brand.trim() || null,
      model: confirmData.model.trim() || null,
      room_id: confirmData.locationId,
      ...(mapped.subType
        ? { category: mapped.subType, item_category: mapped.itemCategory, sub_type: mapped.subType }
        : {}),
    })
    setActionLoading(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setStep("manual")
  }, [item, propertyId, confirmData])

  const handleManualSkip = useCallback(() => {
    setManualUrl(null)
    setStep("plan")
  }, [])

  const handleManualPasteUrl = useCallback(async (url: string) => {
    if (!item || !propertyId) return
    setError(null)
    setActionLoading(true)
    // v2: the manual is a first-class document (homes/{homeId}/manuals), not a
    // specs breadcrumb — this is what the parse worker + item page read.
    const result = await createManualDocument(propertyId, {
      item_unit_id: item.item_unit_id,
      title: url,
      source_type: "url",
      source_ref: url,
    })
    setActionLoading(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setManualUrl(url)
    setStep("plan")
  }, [item, propertyId])

  const handlePlanFinish = useCallback(async (tasks: EditableTask[]) => {
    if (!item || !propertyId) return
    setError(null)
    setActionLoading(true)
    const effPropertyId = item.home_id ?? propertyId ?? DASHBOARD_PROPERTY_ID
    const result = await createTasksFromEditable(
      effPropertyId,
      item.item_unit_id,
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
    navigate(`/inventory/${item.item_unit_id}`, { state: { smartAddSuccess: true } })
  }, [item, propertyId, navigate])

  if (itemLoading) {
    return (
      <PageContainer>
        <div className="flex items-center gap-2 text-muted-foreground py-12" aria-busy="true" aria-label="Loading item">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span>Loading...</span>
        </div>
      </PageContainer>
    )
  }

  if (itemError || !item) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">{itemError ?? "Item not found."}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/inventory">Back to Inventory</Link>
        </Button>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Run Smart Setup"
        subtitle="Enrich this item with maintenance tasks"
      />

      <Stepper
        currentStep={step === "confirm" ? "identify" : step === "manual" ? "manual" : "plan"}
        completedSteps={completedSteps}
        className="mb-8"
        mode="skip-manual"
      />

      {step === "confirm" && (
        <div className="flex flex-col gap-6">
          <SectionCard className="p-6">
            <h2 className="text-sm font-medium text-foreground mb-4">Confirm details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5" htmlFor="setup-name">
                  Name
                </label>
                <Input
                  id="setup-name"
                  value={confirmData.name}
                  onChange={(e) => setConfirmData({ ...confirmData, name: e.target.value })}
                  placeholder="e.g., Kitchen Refrigerator"
                  maxLength={255}
                  required
                  aria-invalid={confirmData.name.trim().length === 0}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5" htmlFor="setup-brand">
                    Brand
                  </label>
                  <Input
                    id="setup-brand"
                    value={confirmData.brand}
                    onChange={(e) => setConfirmData({ ...confirmData, brand: e.target.value })}
                    placeholder="e.g., Samsung"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5" htmlFor="setup-model">
                    Model
                  </label>
                  <Input
                    id="setup-model"
                    value={confirmData.model}
                    onChange={(e) => setConfirmData({ ...confirmData, model: e.target.value })}
                    placeholder="e.g., RF28R7551SR"
                    maxLength={100}
                  />
                </div>
              </div>
              <RoomSelector
                value={confirmData.locationId}
                onChange={(id) => setConfirmData({ ...confirmData, locationId: id })}
                id="setup-room"
              />
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Appliance type
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1.5">
                  {APPLIANCE_TYPES.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setConfirmData({ ...confirmData, applianceTypeId: id })}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors",
                        confirmData.applianceTypeId === id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/30 hover:border-muted-foreground/30"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="text-xs font-medium text-center leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </div>
          )}
          <Button
            onClick={handleConfirmContinue}
            disabled={!confirmData.name.trim() || !confirmData.applianceTypeId || actionLoading}
            className="gap-2 w-fit"
          >
            {actionLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      )}

      {step === "manual" && (
        <SetupManualStep
          onSkip={handleManualSkip}
          onPasteUrl={handleManualPasteUrl}
          onUpload={async (file) => {
            if (!item || !propertyId) return
            setError(null)
            setActionLoading(true)
            const uploadResult = await uploadManualPdfWithUrl(item.item_unit_id, file, user?.id)
            if (uploadResult.error) {
              setError(uploadResult.error.message)
              setActionLoading(false)
              return
            }
            const url = uploadResult.data!.url
            // v2: register the upload as a first-class manual document so the
            // parse worker + item page can find it (no specs breadcrumbs).
            const result = await createManualDocument(propertyId, {
              item_unit_id: item.item_unit_id,
              title: file.name,
              source_type: "upload",
              source_ref: uploadResult.data!.path,
            })
            setActionLoading(false)
            if (result.error) {
              setError(result.error.message)
              return
            }
            setManualUrl(url)
            setStep("plan")
          }}
          isSaving={actionLoading}
          error={error}
          onRetry={() => setError(null)}
        />
      )}

      {step === "plan" && (
        <PlanStep
          itemName={confirmData.name}
          brand={confirmData.brand || null}
          applianceTypeId={confirmData.applianceTypeId || null}
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

type SetupManualStepProps = {
  onSkip: () => void
  onPasteUrl: (url: string) => void
  onUpload?: (file: File) => void
  isSaving?: boolean
  error?: string | null
  onRetry?: () => void
}

function SetupManualStep({ onSkip, onPasteUrl, onUpload, isSaving, error, onRetry }: SetupManualStepProps) {
  const [pasteUrl, setPasteUrl] = useState("")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"url" | "upload" | "skip">("url")

  return (
    <div className="flex flex-col gap-6">
      <SectionCard className="p-6">
        <p className="text-sm text-muted-foreground mb-4">
          Add a manual for more specific maintenance tasks. Paste a URL, upload a PDF, or skip—tasks
          will be generic based on appliance type.
        </p>
        <div className="flex gap-2 mb-4">
          <Button
            variant={activeTab === "url" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("url")}
          >
            Paste URL
          </Button>
          <Button
            variant={activeTab === "upload" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("upload")}
          >
            Upload PDF
          </Button>
          <Button
            variant={activeTab === "skip" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("skip")}
          >
            Skip
          </Button>
        </div>
        {activeTab === "url" && (
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5" htmlFor="setup-manual-url">
              Manual URL
            </label>
            <Input
              id="setup-manual-url"
              type="url"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://example.com/manual.pdf"
              maxLength={2048}
            />
            <Button
              className="mt-3 gap-2"
              onClick={() => pasteUrl.trim() && onPasteUrl(pasteUrl.trim())}
              disabled={!pasteUrl.trim() || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        )}
        {activeTab === "upload" && (
          <div>
            <input
              id="setup-manual-upload"
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                setUploadError(null)
                if (file && file.size > MAX_UPLOAD_BYTES) {
                  const sizeMB = Math.round(file.size / 1024 / 1024)
                  const limitMB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)
                  setUploadError(`File is ${sizeMB} MB — maximum is ${limitMB} MB. Try a smaller file.`)
                  setUploadedFile(null)
                  return
                }
                setUploadedFile(file)
              }}
            />
            <Button
              variant="outline"
              className="w-full gap-2 mb-2"
              onClick={() => document.getElementById("setup-manual-upload")?.click()}
              disabled={isSaving}
            >
              <Upload className="h-4 w-4" aria-hidden />
              {uploadedFile ? uploadedFile.name : "Choose PDF file"}
            </Button>
            {uploadError && (
              <p className="text-sm text-destructive mb-2">{uploadError}</p>
            )}
            {uploadedFile && onUpload && (
              <Button
                className="gap-2"
                onClick={() => onUpload(uploadedFile)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Uploading...
                  </>
                ) : (
                  "Upload & continue"
                )}
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Upload the owner's manual PDF for this appliance (max {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).
            </p>
          </div>
        )}
        {activeTab === "skip" && (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Tasks may be generic without a manual. You can add one later.
            </p>
            <Button onClick={onSkip} disabled={isSaving}>
              Skip & continue
            </Button>
          </div>
        )}
      </SectionCard>
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          {onRetry && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

