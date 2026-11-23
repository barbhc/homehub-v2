import { useNavigate } from "react-router-dom"
import { PageContainer, StaleDataNote } from "@/components/layout"
import { AddLaneChooser } from "@/components/smart-add/AddLaneChooser"
import { HouseNotesCard } from "@/components/notes/ItemsNotes"
import { useCurrentHome } from "@/modules/home"
import { RefinedItems } from "@/components/home/RefinedItems"
import { ItemsLoadError, ItemsSkeleton } from "@/components/home/ItemsSkeleton"
import { useNotes } from "@/components/notes/useNotes"
import { getHomeNotes } from "@/modules/care"
import { DesktopItems } from "@/components/home/DesktopItems"
import { WarrantiesView } from "@/pages/WarrantiesPage"
import { useItemsView } from "@/hooks/usePageView"
import { useId } from "react"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { segmentPanelProps } from "@/components/ui/segmentIds"
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
  const navigate = useNavigate()
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
  // Items | Warranties (?view=). Each tree draws its own header and control;
  // the Warranties view is mounted HERE, once, below both, from the items
  // already read. With no items there is no control and no view to switch to.
  const [itemsView] = useItemsView()
  // Each tree's control has ids of its own; the one Warranties panel is
  // labelled by the tree on screen.
  const phoneIds = useId()
  const desktopIds = useId()
  const isDesktop = useIsDesktop()

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
        // No items: the add screen's own lane chooser, headed for a first item
        // (owner, 2026-11-21). It replaced "No items yet" — two add buttons and
        // a promise that Homehub finds and reads the manual — and a pick opens
        // the add screen in that lane. House notes stay below it.
        <div className="mx-auto w-full max-w-lg pt-2.5 lg:mx-0">
          <h1 className="text-[1.75rem] font-extrabold tracking-[-0.7px]" style={{ color: "var(--hh-ink)" }}>Items</h1>
          <div className="mt-4">
            <AddLaneChooser heading="Add your first item" onPick={(lane) => navigate(`/inventory/add?lane=${lane}`)} />
          </div>
          <div className="mt-6"><HouseNotesCard notes={homeNotes.notes} error={homeNotes.error} /></div>
        </div>
      ) : (
        <>
        {/* Redesigned Items — list (mobile) · card grid (desktop) */}
        <div className="lg:hidden -mx-6">
          <div className="mx-auto w-full max-w-[460px]">
            <RefinedItems items={items} rooms={rooms} notes={homeNotes.notes} notesError={homeNotes.error} idBase={phoneIds} />
          </div>
        </div>
        <div className="hidden lg:block">
          <DesktopItems items={items} rooms={rooms} notes={homeNotes.notes} notesError={homeNotes.error} idBase={desktopIds} />
        </div>
        {itemsView === "warranties" && (
          // The phone list's gutter on phones; Warranties' own readable width at lg+.
          <div {...segmentPanelProps(isDesktop ? desktopIds : phoneIds, "warranties")} className="-mx-6 lg:mx-0">
            <div className="mx-auto w-full max-w-[460px] px-5 lg:mx-0 lg:max-w-3xl lg:px-0">
              <WarrantiesView items={items} rooms={rooms} />
            </div>
          </div>
        )}
        </>
      )}
    </PageContainer>
  )
}
