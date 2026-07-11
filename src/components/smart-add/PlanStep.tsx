import { useState, useEffect, useMemo } from "react"
import { Loader2 } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TierBadge } from "@/components/tasks/TierBadge"
import { EffortLabel } from "@/components/tasks/EffortLabel"
import { generateTasksFromManual, type GeneratedTask } from "@/modules/inventory/services/planGenerationService"
import type { MaintenanceFreqUnit } from "@/integrations/types"
import type { ItemCategoryId } from "@/modules/inventory/constants/itemCategories"

const TIER_LABELS: Record<string, string> = {
  essential: "Essential",
  recommended: "Recommended",
  optional: "Optional",
}
const EFFORT_LABELS: Record<string, string> = {
  short: "Quick",
  medium: "Medium",
  long: "Long",
}

export type EditableTask = GeneratedTask & {
  title: string
  frequencyValue: number | null
  frequencyUnit: MaintenanceFreqUnit | null
  afterEachUse?: boolean
  priority: "essential" | "recommended" | "optional"
  effort: "short" | "medium" | "long"
}

type PlanStepProps = {
  itemName: string
  brand: string | null
  /** Legacy specs.applianceTypeId — used when typed category is not set */
  applianceTypeId?: string | null
  itemCategory?: ItemCategoryId | null
  subType?: string | null
  categoryFields?: Record<string, unknown> | null
  manualUrl?: string | null
  onFinish: (tasks: EditableTask[]) => void
  isSaving: boolean
  error: string | null
  onRetry?: () => void
}

const FREQ_OPTIONS: { value: number; unit: MaintenanceFreqUnit; label: string }[] = [
  { value: 1, unit: "weeks", label: "Weekly" },
  { value: 2, unit: "weeks", label: "Every 2 weeks" },
  { value: 1, unit: "months", label: "Monthly" },
  { value: 3, unit: "months", label: "Every 3 months" },
  { value: 6, unit: "months", label: "Every 6 months" },
  { value: 1, unit: "years", label: "Yearly" },
]

export function PlanStep({
  itemName,
  brand,
  applianceTypeId,
  itemCategory,
  subType,
  categoryFields,
  manualUrl,
  onFinish,
  isSaving,
  error,
  onRetry,
}: PlanStepProps) {
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<EditableTask[]>([])
  const [genError, setGenError] = useState<string | null>(null)

  // Stabilize categoryFields reference so it doesn't trigger re-fetches on every render
  const categoryFieldsKey = useMemo(
    () => JSON.stringify(categoryFields ?? null),
    [categoryFields]
  )

  useEffect(() => {
    let cancelled = false
    const parsedFields = categoryFieldsKey ? JSON.parse(categoryFieldsKey) : null
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setGenError(null)
    generateTasksFromManual({
      itemName,
      brand,
      manualText: null,
      applianceTypeId: applianceTypeId ?? null,
      manualUrl: manualUrl ?? null,
      itemCategory: itemCategory ?? null,
      subType: subType ?? null,
      categoryFields: parsedFields,
    })
      .then((result) => {
        if (cancelled) return
        if (result.error) {
          setGenError(result.error.message)
          setTasks([])
        } else {
          const list = (result.data ?? []).slice(0, 12).map((t) => ({
            ...t,
            title: t.title,
            frequencyValue: t.frequencyValue,
            frequencyUnit: t.frequencyUnit,
            priority: t.priority ?? "recommended",
            effort: t.effort ?? "medium",
          }))
          setTasks(list)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [itemName, brand, applianceTypeId, manualUrl, itemCategory, subType, categoryFieldsKey])

  const updateTask = (id: string, updates: Partial<EditableTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12" aria-busy="true" aria-label="Generating maintenance plan">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span>Generating maintenance plan...</span>
      </div>
    )
  }

  if (genError) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-destructive">
          {genError}
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionCard className="p-6">
        <p className="text-sm text-muted-foreground mb-4">
          Review and edit the suggested maintenance tasks. You can change titles and frequencies.
        </p>
        <div className="space-y-3 max-h-[320px] overflow-y-auto">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/20"
            >
              <div className="flex gap-2 items-start flex-wrap">
                <Input
                  value={task.title}
                  onChange={(e) => updateTask(task.id, { title: e.target.value })}
                  maxLength={255}
                  aria-invalid={task.title.trim().length === 0}
                  className="flex-1 min-w-[180px] font-medium"
                />
                <select
                  aria-label={`Frequency for ${task.title || "task"}`}
                  value={
                    task.afterEachUse
                      ? "after_each_use"
                      : task.frequencyValue && task.frequencyUnit
                        ? `${task.frequencyValue}-${task.frequencyUnit}`
                        : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) {
                      updateTask(task.id, { frequencyValue: null, frequencyUnit: null, afterEachUse: false })
                      return
                    }
                    if (v === "after_each_use") {
                      updateTask(task.id, { frequencyValue: null, frequencyUnit: null, afterEachUse: true })
                      return
                    }
                    const [val, unit] = v.split("-")
                    updateTask(task.id, {
                      frequencyValue: parseInt(val, 10),
                      frequencyUnit: unit as MaintenanceFreqUnit,
                      afterEachUse: false,
                    })
                  }}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-background w-44"
                >
                  <option value="">One-time</option>
                  <option value="after_each_use">After each use</option>
                  {FREQ_OPTIONS.map((o) => (
                    <option
                      key={`${o.value}-${o.unit}`}
                      value={`${o.value}-${o.unit}`}
                    >
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <TierBadge tier={task.priority ?? "recommended"} />
                <select
                  aria-label={`Change tier for ${task.title || "task"}`}
                  value={task.priority ?? "recommended"}
                  onChange={(e) => updateTask(task.id, { priority: e.target.value as "essential" | "recommended" | "optional" })}
                  className="text-xs border border-border rounded px-2 py-1 bg-background"
                >
                  {(["essential", "recommended", "optional"] as const).map((p) => (
                    <option key={p} value={p}>{TIER_LABELS[p]}</option>
                  ))}
                </select>
                <EffortLabel effort={task.effort ?? "medium"} />
                <select
                  aria-label={`Change effort for ${task.title || "task"}`}
                  value={task.effort ?? "medium"}
                  onChange={(e) => updateTask(task.id, { effort: e.target.value as "short" | "medium" | "long" })}
                  className="text-xs border border-border rounded px-2 py-1 bg-background"
                >
                  {(["short", "medium", "long"] as const).map((eff) => (
                    <option key={eff} value={eff}>{EFFORT_LABELS[eff]}</option>
                  ))}
                </select>
              </div>
              {task.instructions && (
                <p className="text-xs text-muted-foreground pl-0">
                  {task.instructions}
                </p>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          {onRetry && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      )}

      <Button
        onClick={() => onFinish(tasks)}
        disabled={tasks.length === 0 || isSaving}
        className="gap-2 w-fit"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Adding tasks...
          </>
        ) : (
          `Add ${tasks.length} task${tasks.length === 1 ? "" : "s"} & finish`
        )}
      </Button>
    </div>
  )
}
