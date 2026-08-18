import { useState } from "react"
import { Loader2Icon } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { callable } from "@/integrations/firebase"
import { getItemUnit, updateItemUnit, type UpdateItemUnitInput } from "@/modules/items"
import { uploadReceiptImage } from "@/modules/inventory/services/storageService"

// Fire-and-forget recall check (CPSC). Errors are swallowed — a failed recall
// lookup must never block the Smart Add flow.
const checkRecallsCallable = callable<{ homeId: string; itemUnitId: string }, unknown>("checkRecalls")
const fireRecallCheck = (homeId: string, itemUnitId: string) =>
  void checkRecallsCallable({ homeId, itemUnitId }).catch(() => {})

interface PurchaseStepProps {
  homeId: string
  itemUnitId: string
  onComplete: () => void
  onSkip: () => void
  /** From a receipt/label scan in the identify step, if it read them. */
  initialPurchaseDate?: string | null
  initialPrice?: number | null
}

export function PurchaseStep({
  homeId, itemUnitId, onComplete, onSkip, initialPurchaseDate, initialPrice,
}: PurchaseStepProps) {
  // Prefilled when a label/receipt scan read these earlier. Shown rather than
  // saved quietly: OCR is a suggestion, and this is the step where the owner
  // gets to see it before it becomes a fact about their home.
  const [purchaseDate, setPurchaseDate] = useState(initialPurchaseDate ?? "")
  const [storeName, setStoreName] = useState("")
  const [priceStr, setPriceStr] = useState(initialPrice != null ? String(initialPrice) : "")
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    let receiptPath: string | null = null
    if (receiptFile) {
      const result = await uploadReceiptImage(itemUnitId, receiptFile)
      if (result.error) {
        setUploadError("Receipt upload failed — check your connection and try again.")
        setSaving(false)
        return
      }
      receiptPath = result.data!.path
    }

    const updates: UpdateItemUnitInput = {}
    if (purchaseDate.trim()) updates.purchase_date = purchaseDate.trim()
    if (storeName.trim()) updates.store_name = storeName.trim()
    const parsedPrice = priceStr.replace(/[^0-9.]/g, "")
    if (parsedPrice) updates.price_paid = parseFloat(parsedPrice)
    if (receiptPath) updates.receipt_storage_path = receiptPath

    // Derive the warranty expiry from purchase date + the item's warranty
    // months, folded into the same update.
    if (purchaseDate.trim()) {
      const itemRes = await getItemUnit(homeId, itemUnitId)
      const months = itemRes.data?.warranty_duration_months
      if (months != null && months > 0) {
        const [ey, em, ed] = purchaseDate.trim().split("-").map(Number)
        const expiry = new Date(ey, em - 1, ed)
        expiry.setMonth(expiry.getMonth() + months)
        updates.warranty_expiry_date = expiry.toISOString().split("T")[0]
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateItemUnit(homeId, itemUnitId, updates)
    }

    fireRecallCheck(homeId, itemUnitId)
    setSaving(false)
    onComplete()
  }

  const handleSkip = () => {
    fireRecallCheck(homeId, itemUnitId)
    onSkip()
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionCard className="p-6">
        <h2 className="font-medium mb-1">Purchase Details</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Optional — you can always fill this in from the item page later.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="purchase-date">Date purchased</Label>
            <Input
              id="purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="store-name">Store / Retailer</Label>
            <Input
              id="store-name"
              type="text"
              placeholder="e.g. Home Depot, Amazon"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="price-paid">Price paid</Label>
            <Input
              id="price-paid"
              type="text"
              placeholder="$ 0.00"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="receipt">Receipt (optional)</Label>
            <Input
              id="receipt"
              type="file"
              accept="image/*,.pdf"
              aria-invalid={!!uploadError}
              onChange={(e) => {
              setReceiptFile(e.target.files?.[0] ?? null)
              setUploadError(null)
            }}
              className="mt-1"
            />
            {uploadError && (
              <p className="text-sm text-destructive mt-1">{uploadError}</p>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleSkip}>
          Skip
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <>
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save purchase details →"
          )}
        </Button>
      </div>
    </div>
  )
}
