import { useMemo, useState } from "react"
import { CheckIcon, ChevronLeftIcon } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  ITEM_CATEGORIES,
  getCategoryDefinition,
  type ItemCategoryId,
} from "@/modules/inventory/constants/itemCategories"
import { cn } from "@/lib/utils"

/**
 * Change what an item IS, from the item page.
 *
 * Room has been editable here since the last round; category was read-only and
 * rendered as a raw slug, which reads as a bug twice over — the wrong words,
 * and the one fact beside it that you can fix taunting you. Beta round 5:
 * "tapping Category doesn't open a picker the way Room does."
 *
 * Two steps rather than one flat list of ~90 subtypes: pick the category, then
 * optionally narrow it. "Just the category" is a real answer and stays one tap
 * away, because most items never need a subtype and the category is what drives
 * the maintenance rules.
 */
export function CategoryPickerDialog({
  open,
  onOpenChange,
  currentCategory,
  currentSubType,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentCategory: ItemCategoryId | null
  currentSubType: string | null
  /** Caller persists. subType is null when the category alone is the answer. */
  onPick: (category: ItemCategoryId, subType: string | null) => void
}) {
  const [drilledInto, setDrilledInto] = useState<ItemCategoryId | null>(null)

  // Reopening into a half-navigated state would be a small mystery every time.
  const view = open ? drilledInto : null

  const def = useMemo(() => (view ? getCategoryDefinition(view) : null), [view])

  const choose = (category: ItemCategoryId, subType: string | null) => {
    onPick(category, subType)
    setDrilledInto(null)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDrilledInto(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            {def && (
              <button
                type="button"
                onClick={() => setDrilledInto(null)}
                aria-label="Back to categories"
                className="-ml-1 rounded p-0.5"
                style={{ color: "var(--hh-sub)" }}
              >
                <ChevronLeftIcon className="size-[18px]" />
              </button>
            )}
            {def ? def.label : "Category"}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-0.5 overflow-y-auto">
          {!def &&
            ITEM_CATEGORIES.map((c) => {
              const selected = currentCategory === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => (c.subTypes.length > 0 ? setDrilledInto(c.id) : choose(c.id, null))}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14px]",
                    selected ? "font-semibold" : "font-medium"
                  )}
                  style={{
                    color: "var(--hh-ink)",
                    background: selected ? "color-mix(in srgb, var(--hh-teal) 10%, transparent)" : "transparent",
                  }}
                >
                  <span className="min-w-0 truncate">{c.label}</span>
                  {selected && <CheckIcon className="size-4 shrink-0" style={{ color: "var(--hh-teal)" }} />}
                </button>
              )
            })}

          {def && (
            <>
              <button
                type="button"
                onClick={() => choose(def.id, null)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14px] font-medium"
                style={{
                  color: "var(--hh-ink)",
                  background:
                    currentCategory === def.id && !currentSubType
                      ? "color-mix(in srgb, var(--hh-teal) 10%, transparent)"
                      : "transparent",
                }}
              >
                <span>Just “{def.label}”</span>
                {currentCategory === def.id && !currentSubType && (
                  <CheckIcon className="size-4 shrink-0" style={{ color: "var(--hh-teal)" }} />
                )}
              </button>

              {def.subTypes.map((group) => (
                <div key={group.group}>
                  <p
                    className="px-3 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: "var(--hh-faint)" }}
                  >
                    {group.group}
                  </p>
                  {group.options.map((o) => {
                    const selected = currentCategory === def.id && currentSubType === o.id
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => choose(def.id, o.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14px]",
                          selected ? "font-semibold" : "font-medium"
                        )}
                        style={{
                          color: "var(--hh-ink)",
                          background: selected ? "color-mix(in srgb, var(--hh-teal) 10%, transparent)" : "transparent",
                        }}
                      >
                        <span className="min-w-0 truncate">{o.label}</span>
                        {selected && <CheckIcon className="size-4 shrink-0" style={{ color: "var(--hh-teal)" }} />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        <p className="px-1 text-[11.5px]" style={{ color: "var(--hh-sub)" }}>
          Category shapes which upkeep we suggest for this item.
        </p>
      </DialogContent>
    </Dialog>
  )
}
