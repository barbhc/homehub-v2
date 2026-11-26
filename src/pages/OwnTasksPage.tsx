import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { SubPage } from "@/components/layout/SubPage"
import { LoadErrorState } from "@/components/layout/LoadStates"
import { OwnTasksManager } from "@/components/tasks/OwnTasksManager"
import { useCurrentHome } from "@/modules/home"
import { getItemUnit } from "@/modules/items/services/itemService"
import { readItemParam } from "@/lib/itemParam"

/**
 * Your own tasks (/maintenance/custom): add a task for the whole home in your
 * own words, and delete one. Opened by "Add your own task" under the Upkeep
 * list; it replaces Settings' "Custom tasks" and Your home's "Add something
 * the library missed" (design/settings-your-home.md).
 *
 * `?item=<id>` (seventeen fixes, mock m4): opened from an item page's "Add
 * Your Own Task", the form starts with that item picked and the task lives on
 * it. The id is URL input: it must look like a document id, and it must be an
 * item of THIS home (read before it is used) — anything else is ignored and
 * the form is for the whole home, as without the parameter.
 */

type ItemRead =
  | { key: string; result: "missing" | "failed" }
  | { key: string; result: "found"; id: string; name: string }

export default function OwnTasksPage() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  const [params, setParams] = useSearchParams()
  const itemId = readItemParam(params.get("item"))
  const key = `${homeId ?? ""}/${itemId ?? ""}`
  const [read, setRead] = useState<ItemRead | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!homeId || !itemId) return
    let cancelled = false
    void getItemUnit(homeId, itemId).then((res) => {
      if (cancelled) return
      if (res.error) {
        console.warn(`[own tasks] could not read item ${itemId} (home ${homeId}):`, res.error.message)
        setRead({ key, result: "failed" })
      } else if (!res.data) {
        // Not this home's item, or gone: the form is for the whole home.
        setRead({ key, result: "missing" })
      } else {
        setRead({ key, result: "found", id: res.data.item_unit_id, name: res.data.display_name })
      }
    })
    return () => { cancelled = true }
  }, [homeId, itemId, key, attempt])

  // The read for THIS home and item, once it has answered.
  const answered = itemId && read?.key === key ? read : null
  const forItem = answered?.result === "found" ? { id: answered.id, name: answered.name } : null
  const waiting = !!itemId && !answered

  return (
    <SubPage
      backTo={forItem ? `/inventory/${forItem.id}` : "/maintenance"}
      backLabel={forItem ? forItem.name : "Tasks"}
      title="Your own tasks"
      testId="own-tasks-page"
    >
      {answered?.result === "failed" ? (
        <LoadErrorState
          title="Couldn't load that item"
          message="Check your connection and try again."
          onRetry={() => { setRead(null); setAttempt((n) => n + 1) }}
        />
      ) : waiting ? (
        // Never a whole-home form while the item it was opened for is unknown.
        <p className="text-[0.875rem]" style={{ color: "var(--hh-sub)" }}>Loading…</p>
      ) : (
        // Keyed by home and item: a switch starts the page over, list included.
        homeId && (
          <OwnTasksManager
            key={`${homeId}/${forItem?.id ?? ""}`}
            homeId={homeId}
            forItem={forItem}
            onClearItem={() => setParams({}, { replace: true })}
          />
        )
      )}
    </SubPage>
  )
}
