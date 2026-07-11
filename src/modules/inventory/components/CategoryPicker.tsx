import { cn } from "@/lib/utils"
import { ITEM_CATEGORIES, type ItemCategoryId } from "../constants/itemCategories"

type CategoryPickerProps = {
  categoryId: ItemCategoryId | null
  subType: string | null
  onCategoryChange: (id: ItemCategoryId) => void
  onSubTypeChange: (id: string) => void
  className?: string
}

/**
 * Two-level picker: category tiles then grouped sub-type chips (includes "Other" per category).
 */
export function CategoryPicker({
  categoryId,
  subType,
  onCategoryChange,
  onSubTypeChange,
  className,
}: CategoryPickerProps) {
  const active = categoryId ? ITEM_CATEGORIES.find((c) => c.id === categoryId) : null

  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Category</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
          {ITEM_CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const selected = categoryId === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                title={cat.description}
                onClick={() => onCategoryChange(cat.id)}
                aria-label={`Select category ${cat.label}`}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 bg-muted border-border transition-colors min-h-[88px]",
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:border-muted-foreground/30"
                )}
              >
                <Icon className="h-6 w-6 shrink-0" aria-hidden />
                <span className="text-[11px] sm:text-xs font-medium text-center leading-tight">{cat.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {active && (
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Type</p>
          <p className="text-xs text-muted-foreground mb-3">{active.description}</p>
          <div className="space-y-4">
            {active.subTypes.map((group) => (
              <div key={group.group}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {group.group}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((opt) => {
                    const Icon = opt.icon
                    const selected = subType === opt.id
                    return (
                      <button
                        key={`${group.group}-${opt.id}`}
                        type="button"
                        onClick={() => onSubTypeChange(opt.id)}
                        aria-pressed={selected}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:border-muted-foreground/40"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
