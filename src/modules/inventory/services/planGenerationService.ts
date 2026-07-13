/**
 * Plan generation service — create maintenance tasks from manual content.
 * Calls the generate-tasks Supabase Edge Function (Anthropic Claude API).
 */
import { callable } from "@/integrations/firebase"
import type { MaintenanceFreqUnit } from "@/integrations/types"
import type { ItemCategoryId } from "@/modules/inventory/constants/itemCategories"

const generateTasksCallable = callable<
  {
    itemName: string
    brand: string
    applianceTypeId: string
    manualUrl: string | null
    itemCategory: string | null
    subType: string | null
    categoryFields: Record<string, unknown> | null
  },
  { tasks?: GeneratedTask[] }
>("generateTasks")

export type GeneratedTask = {
  id: string
  title: string
  frequencyValue: number | null
  frequencyUnit: MaintenanceFreqUnit | null
  type: string
  instructions: string
  priority: "essential" | "recommended" | "optional"
  effort: "short" | "medium" | "long"
}

export type PlanGenerationResult =
  | { data: GeneratedTask[]; error: null }
  | { data: null; error: { message: string } }

const VALID_UNITS: MaintenanceFreqUnit[] = ["days", "weeks", "months", "years"]

export type GenerateTasksFromManualParams = {
  itemName: string
  brand: string | null
  manualText?: string | null
  applianceTypeId?: string | null
  manualUrl?: string | null
  itemCategory?: ItemCategoryId | null
  subType?: string | null
  categoryFields?: Record<string, unknown> | null
}

/**
 * Generate maintenance tasks from manual (or generic list if no manual).
 */
export async function generateTasksFromManual(
  params: GenerateTasksFromManualParams
): Promise<PlanGenerationResult> {
  const {
    itemName,
    brand,
    manualText: _manualText,
    applianceTypeId,
    manualUrl,
    itemCategory,
    subType,
    categoryFields,
  } = params
  void _manualText

  try {
    let data: { tasks?: GeneratedTask[] }
    try {
      data = await generateTasksCallable({
        itemName: itemName || "Appliance",
        brand: brand ?? "",
        applianceTypeId: applianceTypeId ?? "other",
        manualUrl: manualUrl ?? null,
        itemCategory: itemCategory ?? null,
        subType: subType ?? null,
        categoryFields: categoryFields ?? null,
      })
    } catch {
      return { data: null, error: { message: "Task generation service unavailable. Try again in a moment, or skip and add tasks later from the item page." } }
    }

    const VALID_PRIORITIES: Array<"essential" | "recommended" | "optional"> = ["essential", "recommended", "optional"]
    const VALID_EFFORTS: Array<"short" | "medium" | "long"> = ["short", "medium", "long"]
    const rawTasks = data?.tasks ?? []
    const tasks: GeneratedTask[] = rawTasks.map((t) => {
      const unit = t.frequencyUnit as string | null
      const frequencyUnit = unit && VALID_UNITS.includes(unit as MaintenanceFreqUnit) ? (unit as MaintenanceFreqUnit) : null
      const rawPriority = (t as { priority?: string }).priority
      const rawEffort = (t as { effort?: string }).effort
      const priority: "essential" | "recommended" | "optional" =
        rawPriority && VALID_PRIORITIES.includes(rawPriority as "essential" | "recommended" | "optional")
          ? (rawPriority as "essential" | "recommended" | "optional")
          : "recommended"
      const effort: "short" | "medium" | "long" =
        rawEffort && VALID_EFFORTS.includes(rawEffort as "short" | "medium" | "long")
          ? (rawEffort as "short" | "medium" | "long")
          : "medium"
      return {
        id: (t as { id?: string }).id ?? crypto.randomUUID(),
        title: t.title ?? "Maintenance task",
        frequencyValue: t.frequencyValue ?? null,
        frequencyUnit,
        type: t.type ?? "maintenance",
        instructions: t.instructions ?? "",
        priority,
        effort,
      }
    })

    return { data: tasks, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Task generation failed"
    return { data: null, error: { message } }
  }
}
