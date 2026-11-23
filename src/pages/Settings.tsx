/**
 * Settings (design/settings-your-home.md): the menu at `/settings`, and one
 * page per row at `/settings/:pane`.
 *
 * This file only decides which of them an address means. The menu is
 * SettingsMenu; each pane is a component of its own under
 * components/settings/, with its own state, reads and failure handling. It
 * was one 2,160-line component that rendered twenty sections down one page.
 *
 * Old addresses still land: `/settings#notifications` and the other anchors
 * of the one-page Settings are redirected (replace) to where each section
 * lives now, and an unknown pane goes back to the menu.
 */
import type { ReactNode } from "react"
import { Navigate, useLocation, useParams } from "react-router-dom"
import { SubPage } from "@/components/layout/SubPage"
import { SettingsMenu } from "@/components/settings/SettingsMenu"
import { HomeMembersSection } from "@/components/settings/HomeMembersSection"
import { TaskLevelSection } from "@/components/settings/TaskLevelSection"
import { AccountPane } from "@/components/settings/panes/AccountPane"
import { AppearancePane } from "@/components/settings/panes/AppearancePane"
import { ExportPane } from "@/components/settings/panes/ExportPane"
import { HelpPane } from "@/components/settings/panes/HelpPane"
import { HomesPane } from "@/components/settings/panes/HomesPane"
import { InternalPane } from "@/components/settings/panes/InternalPane"
import { NotificationsPane } from "@/components/settings/panes/NotificationsPane"
import { PrivacyPane } from "@/components/settings/panes/PrivacyPane"
import { useDevTools } from "@/hooks/useDevTools"
import { useAuth } from "@/modules/auth"
import { useCurrentHome } from "@/modules/home"
import { SETTINGS_PANE_TITLE, SETTINGS_PATH, isSettingsPane, settingsHashRedirect, type SettingsPane } from "@/lib/settingsPaths"

export default function Settings() {
  const { pane } = useParams<{ pane?: string }>()
  const { hash } = useLocation()
  if (pane === undefined) {
    const moved = settingsHashRedirect(hash)
    return moved ? <Navigate to={moved} replace /> : <SettingsMenu />
  }
  if (!isSettingsPane(pane)) return <Navigate to={SETTINGS_PATH} replace />
  return pane === "internal" ? <InternalPage /> : <PanePage pane={pane} />
}

function PaneFrame({ pane, children }: { pane: SettingsPane; children: ReactNode }) {
  return (
    <SubPage backTo={SETTINGS_PATH} backLabel="Settings" title={SETTINGS_PANE_TITLE[pane]} testId={`settings-pane-${pane}`}>
      {children}
    </SubPage>
  )
}

function PanePage({ pane }: { pane: Exclude<SettingsPane, "internal"> }) {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  return (
    <PaneFrame pane={pane}>
      {pane === "account" && <AccountPane />}
      {pane === "members" && homeId && <HomeMembersSection homeId={homeId} />}
      {pane === "task-level" && homeId && <TaskLevelSection homeId={homeId} />}
      {pane === "homes" && <HomesPane />}
      {pane === "notifications" && <NotificationsPane />}
      {pane === "appearance" && <AppearancePane />}
      {pane === "export" && <ExportPane />}
      {pane === "privacy" && <PrivacyPane />}
      {pane === "help" && <HelpPane />}
    </PaneFrame>
  )
}

/**
 * Internal tools are only for a person whose prefs doc says `dev_tools: true`.
 * Nothing is drawn until that is read; anyone else is sent back to the menu,
 * which has no row for this page.
 */
function InternalPage() {
  const { user } = useAuth()
  const devTools = useDevTools(user?.id)
  if (devTools === "loading") return null
  if (devTools === "off") return <Navigate to={SETTINGS_PATH} replace />
  return (
    <PaneFrame pane="internal">
      <InternalPane />
    </PaneFrame>
  )
}
