import { SubPage } from "@/components/layout/SubPage"
import { RoomsManager } from "@/components/items/RoomsManager"
import { useCurrentHome } from "@/modules/home"

/**
 * Rooms (/inventory/rooms): rename, add and delete the home's rooms. Opened
 * by "Edit rooms" under the Items list; it lived in Settings until the
 * settings menu (design/settings-your-home.md).
 */
export default function RoomsPage() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  return (
    <SubPage backTo="/inventory" backLabel="Items" title="Rooms" testId="rooms-page">
      {homeId && <RoomsManager homeId={homeId} />}
    </SubPage>
  )
}
