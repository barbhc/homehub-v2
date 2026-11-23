import { SubPage } from "@/components/layout/SubPage"
import { OwnTasksManager } from "@/components/tasks/OwnTasksManager"
import { useCurrentHome } from "@/modules/home"

/**
 * Your own tasks (/maintenance/custom): add a task for the whole home in your
 * own words, and delete one. Opened by "Add your own task" under the Upkeep
 * list; it replaces Settings' "Custom tasks" and Your home's "Add something
 * the library missed" (design/settings-your-home.md).
 */
export default function OwnTasksPage() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  return (
    <SubPage backTo="/maintenance" backLabel="Tasks" title="Your own tasks" testId="own-tasks-page">
      {homeId && <OwnTasksManager homeId={homeId} />}
    </SubPage>
  )
}
