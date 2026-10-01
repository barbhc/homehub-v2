import { Link } from "react-router-dom"
import { PageContainer, PageHeader, EmptyState, StaleDataNote } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { RefinedItems } from "@/components/home/RefinedItems"
import { ItemsLoadError, ItemsSkeleton } from "@/components/home/ItemsSkeleton"
import { useNotes } from "@/components/notes/useNotes"
import { getHomeNotes } from "@/modules/care"
import { DesktopItems } from "@/components/home/DesktopItems"
import { useHomeItems } from "@/lib/useHomeItems"
import { pageLoadState } from "@/lib/homeLoadingGate"
import type { ItemUnit, Room } from "@/integrations/types"

// ---------------------------------------------------------------------------
// Inventory page
// ---------------------------------------------------------------------------

// Stable empties, so the lists' memos (RefinedItems, DesktopItems) don't
// recompute on every render before the data arrives.
const NO_ITEMS: ItemUnit[] = []
const NO_ROOMS: Room[] = []

export default function Inventory() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  // Items + rooms, cached like Home: a revisit paints at once, a relaunch paints
  // the persisted snapshot while it revalidates, a hung read times out into
  // the error state. A failed read throws, so it is never cached as "no items".
  const { data, error, refresh } = useHomeItems(homeId)
  const items = data?.items ?? NO_ITEMS
  const rooms = data?.rooms ?? NO_ROOMS
  // Notes load on their own: a failed notes read must never cost the item list.
  const homeNotes = useNotes(homeId ? `home-notes:${homeId}` : null, () => getHomeNotes(homeId!))
  const retry = () => void refresh()

  // What to show is decided by what we HOLD, never by SWR's isLoading (true
  // while a warm snapshot revalidates) — see pageLoadState.
  const view = pageLoadState(data !== undefined, error !== undefined)
  if (view === "loading") {
    return (
      <PageContainer>
        {/* Keyed by home: a switch mid-load restarts the "Still loading…" wait. */}
        <ItemsSkeleton key={homeId ?? "no-home"} onRetry={retry} />
      </PageContainer>
    )
  }
  if (view === "error") {
    return (
      <PageContainer>
        <ItemsLoadError message={error?.message ?? "Something went wrong."} onRetry={retry} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      {/* A refresh failed behind a list we still hold: show the list, say so quietly.
          Aligned with the phone list's own gutter, and with the page at lg+. */}
      {error && (
        <div className="-mx-6 lg:mx-0">
          <div className="mx-auto w-full max-w-[460px] px-5 lg:max-w-none lg:px-0">
            <StaleDataNote onRetry={retry} />
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <>
          {/* The empty state keeps its pre-redesign header ("Inventory" + "Add
              Item"). It no longer shows while loading — ItemsSkeleton is the
              redesigned page — but retitling the empty state is the owner's
              call, so it is left as it was. */}
          <PageHeader
            title="Inventory"
            action={
              <Button asChild className="gap-2" size="sm">
                <Link to="/inventory/add">
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Item
                </Link>
              </Button>
            }
          />
          <EmptyState
          title="No items yet"
          description="Start with one appliance you'd hate to have break — the boiler, the washer, the fridge."
          teach="Photograph the label with the model number on it. Homehub finds the manual, reads it, and shows you the care it specifies before anything becomes a reminder."
          action={
            /* "See a sample home" sat here until round 18. Removed at the
               owner's request while the sample page is redesigned (BACKLOG §4b):
               it still renders the pre-round-18 layout, so pointing a signed-in
               user at it from the empty state means showing them a stale version
               of the product they are already inside.

               The route and the onboarding escape hatch both stay — this is one
               door closed for the duration, not the page retired. */
            <Button asChild size="sm">
              <Link to="/inventory/add">Add your first item</Link>
            </Button>
          }
        />
        </>
      ) : (
        <>
        {/* Redesigned Items — list (mobile) · card grid (desktop) */}
        <div className="lg:hidden -mx-6">
          <div className="mx-auto w-full max-w-[460px]">
            <RefinedItems items={items} rooms={rooms} notes={homeNotes.notes} notesError={homeNotes.error} />
          </div>
        </div>
        <div className="hidden lg:block">
          <DesktopItems items={items} rooms={rooms} notes={homeNotes.notes} notesError={homeNotes.error} />
        </div>
        </>
      )}
    </PageContainer>
  )
}
