/**
 * Settings: one short menu (design/settings-your-home.md, owner-approved mock
 * 2026-11-21). It was twenty sections on one page; now each row opens a page
 * of its own, and what was never a setting moved to where it is used (rooms to
 * Items, custom tasks to Tasks, the home's facts to Your home).
 *
 * A row's grey value or second line is only ever something that was READ: a
 * count or a level still loading, or that failed to load, is left off the row
 * (and the failure logged). "Just you" over a members read that failed would
 * be a confident wrong answer.
 */
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  BellIcon, DownloadIcon, HomeIcon, ListIcon, LockIcon, MessageCircleIcon, PhoneIcon, SunIcon, UsersIcon, WrenchIcon,
} from "lucide-react"
import { InlineError, PageContainer } from "@/components/layout"
import { ListCard, ListRow, ListSection } from "@/components/layout/RowList"
import { useAuth } from "@/modules/auth"
import { useCurrentHome, useHomeProfile, getHomeMembers } from "@/modules/home"
import { useDisplayName } from "@/hooks/useDisplayName"
import { useDevTools } from "@/hooks/useDevTools"
import { useServiceProviders } from "@/hooks/useServiceProviders"
import { APPEARANCE_LABEL, useAppearance } from "@/lib/theme"
import { isPushSupported, isSubscribed as checkIsSubscribed } from "@/lib/pushNotifications"
import { isNativePlatform, isNativePushRegistered } from "@/lib/nativePush"
import { PROVIDERS_PATH, SETTINGS_PANE_TITLE, settingsPane } from "@/lib/settingsPaths"
import { YOUR_HOME_PATH } from "@/lib/yourHome"
import { TASK_LEVEL_COPY, taskLevelOf } from "../../../shared/tasks/taskLevel"

/** How many people belong to the home; null until read, and when the read fails. */
function useMemberCount(homeId: string): number | null {
  const [read, setRead] = useState<{ homeId: string; count: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    void getHomeMembers(homeId).then((res) => {
      if (cancelled) return
      if (res.error) {
        console.warn(`[settings] could not count the members of home ${homeId}:`, res.error.message)
        return
      }
      setRead({ homeId, count: res.data.length })
    })
    return () => {
      cancelled = true
    }
  }, [homeId])
  return read && read.homeId === homeId ? read.count : null
}

/** Whether this device gets pushes; null until read, and when the read fails. */
function usePushOn(supported: boolean, native: boolean): boolean | null {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    ;(native ? isNativePushRegistered() : checkIsSubscribed()).then(
      (v) => {
        if (!cancelled) setOn(v)
      },
      (e: unknown) => {
        console.warn("[settings] could not read whether notifications are on:", e instanceof Error ? e.message : e)
      },
    )
    return () => {
      cancelled = true
    }
  }, [supported, native])
  return on
}

/** The rows about the home on screen. Its reads are keyed by the home, so a switch never shows the last home's counts. */
function ThisHome({ homeId, homeName }: { homeId: string; homeName: string }) {
  const { providers, loading: providersLoading, loadFailed: providersFailed } = useServiceProviders(homeId)
  const members = useMemberCount(homeId)
  const { profile, isLoading: levelLoading, error: levelError } = useHomeProfile(homeId)
  const levelFailure = levelError?.message
  useEffect(() => {
    if (levelFailure) console.warn(`[settings] could not read the task level of home ${homeId}:`, levelFailure)
  }, [homeId, levelFailure])

  const providersRead = !providersLoading && !providersFailed
  const providersSub = providersRead && providers.length > 0 ? `${providers.length} saved` : "Your trusted pros"
  const membersSub = members === null || members < 1 ? null : members === 1 ? "Just you" : `${members} people`
  const level = !levelLoading && !levelError ? TASK_LEVEL_COPY[taskLevelOf(profile?.task_level)].label : null

  return (
    <ListSection label="This home" testId="settings-this-home">
      <ListCard>
        <ListRow first icon={HomeIcon} title="Your home" sub="Zip, home type, shutoffs and notes" to={YOUR_HOME_PATH} testId="settings-row-your-home" />
        <ListRow first={false} icon={PhoneIcon} title="Service providers" sub={providersSub} to={PROVIDERS_PATH} testId="settings-row-providers" />
        <ListRow first={false} icon={UsersIcon} title={SETTINGS_PANE_TITLE.members} sub={membersSub} to={settingsPane("members")} testId="settings-row-members" />
        <ListRow first={false} icon={ListIcon} title={SETTINGS_PANE_TITLE["task-level"]} value={level} to={settingsPane("task-level")} testId="settings-row-task-level" />
        <ListRow first={false} icon={HomeIcon} title={SETTINGS_PANE_TITLE.homes} value={homeName} to={settingsPane("homes")} testId="settings-row-homes" />
      </ListCard>
    </ListSection>
  )
}

export function SettingsMenu() {
  const { user, signOut } = useAuth()
  const userId = user?.id
  const { home } = useCurrentHome()
  const navigate = useNavigate()
  const { fullName } = useDisplayName()
  const devTools = useDevTools(userId)
  const { appearance } = useAppearance()
  // On the native shell (iOS) pushes come by APNs; `isPushSupported()` is false
  // there (no serviceWorker/PushManager), so OR in the native check.
  const isNative = isNativePlatform()
  const [pushSupported] = useState(() => isNative || isPushSupported())
  const pushOn = usePushOn(pushSupported, isNative)

  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    setSignOutError(null)
    try {
      await signOut()
      navigate("/", { replace: true })
    } catch (e) {
      // Still signed in: say so, rather than leave the button looking pressed.
      console.warn(`[settings] could not sign out ${userId ?? "(no user)"}:`, e instanceof Error ? e.message : e)
      setSignOutError("Couldn't sign out. Check your connection and try again.")
    } finally {
      setIsSigningOut(false)
    }
  }, [isSigningOut, signOut, navigate, userId])

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-[640px] pb-10" data-testid="settings-menu">
        <h1 className="text-[1.75rem] font-extrabold leading-[1.2] tracking-[-0.7px]" style={{ color: "var(--hh-ink)" }}>Settings</h1>

        <div className="mt-5 flex flex-col gap-7">
          <ListCard testId="settings-account">
            <ListRow first icon={UsersIcon} title={fullName?.trim() || "Your account"} sub={user?.email ?? null} to={settingsPane("account")} testId="settings-row-account" />
          </ListCard>

          {home && <ThisHome homeId={home.home_id} homeName={home.name} />}

          <ListSection label="App" testId="settings-app">
            <ListCard>
              {pushSupported && (
                <ListRow first icon={BellIcon} title={SETTINGS_PANE_TITLE.notifications} value={pushOn === null ? null : pushOn ? "On" : "Off"} to={settingsPane("notifications")} testId="settings-row-notifications" />
              )}
              <ListRow first={!pushSupported} icon={SunIcon} title={SETTINGS_PANE_TITLE.appearance} value={APPEARANCE_LABEL[appearance]} to={settingsPane("appearance")} testId="settings-row-appearance" />
            </ListCard>
          </ListSection>

          <ListSection label="Your data" testId="settings-data">
            <ListCard>
              <ListRow first icon={DownloadIcon} title={SETTINGS_PANE_TITLE.export} to={settingsPane("export")} testId="settings-row-export" />
              <ListRow first={false} icon={LockIcon} title={SETTINGS_PANE_TITLE.privacy} to={settingsPane("privacy")} testId="settings-row-privacy" />
              <ListRow first={false} icon={MessageCircleIcon} title={SETTINGS_PANE_TITLE.help} to={settingsPane("help")} testId="settings-row-help" />
            </ListCard>
          </ListSection>

          {/* Only for a person whose prefs doc says dev_tools: true. */}
          {devTools === "on" && (
            <ListSection label="Internal" testId="settings-internal">
              <ListCard>
                <ListRow first icon={WrenchIcon} tone="grey" title={SETTINGS_PANE_TITLE.internal} to={settingsPane("internal")} testId="settings-row-internal" />
              </ListCard>
            </ListSection>
          )}

          <div>
            <ListCard>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="flex min-h-[60px] w-full items-center justify-center px-3.5 py-3 text-[1.0625rem] font-semibold leading-[1.3]"
                style={{ color: "var(--hh-clay)", opacity: isSigningOut ? 0.6 : 1 }}
              >
                {isSigningOut ? "Signing out…" : "Sign out"}
              </button>
            </ListCard>
            {signOutError && <InlineError className="mt-2 pl-0.5">{signOutError}</InlineError>}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
