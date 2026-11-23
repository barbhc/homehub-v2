import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import type { Segment } from "@/components/ui/SegmentedControl"

/**
 * The views a page's segmented control switches between, held in the URL as
 * `?view=` (design/tasks-items-views.md). The first view is the page's own and
 * is the ABSENCE of the param, so `/maintenance` and `/inventory` are exactly
 * what they were; any other or unknown value falls back to it.
 *
 * The URL is the one source of truth: the page and both of its trees (phone and
 * desktop are both mounted) read it themselves, so no caller can forget to pass
 * the view down and leave one tree on the wrong one.
 */
export const TASKS_VIEWS = [
  { value: "upkeep", label: "Upkeep" },
  { value: "cleaning", label: "Cleaning" },
] as const satisfies readonly Segment<string>[]
export type TasksView = (typeof TASKS_VIEWS)[number]["value"]

export const ITEMS_VIEWS = [
  { value: "items", label: "Items" },
  { value: "warranties", label: "Warranties" },
] as const satisfies readonly Segment<string>[]
export type ItemsView = (typeof ITEMS_VIEWS)[number]["value"]

/** Where Clean lives now — every link that used to say `/clean`. */
export const CLEANING_PATH = "/maintenance?view=cleaning"
/** Where Warranties lives now — every link that used to say `/warranties`. */
export const WARRANTIES_PATH = "/inventory?view=warranties"

function usePageView<T extends string>(views: readonly Segment<T>[]): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get("view")
  const view = views.find((v) => v.value === raw)?.value ?? views[0].value
  const setView = useCallback(
    (next: T) =>
      // Replace, not push: switching a segment is looking at the page another
      // way, not going somewhere — Back still leaves the page (HIG).
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev)
          if (next === views[0].value) out.delete("view")
          else out.set("view", next)
          return out
        },
        { replace: true },
      ),
    [setParams, views],
  )
  return [view, setView]
}

export const useTasksView = () => usePageView<TasksView>(TASKS_VIEWS)
export const useItemsView = () => usePageView<ItemsView>(ITEMS_VIEWS)
