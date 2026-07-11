import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import {
  AddItemForm,
  useItems,
  useCreateItem,
  type AddItemFormValues,
} from "@/modules/inventory"
import { subTypeToLegacyApplianceTypeId } from "@/modules/inventory/constants/itemCategories"

/**
 * Post-property onboarding: add your first items (appliances, electronics).
 * User can add items or skip to dashboard.
 */
export default function OnboardingInventory() {
  const navigate = useNavigate()
  const [itemCount, setItemCount] = useState(0)
  const { refresh } = useItems()
  const { createItem, isCreating } = useCreateItem()

  const goToDashboard = () => navigate("/home", { replace: true })

  const handleAddItemSubmit = async (values: AddItemFormValues) => {
    const result = await createItem({
      name: values.name,
      brand: values.brand || null,
      model: values.model || null,
      location_id: values.locationId,
      item_category: values.itemCategory,
      sub_type: values.subType,
      category_fields: values.categoryFields,
      specs: { applianceTypeId: subTypeToLegacyApplianceTypeId(values.subType) },
    })
    if (result.error) return
    await refresh()
    setItemCount((c) => c + 1)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl">
        <PageHeader
          title="Add your first items"
          subtitle="Track appliances, electronics, and more. Add a few now or skip and do it later."
          centered
        />

        <div>
          <AddItemForm
            stepLabel={itemCount > 0 ? `Item #${itemCount + 1}` : undefined}
            onSubmit={handleAddItemSubmit}
            disabled={isCreating}
          />
          <div className="mt-6 text-center">
            <Button variant="ghost" onClick={goToDashboard}>
              Skip for now →
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
