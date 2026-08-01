import { PageContainer } from "@/components/layout"
import { useCurrentHome } from "@/modules/home"
import { RefinedWeek } from "@/components/home/RefinedWeek"
import { DesktopTasks } from "@/components/home/DesktopTasks"

/**
 * The Tasks page (routed at /maintenance — the bottom nav calls it "Tasks").
 *
 * A routing shell, and only that. Everything this page used to do now lives in
 * the two components below, each of which fetches its own week agenda:
 * RefinedWeek on phones, DesktopTasks at lg+.
 *
 * What was here until now: 263 lines of superseded UI — an "All Tasks" header,
 * status tabs, tier chips, a room select, a Group-by control, a task list, a
 * bulk-action bar and an Add Task sheet — wrapped in `<div className="hidden">`
 * with a note parking it "until the desktop redesign lands". That redesign
 * landed, but the block stayed: invisible on screen, still mounted in the DOM,
 * still shipped in the chunk, and still costing a getAllMaintenanceTasks +
 * getDashboardStats round trip on every visit for data nothing rendered.
 *
 * It cost more than bytes. Hidden markup that still compiles reads exactly like
 * live code when you go looking for a control to change — the Group-by strip in
 * here was edited twice during the header redesign before anyone noticed it
 * could not appear on screen. Delete parked UI, or it becomes a decoy.
 *
 * NOTE: this removed the app's only "Add Task" affordance. It was already
 * unreachable, since its trigger lived inside the hidden block, so nothing that
 * worked stopped working — but it means tasks come from parsing a manual and
 * nowhere else. A deliberate manual-add path can be designed if it's wanted.
 */
export default function Maintenance() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null

  return (
    <PageContainer className="pb-28">
      <div className="lg:hidden -mx-6">
        <div className="mx-auto w-full max-w-[460px]">
          <RefinedWeek homeId={homeId} />
        </div>
      </div>
      <div className="hidden lg:block">
        <DesktopTasks homeId={homeId} />
      </div>
    </PageContainer>
  )
}
