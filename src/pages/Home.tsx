import { useState, useCallback, useMemo, useEffect } from "react"
import { markBoot } from "@/lib/bootTiming"
import { Link } from "react-router-dom"
import {
  PlusIcon,
  PackageIcon,
  FileTextIcon,
  BellRingIcon,
  MessageCircleIcon,
  CloudOffIcon,
  HomeIcon,
  ChevronDownIcon,
} from "lucide-react"
import { markTaskInstanceDone, snoozeTaskInstance, unsnoozeTaskInstance } from "@/modules/care"
import type { DashboardTask } from "@/lib/dashboard"
import { useDashboard } from "@/lib/useDashboard"
import { shouldShowHomeSkeleton, SKELETON_PATIENCE_MS } from "@/lib/homeLoadingGate"
import { UndoBar } from "@/components/ui/UndoBar"
import { useFeatureTour } from "@/hooks/useFeatureTour"
import { useAuth } from "@/modules/auth"
import { auth } from "@/integrations/firebase"
import { useCurrentHome, useHomeProfile } from "@/modules/home"
import { useUserLevel } from "@/hooks/useUserLevel"
import { AskFirstHero } from "@/components/dashboard/AskFirstHero"
import { RefinedHome } from "@/components/home/RefinedHome"
import { HomeSwitcherSheet } from "@/components/home/HomeSwitcherSheet"
import { DesktopHome } from "@/components/home/DesktopHome"
import { ProfileCompletionBanner } from "@/components/dashboard/ProfileCompletionBanner"
import { PushOptInNudge } from "@/components/dashboard/PushOptInNudge"
import { HomeSkeleton } from "@/components/home/HomeSkeleton"

import { WhatsNewBanner } from "@/components/dashboard/WhatsNewBanner"
import { LevelUnlockBanner } from "@/components/dashboard/LevelUnlockBanner"

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ── Agenda ──────────────────────────────────────────────────────────────────

/**
 * HH-80 — items, but nothing to do with them yet.
 *
 * Says the one thing that is true and useful in this state: upkeep comes from
 * the manual, and this home has items without one. Deliberately NOT a fourth
 * variant of "add an item" — they have already done that, and telling someone
 * to repeat the step that did not work is how an empty screen becomes an
 * insulting one.
 */
function NoUpkeepYetHero() {
  return (
    <div className="rounded-2xl border px-5 py-5 sm:px-6"
      style={{ borderColor: "var(--hh-teal)", background: "var(--hh-teal-wash)" }}>
      <h2 className="text-[17px] font-extrabold tracking-[-0.015em]" style={{ color: "var(--hh-ink)" }}>
        No upkeep yet — add a manual
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-snug" style={{ color: "var(--hh-sub)" }}>
        Homehub builds a maintenance schedule by reading an item&rsquo;s manual. Your items don&rsquo;t have one
        we could read yet, so there&rsquo;s nothing to show here.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold text-white"
          style={{ background: "var(--hh-teal)" }}
        >
          Pick an item &rarr;
        </Link>
        <Link
          to="/inventory/add"
          className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] font-semibold"
          style={{ borderColor: "var(--hh-line2)", color: "var(--hh-sub)" }}
        >
          Add another item
        </Link>
      </div>
    </div>
  )
}

function EmptyHomeHero() {
  return (
    // data-tour-halt: this screen IS the onboarding — the feature tour defers
    // to it rather than narrating a dashboard the user cannot see yet.
    <div data-tour-halt="" className="rounded-2xl border border-white/70 bg-white/70 backdrop-blur-sm shadow-sm px-6 py-8 sm:px-10 sm:py-10 text-center">
      <div className="max-w-md mx-auto">
        <div className="flex justify-center mb-4">
          <span className="inline-flex items-center justify-center size-14 rounded-2xl bg-primary/10 text-primary">
            <PackageIcon className="size-7" />
          </span>
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2 leading-tight">
          Let&apos;s set up your home
        </h2>
        <p className="text-[15px] sm:text-base text-muted-foreground mb-6 leading-relaxed">
          {/* HH-77: "fixture" was the least motivating thing we could name to
              someone who has added nothing, and the old line described what we
              PARSE rather than what they get back. Owner picked this wording. */}
          Add one appliance and its manual.
          Homehub reads the manual and builds the upkeep schedule for you.
        </p>
        <Link
          to="/inventory/add"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors shadow-sm"
        >
          <PlusIcon className="size-5" />
          Add your first item
        </Link>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          <div className="flex items-start gap-2.5">
            <FileTextIcon className="size-5 shrink-0 text-primary mt-0.5" />
            <div>
              {/* The app SCANS a manual — never "parse" (lib/scanCopy.ts). */}
              <div className="text-sm font-semibold text-foreground">Scan manuals</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Upload a PDF and we extract the key info.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <BellRingIcon className="size-5 shrink-0 text-primary mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-foreground">Get reminders</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Never miss a filter change or service.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MessageCircleIcon className="size-5 shrink-0 text-primary mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-foreground">Ask anything</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                "How do I reset the HVAC?" — we'll find it.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth()
  const { home, homes, setCurrentHome, refresh: refreshHomes } = useCurrentHome()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const { level, derivedLevel } = useUserLevel()
  const homeId = home?.home_id ?? ""

  const {
    tasks: dashTasks,
    stats,
    upcoming,
    expiringWarranties,
    notices,
    cleaningGuides,
    isLoading,
    error: dashError,
    refresh,
  } = useDashboard(homeId || null)
  const { profile: homeProfile, error: profileError } = useHomeProfile(homeId || null)
  const askFirst = homeProfile?.preferred_mode === "ask_first"
  const profileIncomplete =
    !profileError && (homeProfile === null || homeProfile?.completed_at === null)
  useFeatureTour()
  const [completingId, setCompletingId] = useState<string | null>(null)
  // Flips true if the first paint is still a skeleton after SKELETON_PATIENCE_MS.
  const [skeletonSlow, setSkeletonSlow] = useState(false)
  // A receipt for the last action, so a row that vanishes is explained.
  const [undo, setUndo] = useState<{ message: string; onUndo?: () => void } | null>(null)
  /** Instances the user has just completed, hidden until the refetch catches up.
   *  Without this the card stayed on screen after a successful write, looking
   *  untouched, and people tapped Mark done a second time. */
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())

  // The boot is "done" when Home shows real content rather than a skeleton —
  // that is the moment the user stops waiting, which is what we are measuring.
  //
  // Gated on the SAME predicate Home renders with, deliberately. The previous
  // `!isLoading && stats` repeated the trap PR #16 fixed in the skeleton: SWR
  // keeps `isLoading` true while it serves a persisted snapshot and revalidates,
  // so on a warm start Home painted real content at ~600ms and this mark never
  // fired — making the FASTEST boots report "never finished loading" in the
  // owner's diagnostics. One predicate, so the two can't drift again.
  useEffect(() => {
    if (stats && !shouldShowHomeSkeleton(isLoading, !!stats)) markBoot("content")
  }, [isLoading, stats])

  // Only runs while the skeleton is actually what the user is looking at.
  useEffect(() => {
    if (!shouldShowHomeSkeleton(isLoading, !!stats)) { setSkeletonSlow(false); return }
    const t = window.setTimeout(() => setSkeletonSlow(true), SKELETON_PATIENCE_MS)
    return () => window.clearTimeout(t)
  }, [isLoading, stats])

  const handleMarkComplete = useCallback(
    async (taskId: string) => {
      if (!homeId) return
      setCompletingId(taskId)
      const result = await markTaskInstanceDone(homeId, taskId)
      if (!result.success) {
        // Leave it on screen — a task that failed to complete must not vanish.
        setCompletingId(null)
        return
      }
      // Hide it immediately, then wait for the refetch before releasing the
      // optimistic hide. Clearing `completingId` before `refresh()` resolved was
      // the bug: the row un-dimmed while still listed, so it read as "nothing
      // happened, tap again".
      setJustCompleted((s) => new Set(s).add(taskId))
      setUndo({ message: "Marked done" })
      setCompletingId(null)
      await refresh()
      setJustCompleted((s) => {
        const next = new Set(s)
        next.delete(taskId)
        return next
      })
    },
    [homeId, refresh]
  )

  // Snooze pushes a recurring upkeep task's due date out 2 weeks (spec #7).
  const handleSnooze = useCallback(
    async (taskId: string) => {
      if (!homeId) return
      const snoozedUntil = addDays(formatLocalDateStr(new Date()), 14)
      const result = await snoozeTaskInstance(homeId, taskId, snoozedUntil)
      if (!result.success) return
      refresh()
      // Say what happened and offer the way back. Without this the row simply
      // disappeared, which a tester read as having deleted the task.
      const when = new Date(snoozedUntil + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
      setUndo({
        message: `Snoozed until ${when}`,
        onUndo: () => {
          void unsnoozeTaskInstance(homeId, taskId).then((r) => { if (r.success) refresh() })
        },
      })
    },
    [homeId, refresh]
  )

  // Derived data — must be computed before any early returns to keep hooks stable
  const notJustDone = useCallback(
    (t: { id: string }) => !justCompleted.has(t.id),
    [justCompleted],
  )

  // Redesigned mobile Home (RefinedHome) feed: overdue + due-soon, deduped.
  const homeTasks = useMemo(() => {
    const seen = new Set<string>()
    const out: DashboardTask[] = []
    for (const t of [...(dashTasks?.overdue ?? []), ...(dashTasks?.dueSoon ?? [])]) {
      if (!seen.has(t.id) && notJustDone(t)) { seen.add(t.id); out.push(t) }
    }
    return out
  }, [dashTasks, notJustDone])

  // Skeleton ONLY when there is genuinely nothing to paint — see
  // shouldShowHomeSkeleton for why `isLoading` alone was the wrong gate.
  // Past SKELETON_PATIENCE_MS it stops shimmering silently and says so.
  if (shouldShowHomeSkeleton(isLoading, !!stats)) return <HomeSkeleton patienceExpired={skeletonSlow} />

  // Surface dashboard load failures explicitly. Without this, a failed fetch
  // falls through to `stats?.totalItems ?? 0 === 0` and renders the new-user
  // empty-state hero, which hides real RLS/auth regressions from users and
  // support. Profile errors are non-fatal (drive personalization, not core
  // data) so we log but don't block the page.
  // ONLY when there is nothing to paint. The warm snapshot in localStorage is
  // the whole point of swrPersist: with a cached Home in hand, a failed or
  // timed-out fetch should show yesterday's Home plus a banner, not a red wall.
  // Returning early on `dashError` alone meant a dropped connection blanked a
  // page the device could already render — which is what the owner hit on 5G.
  if (dashError && !stats) {
    return (
      <div className="px-4 lg:px-8 py-8 max-w-xl mx-auto">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="text-base font-semibold text-destructive mb-1">
            Couldn't load your home
          </h2>
          <p className="text-sm text-muted-foreground">
            {dashError instanceof Error ? dashError.message : "Unknown error loading dashboard."}
          </p>
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-4 inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent min-h-11"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (profileError) {
    console.error("[Home] home_profile fetch failed:", profileError.message)
  }

  const isNewUser = (stats?.totalItems ?? 0) === 0
  // HH-80: the state between "no items" and "a working home". The owner added
  // an item, its manual search offered her two wrong documents (HH-73), so it
  // produced no upkeep — and Home answered with "All quiet · Nothing scheduled
  // yet" over a profile nag. Nothing on the screen was false and nothing was
  // any use. This is the one state where we know exactly what would help.
  const hasItemsNoUpkeep = !isNewUser && (stats?.scheduledTaskCount ?? 0) === 0
  // HH-95: "the past 30 days" of a brand-new account is an empty story. Ready
  // once the account is ~3 weeks old or something has actually been completed.
  const briefingReady = (() => {
    const created = auth.currentUser?.metadata?.creationTime
    const ageDays = created ? (Date.now() - new Date(created).getTime()) / 86400000 : 999
    return ageDays >= 21 || (stats?.completedThisMonth ?? 0) > 0
  })()

  return (
    <div className="flex flex-col pb-8">
      {undo && (
        <UndoBar message={undo.message} onUndo={undo.onUndo} onDismiss={() => setUndo(null)} />
      )}
      {/* Cached view + a failed refresh: say so quietly and stay usable. The
          user can still read everything and complete work; only freshness is
          in question, so this is a note, not an error state. */}
      {dashError && (
        <div className="mx-4 mt-3 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 lg:mx-8"
             style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}>
          <CloudOffIcon className="size-4 shrink-0" style={{ color: "var(--hh-sub)" }} />
          <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
            Showing your last saved view — couldn&apos;t reach the server.
          </span>
          <button type="button" onClick={() => refresh()} className="shrink-0 text-[12.5px] font-bold" style={{ color: "var(--hh-teal)" }}>
            Retry
          </button>
        </div>
      )}

      <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full">
        {/* What's new banner */}
        {user?.id && <WhatsNewBanner userId={user.id} />}

        {/* Progressive-complexity: celebrate when the user grows into a new level */}
        <LevelUnlockBanner derivedLevel={derivedLevel} />

        {/* ── New-user empty state ── */}
        {isNewUser && (
          <div className="mt-2 mb-4">
            {/* The switcher lives in the greeting header, which this branch
                replaces — so this pill is the empty state's only door between
                homes. It must show for a SINGLE home too: gating on
                homes.length > 1 meant a one-home user had no way to add a
                second home anywhere in the app until their first home had
                tasks — the audit walked Sonia's exact setup path (fresh
                account, own home, then the parents' house) straight into it. */}
            {home && (
              <button
                type="button"
                onClick={() => setSwitcherOpen(true)}
                className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px]"
                style={{
                  borderColor: "var(--hh-line)",
                  background: "var(--hh-surface)",
                  color: "var(--hh-sub)",
                }}
              >
                <HomeIcon className="size-3.5 shrink-0" style={{ color: "var(--hh-teal)" }} aria-hidden />
                <span className="truncate font-semibold">{home.name}</span>
                <ChevronDownIcon className="size-3.5 shrink-0" aria-hidden />
              </button>
            )}
            <EmptyHomeHero />
          </div>
        )}

        {/* The profile banner yields to the upkeep prompt. Both are asking for
            the user's next action, and answering four profile questions does
            not get them a single task — adding a manual does. */}
        {!isNewUser && !hasItemsNoUpkeep && profileIncomplete && homeId && (
          <ProfileCompletionBanner homeId={homeId} />
        )}

        {hasItemsNoUpkeep && <NoUpkeepYetHero />}

        {/* Push opt-in nudge: self-gates on browser support + existing
            subscription + dismissal, so it's safe to always render when the
            user has a home. Only one opt-in banner shows at a time — if the
            profile banner is still visible, skip the push nudge to avoid
            stacking. */}
        {!isNewUser && !hasItemsNoUpkeep && !profileIncomplete && user?.id && homeId && (
          <PushOptInNudge userId={user.id} homeId={homeId} />
        )}

        {!isNewUser && askFirst && <AskFirstHero />}

        {!isNewUser && (
          <>
        {/* ── Redesigned Home — RefinedHome (mobile) · DesktopHome (lg+) ── */}
        <div className="lg:hidden -mx-4">
          <div className="mx-auto w-full max-w-[460px]">
            <RefinedHome
              homeName={home?.name ?? null}
              onSelectHome={() => setSwitcherOpen(true)}
              tasks={homeTasks}
              upcoming={upcoming}
            nextUp={stats?.nextUp ?? null}
            briefingReady={briefingReady}
              warranties={expiringWarranties}
              cleaningGuides={cleaningGuides}
              level={level}
              homeId={homeId || null}
              completingId={completingId}
              onComplete={handleMarkComplete}
              onSnooze={handleSnooze}
            />
          </div>
        </div>
        {/* Break out of the page's max-w-5xl wrapper: DesktopHome owns its own
            centered 1180px content region (redesign spec). */}
        <div className="hidden lg:block">
          <DesktopHome
            tasks={homeTasks}
            warranties={expiringWarranties}
            notices={notices}
            upcoming={upcoming}
            nextUp={stats?.nextUp ?? null}
            briefingReady={briefingReady}
            cleaningGuides={cleaningGuides}
            level={level}
            homeId={homeId || null}
            completingId={completingId}
            onComplete={handleMarkComplete}
            onSnooze={handleSnooze}
          />
        </div>
          </>
        )}
      </div>

      {user && (
        <HomeSwitcherSheet
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
          homes={homes}
          currentHomeId={home?.home_id ?? null}
          userId={user.id}
          onSelect={setCurrentHome}
          // refresh(newId) rather than setCurrentHome: the home was just
          // created, so it isn't in `homes` yet — this is the one path that
          // fetches server truth and selects in a single step.
          onCreated={(newHomeId) => refreshHomes(newHomeId)}
        />
      )}
    </div>
  )
}

// ── Utility ─────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
