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
      display_name: values.name,
      category: values.subType ?? "other",
      brand: values.brand || null,
      model: values.model || null,
      room_id: values.locationId,
      item_category: values.itemCategory,
      sub_type: values.subType,
      category_fields: values.categoryFields,
    })
    if (result.error) return
    await refresh()
    setItemCount((c) => c + 1)
  }

  return (
    <div /* pt-safe-top: rendered OUTSIDE AppLayout, where the inset normally
       comes from — on an iPhone 17 the heading landed under the Dynamic Island */
    className="min-h-screen pt-safe-top flex flex-col items-center justify-center bg-background p-6">
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
