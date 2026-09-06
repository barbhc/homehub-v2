/**
 * Everything the care library would offer this home, across every item and
 * the building — for the Tasks page's standing "Suggested" group.
 *
 * One read each of items, templates and the home doc; the library does the
 * rest in memory. Errors surface (the group shows them); an empty result is
 * only ever a real empty.
 */
import { useCallback, useEffect, useState } from "react"
import { getItemUnits } from "@/modules/items"
import { getTaskTemplates, addLibraryTask, dismissLibrarySuggestion, applyLibraryBackstop } from "@/modules/care"
import { getHomeProfile } from "@/modules/home"
import type { ItemUnit, TaskTemplate } from "@/integrations/types"
import { suggestionsForItem, suggestionsForHome, type Suggestion, type CareFacts } from "../../shared/care/library"

export type PlacedSuggestion = Suggestion & { itemUnitId: string | null; itemName: string | null; /** the template a backstop applies to */ backstopTemplateId?: string }

export function useCareSuggestions(homeId: string | null | undefined) {
  const [rows, setRows] = useState<PlacedSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!homeId) { setLoading(false); return }
    let alive = true
    setLoading(true)
    void (async () => {
      const [items, templates, profile] = await Promise.all([
        getItemUnits(homeId, { statusFilter: ["active", "stored"] }),
        getTaskTemplates(homeId),
        getHomeProfile(homeId),
      ])
      if (!alive) return
      const failed = items.error ?? templates.error ?? profile.error
      if (failed || !items.data || !templates.data) { setError(failed?.message ?? "Could not load your home"); setLoading(false); return }
      setRows(placeAll(items.data, templates.data, profile.data?.care_facts ?? {}, profile.data?.dismissed_care ?? []))
      setError(null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [homeId, reloadKey])

  const remove = (s: PlacedSuggestion) => setRows((rs) => rs.filter((r) => !(r.entry.key === s.entry.key && r.itemUnitId === s.itemUnitId)))

  const add = useCallback(async (s: PlacedSuggestion) => {
    if (!homeId) return { error: { message: "No home" } }
    const res = s.backstopFor && s.backstopTemplateId
      ? await applyLibraryBackstop(homeId, s.backstopTemplateId, s.entry)
      : await addLibraryTask(homeId, s.itemUnitId, s.entry)
    if (res.error) return { error: res.error }
    remove(s)
    return { error: null }
  }, [homeId])

  const dismiss = useCallback(async (s: PlacedSuggestion) => {
    if (!homeId) return { error: { message: "No home" } }
    const res = await dismissLibrarySuggestion(homeId, s.itemUnitId, s.entry.key)
    if (res.error) return { error: res.error }
    remove(s)
    return { error: null }
  }, [homeId])

  return { rows, loading, error, add, dismiss, reload: () => setReloadKey((k) => k + 1) }
}

/** Pure: items × templates × facts → placed suggestions, items first, then the home. */
export function placeAll(items: ItemUnit[], templates: TaskTemplate[], facts: CareFacts, homeDismissed: string[]): PlacedSuggestion[] {
  const byItem = new Map<string, TaskTemplate[]>()
  const homeTasks: TaskTemplate[] = []
  for (const t of templates) {
    if (!t.is_active || t.deleted_at) continue
    if (t.item_unit_id) byItem.set(t.item_unit_id, [...(byItem.get(t.item_unit_id) ?? []), t])
    else homeTasks.push(t)
  }
  const existing = (ts: TaskTemplate[]) => ts.map((t) => ({ title: t.title, scheduleType: t.schedule?.scheduleType ?? null, id: t.task_template_id }))
  const out: PlacedSuggestion[] = []
  for (const it of items) {
    const ex = existing(byItem.get(it.item_unit_id) ?? [])
    for (const s of suggestionsForItem(it, ex, it.dismissed_care ?? [])) {
      const tpl = s.backstopFor ? ex.find((e) => e.title === s.backstopFor!.title) : undefined
      out.push({ ...s, itemUnitId: it.item_unit_id, itemName: it.display_name, backstopTemplateId: tpl?.id })
    }
  }
  for (const s of suggestionsForHome(facts, existing(homeTasks), homeDismissed)) out.push({ ...s, itemUnitId: null, itemName: null })
  return out
}
