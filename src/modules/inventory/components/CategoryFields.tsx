import { useMemo } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  getCategoryDefinition,
  type CategoryFieldDef,
  type ItemCategoryId,
} from "../constants/itemCategories"

export type CategoryFieldsValue = Record<string, unknown>

type CategoryFieldsProps = {
  categoryId: ItemCategoryId
  subType: string | null
  value: CategoryFieldsValue
  onChange: (next: CategoryFieldsValue) => void
  idPrefix?: string
  className?: string
}

function isFieldVisible(
  def: CategoryFieldDef,
  subType: string | null,
  data: CategoryFieldsValue
): boolean {
  const sw = def.showWhen
  if (!sw) return true
  if (sw.subType?.length) {
    if (!subType || !sw.subType.includes(subType)) return false
  }
  if (sw.field !== undefined && sw.value !== undefined) {
    if (data[sw.field] !== sw.value) return false
  }
  return true
}

/**
 * Renders category-specific fields into a flat JSON object for `category_fields`.
 */
export function CategoryFields({
  categoryId,
  subType,
  value,
  onChange,
  idPrefix = "cf",
  className,
}: CategoryFieldsProps) {
  const def = useMemo(() => getCategoryDefinition(categoryId), [categoryId])
  const visibleFields = def.fields.filter((f) => isFieldVisible(f, subType, value))
  const visibleKeys = new Set(visibleFields.map((f) => f.key))

  const setKey = (key: string, v: unknown) => {
    // Prune keys for fields that are no longer visible
    const next: CategoryFieldsValue = {}
    for (const [k, existing] of Object.entries(value)) {
      if (visibleKeys.has(k) || k === key) next[k] = existing
    }
    next[key] = v
    onChange(next)
  }

  const fields = visibleFields

  return (
    <div className={cn("space-y-4", className)}>
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`
        const raw = value[field.key]

        if (field.type === "text") {
          return (
            <div key={field.key}>
              <label htmlFor={id} className="text-sm font-medium text-foreground block mb-1.5">
                {field.label}
              </label>
              <Input
                id={id}
                value={raw != null ? String(raw) : ""}
                placeholder={field.placeholder}
                onChange={(e) => setKey(field.key, e.target.value || null)}
                className="bg-muted border-border"
              />
            </div>
          )
        }

        if (field.type === "number") {
          return (
            <div key={field.key}>
              <label htmlFor={id} className="text-sm font-medium text-foreground block mb-1.5">
                {field.label}
              </label>
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                value={raw != null && raw !== "" ? String(raw) : ""}
                placeholder={field.placeholder}
                onChange={(e) => {
                  const t = e.target.value
                  setKey(field.key, t === "" ? null : Number(t))
                }}
                className="bg-muted border-border"
              />
            </div>
          )
        }

        if (field.type === "date") {
          return (
            <div key={field.key}>
              <label htmlFor={id} className="text-sm font-medium text-foreground block mb-1.5">
                {field.label}
              </label>
              <Input
                id={id}
                type="date"
                value={raw != null ? String(raw) : ""}
                onChange={(e) => setKey(field.key, e.target.value || null)}
                className="bg-muted border-border"
              />
            </div>
          )
        }

        if (field.type === "select") {
          return (
            <div key={field.key}>
              <label htmlFor={id} className="text-sm font-medium text-foreground block mb-1.5">
                {field.label}
              </label>
              <select
                id={id}
                value={raw != null ? String(raw) : ""}
                onChange={(e) => setKey(field.key, e.target.value || null)}
                className="w-full h-10 rounded-md border border-border bg-muted px-3 text-sm"
              >
                <option value="">—</option>
                {(field.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          )
        }

        if (field.type === "toggle") {
          const on = Boolean(raw)
          return (
            <div key={field.key} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="text-sm font-medium text-foreground">{field.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => setKey(field.key, !on)}
                className={cn(
                  "relative h-7 w-12 rounded-full transition-colors shrink-0",
                  on ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform",
                    on ? "translate-x-5" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          )
        }

        if (field.type === "multi-select") {
          const selected = Array.isArray(raw) ? (raw as string[]) : []
          const opts = field.options ?? []
          const toggle = (opt: string) => {
            const next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]
            setKey(field.key, next.length ? next : null)
          }
          return (
            <div key={field.key}>
              <p className="text-sm font-medium text-foreground mb-2">{field.label}</p>
              <div className="flex flex-wrap gap-2">
                {opts.map((opt) => {
                  const active = selected.includes(opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(opt)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"
                      )}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
