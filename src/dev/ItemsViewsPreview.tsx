/**
 * Items with the Items | Warranties control, composed as the Items page
 * composes it. Lives in its own file because previewScenarios.tsx exports a
 * registry, and a file that exports a non-component cannot also hold one
 * (react-refresh/only-export-components).
 */
import { PageContainer } from "@/components/layout"
import { RefinedItems } from "@/components/home/RefinedItems"
import { DesktopItems } from "@/components/home/DesktopItems"
import { WarrantiesView } from "@/pages/WarrantiesPage"
import { useItemsView } from "@/hooks/usePageView"
import type { ItemUnit, Room } from "@/integrations/types"

export function ItemsViewsPreview({ items, rooms }: { items: ItemUnit[]; rooms: Room[] }) {
  const [view] = useItemsView()
  return (
    <PageContainer>
      <div className="lg:hidden -mx-6">
        <div className="mx-auto w-full max-w-[460px]"><RefinedItems items={items} rooms={rooms} /></div>
      </div>
      <div className="hidden lg:block"><DesktopItems items={items} rooms={rooms} /></div>
      {view === "warranties" && (
        <div className="-mx-6 lg:mx-0">
          <div className="mx-auto w-full max-w-[460px] px-5 lg:mx-0 lg:max-w-3xl lg:px-0">
            <WarrantiesView items={items} rooms={rooms} />
          </div>
        </div>
      )}
    </PageContainer>
  )
}
