import { Outlet, Link, useLocation, useNavigate } from "react-router-dom"
import { ParseTrayPill } from "@/components/manuals/ParseTrayPill"
import { openFeedback } from "@/lib/feedback"
import { HomeIcon, ListChecksIcon, PackageIcon, SparklesIcon, Settings2Icon, PlusIcon, SearchIcon, BellIcon, MessageSquareWarningIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/modules/auth"
import { useUserLevel } from "@/hooks/useUserLevel"
import { useInterfaceLevelSync } from "@/hooks/useInterfaceLevelSync"
import { Button } from "@/components/ui/button"

// Mobile bottom tabs are FIXED at five (Home · Tasks · Items · Ask · Settings)
// at every level — per the redesign spec, the level changes in-screen content,
// not the tab bar. Settings is a trailing icon on desktop (mobileOnly here).
const nav = [
  { to: "/home",          label: "Home",        icon: HomeIcon,           tourId: "nav-home" },
  { to: "/maintenance",   label: "Tasks",       icon: ListChecksIcon,     tourId: "nav-tasks" },
  { to: "/inventory",     label: "Items",       icon: PackageIcon,        tourId: "nav-inventory" },
  { to: "/chat",          label: "Ask",         icon: SparklesIcon,       tourId: "nav-ask" },
  { to: "/settings",      label: "Settings",    icon: Settings2Icon,      tourId: "nav-settings",    mobileOnly: true },
] as const

// Desktop navigation GROWS with the user's level (spec: the desktop nav grows
// rather than gating in-screen). Maps to dt-kit `navFor`: standard adds Clean +
// Warranties; advanced adds Providers. (engaged ≈ standard, power ≈ advanced.)
const DESKTOP_LEVEL_NAV: { to: string; label: string; tourId: string; minLevel: "engaged" | "power" }[] = [
  { to: "/clean", label: "Clean", tourId: "nav-clean", minLevel: "engaged" },
  { to: "/warranties", label: "Warranties", tourId: "nav-warranties", minLevel: "engaged" },
  { to: "/providers", label: "Providers", tourId: "nav-providers", minLevel: "power" },
]
const LEVEL_RANK: Record<string, number> = { essentials: 0, engaged: 1, power: 2 }

/** The Items tab owns the list, the add flow and an item's own page — the page
 *  lives at /items/:id, so matching /inventory alone left no tab lit there. */
const inItems = (pathname: string) =>
  pathname === "/inventory" || pathname.startsWith("/inventory/") || pathname.startsWith("/items/")

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { level } = useUserLevel()

  // Hydrate the interface-level cache from the user's saved preference (Phase 5).
  useInterfaceLevelSync(user?.id)

  // Mobile tabs are fixed; desktop grows with level.
  const visibleNav = nav
  const desktopExtraNav = DESKTOP_LEVEL_NAV.filter(
    (n) => LEVEL_RANK[level] >= LEVEL_RANK[n.minLevel]
  )

  const handleSignOut = async () => {
    await signOut()
    navigate("/", { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--hh-bg)" }}>
      {/* Desktop top nav (redesign shell) */}
      <header className="hidden border-b border-[var(--hh-line)] md:block" style={{ background: "var(--hh-surface)" }}>
        {/* Larger Text: like the phone's tab bar, the header's own labels stop at
            1.5x, and the bar wraps onto a second row rather than run off an
            iPad's edge. */}
        <nav className="mx-auto flex min-h-[60px] max-w-6xl items-center gap-6 px-6 larger-text:flex-wrap larger-text:gap-y-2 larger-text:py-2">
          {/* Brand mark */}
          <Link to="/home" className="hit-44 flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-[10px]" style={{ background: "var(--hh-teal-fill)" }}>
              <HomeIcon className="size-[18px] text-white" strokeWidth={2.4} />
            </span>
            <span className="text-[length:min(1.125rem,27px)] font-extrabold tracking-[-0.5px]" style={{ color: "var(--hh-ink)" }}>Homehub</span>
          </Link>
          {/* Nav */}
          <div className="flex items-center gap-1 larger-text:flex-wrap">
            {visibleNav.filter((n) => !("mobileOnly" in n && n.mobileOnly)).map(({ to, label, tourId }) => {
              const isActive =
                to === "/inventory"
                  ? inItems(location.pathname)
                  : location.pathname === to || (to === "/maintenance" && location.pathname.startsWith("/tasks"))
              return (
                <Link
                  key={to}
                  to={to}
                  data-tour={tourId}
                  className={cn(
                    "hit-44 rounded-lg px-3 py-1.5 text-[length:min(0.875rem,21px)] font-semibold transition-colors",
                    isActive ? "bg-[var(--hh-teal-wash)] text-[var(--hh-teal)]" : "text-[var(--hh-sub)] hover:text-[var(--hh-ink)]"
                  )}
                >
                  {label}
                </Link>
              )
            })}
            {/* From lg: only. These grow with the user's level, so a power user
                on an iPad had a header that needed ~1102px in an 820px viewport
                and ran off the right edge — Settings and the avatar simply gone.
                Everything here stays reachable: Clean, Warranties and Providers
                are all linked from Home. */}
            {desktopExtraNav.map(({ to, label, tourId }) => {
              const isActive = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  data-tour={tourId}
                  className={cn(
                    "hit-44 hidden rounded-lg px-3 py-1.5 text-[length:min(0.875rem,21px)] font-semibold transition-colors lg:block",
                    isActive ? "bg-[var(--hh-teal-wash)] text-[var(--hh-teal)]" : "text-[var(--hh-sub)] hover:text-[var(--hh-ink)]"
                  )}
                >
                  {label}
                </Link>
              )
            })}
          </div>
          {/* On touch the cluster spaces out to gap-2 (and the avatar takes
              2px more): 36px icons 6px apart are on a 42px pitch, too tight for
              each to take a 44pt tap (hit-44) without the taps overlapping.
              A mouse keeps the compact spacing. */}
          <div className="ml-auto flex items-center gap-1.5 pointer-coarse:gap-2 larger-text:flex-wrap">
            {/* Search — items list carries the search UI */}
            <Link
              to="/inventory"
              className="hit-44 hidden size-9 items-center justify-center rounded-full text-[var(--hh-sub)] transition-colors hover:bg-[var(--hh-teal-wash)] hover:text-[var(--hh-teal)] lg:flex"
              aria-label="Search"
              title="Search"
            >
              <SearchIcon className="size-[18px]" />
            </Link>
            <Button asChild size="sm" className="gap-1.5 rounded-full" style={{ background: "var(--hh-teal-fill)" }}>
              <Link to="/inventory/add"><PlusIcon className="size-4" /> Add item</Link>
            </Button>
            {/* Feedback — one tap from any screen, not buried in Settings.
                A confused user is confused HERE, on whatever page confused
                them; making them first find Settings is how you never hear
                from them. The mail body carries the current path, so a report
                names the screen without the user having to describe it. */}
            <button
              type="button"
              onClick={() => void openFeedback("problem")}
              className="hit-44 flex size-9 items-center justify-center rounded-full text-[var(--hh-sub)] transition-colors hover:bg-[var(--hh-teal-wash)] hover:text-[var(--hh-teal)]"
              aria-label="Send feedback"
              title="Send feedback"
            >
              <MessageSquareWarningIcon className="size-[18px]" />
            </button>
            {/* Notifications — prefs live in Settings */}
            <Link
              to="/settings"
              className="hit-44 hidden size-9 items-center justify-center rounded-full text-[var(--hh-sub)] transition-colors hover:bg-[var(--hh-teal-wash)] hover:text-[var(--hh-teal)] lg:flex"
              aria-label="Notifications"
              title="Notifications"
            >
              <BellIcon className="size-[18px]" />
            </Link>
            <Link
              to="/settings"
              data-tour="nav-settings"
              className={cn(
                "hit-44 flex size-9 items-center justify-center rounded-full transition-colors",
                location.pathname === "/settings" ? "text-[var(--hh-teal)] bg-[var(--hh-teal-wash)]" : "text-[var(--hh-sub)] hover:bg-[var(--hh-teal-wash)] hover:text-[var(--hh-teal)]"
              )}
              aria-label="Settings"
              title="Settings"
            >
              <Settings2Icon className="size-[18px]" />
            </Link>
            {/* Account avatar — signed-in user's initial */}
            <Link
              to="/settings"
              className="hit-44 flex size-8 items-center justify-center rounded-full text-[length:min(0.8125rem,19.5px)] font-bold text-white transition-opacity hover:opacity-90 pointer-coarse:ml-0.5"
              style={{ background: "var(--hh-teal-fill)" }}
              aria-label="Account"
              title="Account"
            >
              {(user?.email?.[0] ?? "?").toUpperCase()}
            </Link>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </nav>
      </header>

      {/* pt inset clears the iOS status bar / Dynamic Island on mobile (no top
          bar there). `pt-safe-top` (index.css) uses env() with a standalone-only
          fallback for the iOS PWA quirk where env resolves to 0, and resets to 0
          at md+ where the desktop header takes over.

          pb must include the SAME safe-area inset the nav below adds to its own
          height. A flat pb-16 reserved 64px for a bar that is 64px PLUS the home
          indicator, so on every notched iPhone the last element of every page sat
          under it — reported as "Back and Add item are still partially cut off".
          It never reproduced in a browser, where env() resolves to 0. */}
      <main className="flex-1 pb-[calc(var(--hh-tabbar-h)+4px+env(safe-area-inset-bottom))] md:pb-0 pt-safe-top">
        <Outlet />
      </main>

      {/* HH-87: the in-progress window — parses in flight and reviews waiting,
          so the review sheet stops appearing out of nowhere. Renders null when
          nothing is happening, which is almost always. */}
      <ParseTrayPill />

      {/* Mobile bottom nav — translucent, iOS-native (redesign shell).
          Its height is --hh-tabbar-h (index.css) plus the home-indicator inset;
          bars that sit ON it (Mark done, the Deep Clean footer) read the same
          variable, so the min-height here is what keeps them honest. */}
      <nav className="fixed bottom-0 inset-x-0 z-50 min-h-[var(--hh-tabbar-clear)] border-t border-[var(--hh-line)] backdrop-blur-xl md:hidden pb-[env(safe-area-inset-bottom)] hh-frost-bg" style={{ background: "color-mix(in srgb, var(--hh-bg) 85%, transparent)" }}>
        <div className="flex items-start justify-around px-1.5 pt-2.5">
          {visibleNav.filter((n) => !("desktopOnly" in n && n.desktopOnly)).map(({ to, label, icon: Icon, tourId }) => {
            const isActive =
              to === "/inventory"
                ? inItems(location.pathname)
                : to === "/settings"
                  ? location.pathname === "/settings"
                  : location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                data-tour={tourId}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-1 min-w-[58px] min-h-11 transition-colors",
                  isActive ? "text-[var(--hh-teal)]" : "text-[var(--hh-sub)]"
                )}
              >
                <Icon className="size-6" strokeWidth={isActive ? 2.4 : 2} />
                <span className={cn("text-[length:var(--hh-tabbar-label)] leading-tight", isActive ? "font-semibold" : "font-medium")}>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
