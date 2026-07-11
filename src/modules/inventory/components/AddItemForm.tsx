import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RoomSelector } from "@/components/smart-add/RoomSelector"
import { CategoryPicker } from "./CategoryPicker"
import { CategoryFields } from "./CategoryFields"
import { getSubTypeLabel, type ItemCategoryId } from "../constants/itemCategories"
import { cn } from "@/lib/utils"

export type AddItemFormValues = {
  itemCategory: ItemCategoryId
  subType: string
  categoryFields: Record<string, unknown>
  name: string
  brand: string
  model: string
  locationId: string | null
}

type AddItemFormProps = {
  stepLabel?: string
  onSubmit: (values: AddItemFormValues) => void
  onBack?: () => void
  disabled?: boolean
  className?: string
}

/**
 * Manual add form: category + sub-type + optional details, then name / make / model.
 */
export function AddItemForm({
  stepLabel = "Appliance #1",
  onSubmit,
  onBack,
  disabled = false,
  className,
}: AddItemFormProps) {
  const [itemCategory, setItemCategory] = useState<ItemCategoryId | null>(null)
  const [subType, setSubType] = useState<string | null>(null)
  const [categoryFields, setCategoryFields] = useState<Record<string, unknown>>({})
  const [name, setName] = useState("")
  const [brand, setBrand] = useState("")
  const [model, setModel] = useState("")
  const [locationId, setLocationId] = useState<string | null>(null)
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)

  const handleCategoryChange = (id: ItemCategoryId) => {
    setItemCategory(id)
    setSubType(null)
    setCategoryFields({})
    if (!nameManuallyEdited) {
      setName("")
    }
  }

  const handleSubTypeChange = (id: string) => {
    setSubType(id)
    if (!nameManuallyEdited && itemCategory) {
      const label = getSubTypeLabel(itemCategory, id) ?? id
      setName(label)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemCategory || !subType) return
    const subLabel = getSubTypeLabel(itemCategory, subType) ?? subType
    const finalName = name.trim() || subLabel
    onSubmit({
      itemCategory,
      subType,
      categoryFields,
      name: finalName,
      brand: brand.trim(),
      model: model.trim(),
      locationId,
    })
  }

  const canSubmit = Boolean(itemCategory && subType)

  return (
    <div className={cn("max-w-2xl mx-auto bg-background rounded-xl p-6", className)}>
      {stepLabel && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mb-6 rounded-full bg-muted border-border text-foreground"
          onClick={onBack}
        >
          + {stepLabel}
        </Button>
      )}

      <h1 className="text-3xl font-display font-normal text-foreground mb-2">
        What are you adding?
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Pick a category and type, then add optional details.
      </p>

      <form onSubmit={handleSubmit}>
        <CategoryPicker
          categoryId={itemCategory}
          subType={subType}
          onCategoryChange={handleCategoryChange}
          onSubTypeChange={handleSubTypeChange}
          className="mb-8"
        />

        {itemCategory && subType && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-foreground mb-3">Details (optional)</h2>
            <CategoryFields
              categoryId={itemCategory}
              subType={subType}
              value={categoryFields}
              onChange={setCategoryFields}
              idPrefix="add-item-cf"
            />
          </div>
        )}

        <div className="mb-6">
          <RoomSelector
            value={locationId}
            onChange={setLocationId}
            id="add-item-room"
          />
        </div>
        <div className="mb-6">
          <label className="text-sm font-medium text-foreground block mb-1.5" htmlFor="add-item-name">
            Name
          </label>
          <Input
            id="add-item-name"
            placeholder={
              itemCategory && subType
                ? `${getSubTypeLabel(itemCategory, subType) ?? "Item"} name`
                : "e.g., Kitchen refrigerator"
            }
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameManuallyEdited(true)
            }}
            maxLength={255}
            className="bg-muted border-border"
          />
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Optional: Add make and model for more specific maintenance tips.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5" htmlFor="add-item-brand">
              Make / Brand
            </label>
            <Input
              id="add-item-brand"
              placeholder="e.g., Samsung"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              maxLength={100}
              className="bg-muted border-border"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5" htmlFor="add-item-model">
              Model
            </label>
            <Input
              id="add-item-model"
              placeholder="e.g., RF28R7551SR"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              maxLength={100}
              className="bg-muted border-border"
            />
          </div>
        </div>

        <div className="flex gap-3">
          {onBack && (
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
          )}
          <Button
            type="submit"
            disabled={!canSubmit || disabled}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Add item
          </Button>
        </div>
      </form>
    </div>
  )
}
