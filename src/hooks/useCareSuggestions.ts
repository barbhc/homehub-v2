/**
 * Everything the care library would offer this home, across every item and
 * the building — for the Tasks page's standing "Suggested" group.
 *
 * One read each of items, templates and the home doc; the library does the
 * rest in memory. Errors surface (the group shows them); an empty result is
 * only ever a real empty.
 *
 * SWR-backed and keyed by home. /maintenance mounts RefinedWeek and
 * DesktopTasks together and both call this hook; as a plain effect each ran
 * its own three reads, so every visit paid for them twice. One key per home
 * means one fetch the two trees share. Not persisted: the group is "always
 * last, never counted", so it loads behind the agenda and gates nothing.
 */
import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"
import { getItemUnits } from "@/modules/items"
import { getTaskTemplates, addLibraryTask, dismissLibrarySuggestion, applyLibraryBackstop } from "@/modules/care"
import { getHomeProfile } from "@/modules/home"
import type { ItemUnit, TaskTemplate } from "@/integrations/types"
import { suggestionsForItem, suggestionsForHome, type Suggestion, type CareFacts } from "../../shared/care/library"

export type PlacedSuggestion = Suggestion & { itemUnitId: string | null; itemName: string | null; /** the template a backstop applies to */ backstopTemplateId?: string }

const NO_ROWS: PlacedSuggestion[] = []

/** Throws on a failed read (a ServiceResult error or a rejection alike), so the group shows the failure — never a false "nothing to suggest". */
async function fetchSuggestions(homeId: string): Promise<PlacedSuggestion[]> {
  const [items, templates, profile] = await Promise.all([
    getItemUnits(homeId, { statusFilter: ["active", "stored"] }),
    getTaskTemplates(homeId),
    getHomeProfile(homeId),
  ])
  const failed = items.error ?? templates.error ?? profile.error
  if (failed || !items.data || !templates.data) throw new Error(failed?.message ?? "Could not load your home")
  return placeAll(items.data, templates.data, profile.data?.care_facts ?? {}, profile.data?.dismissed_care ?? [])
}

export function useCareSuggestions(homeId: string | null | undefined) {
  const key = homeId ? `care-suggestions:${homeId}` : null
  const { mutate: mutateKey } = useSWRConfig()
  const { data, error, mutate } = useSWR<PlacedSuggestion[]>(key, () => fetchSuggestions(homeId!), {
    // Read on mount, as the effect did — not on every focus/reconnect (SWR's
    // default). Three whole-collection reads for a group that is "always last,
    // never counted" don't earn a refetch each time the app comes forward.
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 5000,
    keepPreviousData: false,
  })

  // Take an added/dismissed row off the shared list — both trees at once. The
  // write already landed, so no refetch; the next read agrees with it.
  const remove = useCallback(
    (s: PlacedSuggestion) => {
      if (!key) return
      mutateKey<PlacedSuggestion[]>(
        key,
        (rs) => rs?.filter((r) => !(r.entry.key === s.entry.key && r.itemUnitId === s.itemUnitId)),
        { revalidate: false },
      ).catch((e: unknown) => {
        // The write already succeeded; a failed local removal only means the
        // row lingers until the next read. Logged, never surfaced as a failure.
        console.warn(`[care suggestions] could not update ${key}:`, e instanceof Error ? e.message : e)
      })
    },
    [key, mutateKey],
  )

  const add = useCallback(async (s: PlacedSuggestion) => {
    if (!homeId) return { error: { message: "No home" } }
    const res = s.backstopFor && s.backstopTemplateId
      ? await applyLibraryBackstop(homeId, s.backstopTemplateId, s.entry)
      : await addLibraryTask(homeId, s.itemUnitId, s.entry)
    if (res.error) return { error: res.error }
    remove(s)
    return { error: null }
  }, [homeId, remove])

  const dismiss = useCallback(async (s: PlacedSuggestion) => {
    if (!homeId) return { error: { message: "No home" } }
    const res = await dismissLibrarySuggestion(homeId, s.itemUnitId, s.entry.key)
    if (res.error) return { error: res.error }
    remove(s)
    return { error: null }
  }, [homeId, remove])

  return {
    rows: data ?? NO_ROWS,
    loading: key !== null && data === undefined && error === undefined,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    add,
    dismiss,
    reload: () => void mutate(),
  }
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
