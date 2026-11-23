/**
 * Settings → Notifications: whether this device gets pushes, what it is told
 * about, and when. The whole block moved here from the one-page Settings
 * unchanged in behaviour (design/settings-your-home.md): a preference is saved
 * before it is believed, a failed save puts the switch back and says so, and
 * the defaults are never shown standing in for a read that failed.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { BellIcon, CheckIcon, MegaphoneIcon, ShieldCheckIcon, ShoppingBagIcon } from "lucide-react"
import { doc, getDoc } from "firebase/firestore"
import { db, callable } from "@/integrations/firebase"
import { InlineError, SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/modules/auth"
import { useCurrentHome } from "@/modules/home"
import { isPushSupported, subscribeToPush, unsubscribeFromPush, isSubscribed as checkIsSubscribed } from "@/lib/pushNotifications"
import { isNativePlatform, isNativePushRegistered, PushOffError, registerNativePush, unregisterNativePush } from "@/lib/nativePush"
import { NotificationsRefusedNote } from "@/components/settings/NotificationsRefusedNote"
import { WHAT_NOTIFICATIONS_SEND_ON, WHAT_NOTIFICATIONS_SEND_SENTENCE } from "@/lib/notifyGate"
import { getNotificationPrefs, setNotificationPrefs } from "@/lib/userPreferences"
import {
  DEFAULT_NOTIFICATION_PREFS,
  MAX_LEAD_TIME_DAYS,
  normalizeNotificationPrefs,
  type NotificationEventKey,
  type NotificationPrefs,
  type PushMode,
} from "@/lib/notificationPreferences"
import { withChunkRetry } from "@/lib/chunkRetry"

const sendTestPushCallable = callable<void, { ok: boolean; sent?: number }>("sendTestPush")

/** Which block of notification controls a failed save belongs to — its error is said there. */
type NotifSection = "events" | "mode" | "digest" | "timing"

// Per-event notification rows for the preferences matrix. Push-only by design
// (see notificationPreferences.ts).
//
// `unavailable`: no push lane sends this event yet (firebase/functions/src/push/
// lanes.ts sends task reminders and buy-ahead only, and nothing schedules the
// recall check), so the row says so instead of offering a switch that does
// nothing. The stored preference is left untouched, so the person's choice is
// still there when the alert ships. (Audit 2026-10-28, Package 0.)
const NOTIF_EVENT_ROWS: {
  key: NotificationEventKey
  icon: typeof BellIcon
  label: string
  sub: string
  unavailable?: boolean
}[] = [
  { key: "task_reminders", icon: BellIcon, label: "Task reminders", sub: "When upkeep is due" },
  {
    key: "warranty_expiring",
    icon: ShieldCheckIcon,
    label: "Warranty expiring",
    sub: "30 days before coverage ends",
    unavailable: true,
  },
  {
    key: "safety_recalls",
    icon: MegaphoneIcon,
    label: "Safety & recalls",
    sub: "Homehub doesn't check for recalls yet",
    unavailable: true,
  },
  {
    key: "buy_ahead",
    icon: ShoppingBagIcon,
    label: "Buy-ahead reminders",
    sub: "A week before a part is needed",
  },
]

// The breadth dial (round 19). Owner's decision: breadth is a user MODE, not a
// hard predicate — her mode is "Just my list"; the default keeps today's
// behavior so safety work reminds unless someone deliberately opts down.
// The mode decides only tasks whose bell was never touched: a bell switched
// off is silent in every mode, and "Just my list" is ONLY what was switched
// on — no deadlines or lapsed safety checks either (owner, 2026-10-28 —
// taskNotifies), which is what makes "Nothing else notifies" true.
const PUSH_MODE_OPTIONS: { value: PushMode; label: string; sub: string }[] = [
  { value: "curated", label: "Just my list", sub: "Only reminders you turned on. Nothing else notifies." },
  { value: "curated+essential", label: "My list + anything Essential", sub: "Your list, plus safety and damage-prevention work by default." },
  { value: "all", label: "Everything on a schedule", sub: "Every scheduled task, unless you turned it off." },
]
const DIGEST_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const DIGEST_HOURS = [6, 7, 8, 9, 10, 12, 17, 18, 19, 20]
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`

// Reminder lead-time presets (days). Clamped to MAX_LEAD_TIME_DAYS on write.
const NOTIF_LEAD_TIME_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "On the day" },
  { value: 1, label: "1 day before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "1 week before" },
]

export function NotificationsPane() {
  const { user } = useAuth()
  // The callbacks below depend on the id, not the user object.
  const userId = user?.id
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null

  // Push notification state. On the native shell (iOS) use the APNs path;
  // otherwise the Web Push (VAPID) path. `isPushSupported()` is false on native
  // (no serviceWorker/PushManager), so OR in the native check.
  const isNative = isNativePlatform()
  const [pushSupported] = useState(() => isNative || isPushSupported())
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushToggling, setPushToggling] = useState(false)
  // Read-only push diagnostics. Three rounds of this have now been spent
  // guessing which layer was broken (server lane, AppDelegate, TestFlight
  // enrolment) while the one question that separates them — is this the native
  // shell, and did it ever receive a token? — was never actually asked. One
  // cheap panel answers it permanently, and a web deploy reaches the phone with
  // no rebuild.
  const [pushDiag, setPushDiag] = useState<{
    platform: string
    native: boolean
    permission: string
    build: string
    tokens: { kind: string; len: number }[]
  } | null>(null)
  const [pushTesting, setPushTesting] = useState(false)
  const [pushTestMsg, setPushTestMsg] = useState<string | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)

  const loadPushDiag = useCallback(async () => {
    const { Capacitor } = await withChunkRetry(() => import("@capacitor/core"), "push diagnostics")
    const native = Capacitor.isNativePlatform()
    let permission = "n/a"
    if (native) {
      try {
        const { PushNotifications } = await withChunkRetry(() => import("@capacitor/push-notifications"), "push diagnostics")
        permission = (await PushNotifications.checkPermissions()).receive
      } catch (e) {
        permission = `error: ${e instanceof Error ? e.message : "unknown"}`
      }
    } else if (typeof Notification !== "undefined") {
      permission = Notification.permission
    }
    // Which binary is running — the only way to tell whether a native-side fix
    // is actually on the device, since web deploys change nothing about it.
    let build = "n/a"
    if (native) {
      try {
        const { App } = await withChunkRetry(() => import("@capacitor/app"), "push diagnostics")
        const info = await App.getInfo()
        build = `${info.version} (${info.build})`
      } catch {
        // Said in the diagnostics panel itself: the build reads "unknown".
        build = "unknown"
      }
    }

    let tokens: { kind: string; len: number }[] = []
    if (userId) {
      try {
        const snap = await getDoc(doc(db, `users/${userId}/private/fcmTokens`))
        const stored: unknown = snap.get("tokens")
        const raw = Array.isArray(stored) ? stored.filter((t): t is string => typeof t === "string") : []
        tokens = raw.map((t) => ({
          kind: /^[0-9a-f]{64}$/i.test(t) ? "APNs (iOS)" : "FCM (web)",
          len: t.length,
        }))
      } catch {
        /* diagnostics are best-effort — never block the page */
      }
    }
    setPushDiag({ platform: Capacitor.getPlatform(), native, permission, build, tokens })
  }, [userId])

  const handleTestPush = async () => {
    setPushTesting(true)
    setPushTestMsg(null)
    try {
      const res = await sendTestPushCallable()
      if ((res.sent ?? 0) > 0) {
        setPushTestMsg("Sent! Check your notifications (background this tab to see it).")
      } else {
        setPushTestMsg("No device registered yet.")
      }
    } catch (e) {
      // failed-precondition = no registered devices; anything else is transient.
      const msg = e instanceof Error && e.message.includes("No registered devices")
        ? "No device registered yet."
        : "Couldn't send — please try again."
      setPushTestMsg(msg)
    } finally {
      setPushTesting(false)
      void loadPushDiag()
    }
  }

  useEffect(() => {
    if (!pushSupported) return
    ;(isNative ? isNativePushRegistered() : checkIsSubscribed()).then(setPushSubscribed)
  }, [pushSupported, isNative])

  // Per-event notification preferences (Push-only — Email was dropped, see
  // notificationPreferences.ts). Loaded on mount, saved optimistically on every
  // change — and a save that fails puts the switch BACK and says so (audit H6).
  // Both used to be silent: a failed read showed the defaults as if they were
  // the user's own (and the next tap wrote those defaults over the real
  // prefs), and a failed save left a switch "off" that the server still had on.
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS)
  const [notifLoad, setNotifLoad] = useState<"loading" | "ready" | "failed">("loading")
  const [notifLoadAttempt, setNotifLoadAttempt] = useState(0)
  const [notifSaveError, setNotifSaveError] = useState<{ section: NotifSection; message: string } | null>(null)
  /** What the server last confirmed — where a failed save puts the switches back. */
  const confirmedNotifPrefs = useRef<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS)
  const confirmedNotifSeq = useRef(0)
  const notifSaveSeq = useRef(0)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    getNotificationPrefs(user.id)
      .then((p) => {
        if (cancelled) return
        confirmedNotifPrefs.current = p
        setNotifPrefs(p)
        setNotifLoad("ready")
      })
      .catch((e: unknown) => {
        if (cancelled) return
        console.warn(`[settings] could not load notification preferences for ${user.id}:`, e instanceof Error ? e.message : e)
        setNotifLoad("failed")
      })
    return () => {
      cancelled = true
    }
  }, [user?.id, notifLoadAttempt])

  // Optimistic update: apply locally immediately, save in the background, put
  // it back if the save fails. Never writes before the real prefs are read —
  // a change made over the defaults would overwrite every other preference.
  const updateNotifPrefs = useCallback(
    (next: NotificationPrefs, section: NotifSection) => {
      const uid = user?.id
      if (!uid || notifLoad !== "ready") return
      const normalized = normalizeNotificationPrefs(next)
      setNotifPrefs(normalized)
      setNotifSaveError(null)
      const seq = ++notifSaveSeq.current
      setNotificationPrefs(uid, normalized)
        .then(() => {
          if (seq > confirmedNotifSeq.current) {
            confirmedNotifSeq.current = seq
            confirmedNotifPrefs.current = normalized
          }
        })
        .catch((e: unknown) => {
          console.warn(`[settings] could not save notification preferences for ${uid}:`, e instanceof Error ? e.message : e)
          // A later change is in flight and carries the whole state; let it decide.
          if (seq !== notifSaveSeq.current) return
          setNotifPrefs(confirmedNotifPrefs.current)
          // Said under the control that changed, so it is on screen.
          setNotifSaveError({ section, message: "Couldn't save that change. Check your connection and try again." })
        })
    },
    [user?.id, notifLoad]
  )

  const toggleNotifEvent = useCallback(
    (key: NotificationEventKey) => {
      if (NOTIF_EVENT_ROWS.find((r) => r.key === key)?.unavailable) return // nothing sends it yet
      updateNotifPrefs({
        ...notifPrefs,
        events: {
          ...notifPrefs.events,
          [key]: { push: !notifPrefs.events[key].push },
        },
      }, "events")
    },
    [notifPrefs, updateNotifPrefs]
  )

  const setNotifLeadTime = useCallback(
    (days: number) => {
      updateNotifPrefs({ ...notifPrefs, lead_time_days: days }, "timing")
    },
    [notifPrefs, updateNotifPrefs]
  )

  const setPushMode = useCallback(
    (mode: PushMode) => updateNotifPrefs({ ...notifPrefs, push_mode: mode }, "mode"),
    [notifPrefs, updateNotifPrefs]
  )

  const setWeeklyDigest = useCallback(
    (patch: Partial<NotificationPrefs["weekly_digest"]>) =>
      updateNotifPrefs({ ...notifPrefs, weekly_digest: { ...notifPrefs.weekly_digest, ...patch } }, "digest"),
    [notifPrefs, updateNotifPrefs]
  )

  // Quiet hours: clearing either field clears the window entirely (null).
  const setNotifQuietHours = useCallback(
    (start: string, end: string) => {
      const tz =
        notifPrefs.quiet_hours?.tz ??
        (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC")
      updateNotifPrefs({
        ...notifPrefs,
        quiet_hours: start && end ? { start, end, tz: tz || "UTC" } : null,
      }, "timing")
    },
    [notifPrefs, updateNotifPrefs]
  )
  const notifSaveErrorFor = (section: NotifSection) =>
    notifSaveError?.section === section ? <InlineError className="mx-1 mt-2.5">{notifSaveError.message}</InlineError> : null

  if (!pushSupported) {
    // The menu shows no Notifications row here; an old link can still arrive.
    return <p className="text-[0.9375rem] leading-[1.4]" style={{ color: "var(--hh-sub)" }}>This browser can&apos;t show Homehub notifications.</p>
  }

  return (
    <SectionCard>
      <CardContent className="p-4">
        {/* The page's heading names this; the row is what the switch does, and the switch. */}
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {pushSubscribed
              ? WHAT_NOTIFICATIONS_SEND_ON
              : WHAT_NOTIFICATIONS_SEND_SENTENCE}
          </p>
          <Button
            className="shrink-0"
            variant={pushSubscribed ? "outline" : "default"}
            size="sm"
            disabled={pushToggling}
            onClick={async () => {
              if (!user?.id || !homeId) return
              setPushToggling(true)
              setPushError(null)
              try {
                if (pushSubscribed) {
                  if (isNative) await unregisterNativePush(user.id)
                  else await unsubscribeFromPush(user.id)
                  setPushSubscribed(false)
                } else {
                  const result = isNative
                    ? await registerNativePush(user.id)
                    : await subscribeToPush(user.id)
                  if (result.success) setPushSubscribed(true)
                  else setPushError(result.error ?? "Couldn't enable notifications.")
                }
              } catch (e) {
                console.warn(`[settings] could not turn notifications ${pushSubscribed ? "off" : "on"}:`, e instanceof Error ? e.message : e)
                // Turning OFF used to swallow its own failure and show "off"
                // while the server kept the token and kept sending.
                setPushError(
                  pushSubscribed
                    ? e instanceof PushOffError
                      ? e.message
                      : "Couldn't turn off notifications. Check your connection and try again."
                    : e instanceof Error ? e.message : "Couldn't enable notifications.",
                )
              } finally {
                setPushToggling(false)
              }
            }}
          >
            {pushToggling ? "..." : pushSubscribed ? "Disable" : "Enable"}
          </Button>
        </div>
        {/* The review's "Turn on in Settings" lands here: on a device
            that refused, say where the switch is (owner, #228 review). */}
        <NotificationsRefusedNote />
        {pushError && <InlineError className="mt-1.5">{pushError}</InlineError>}
        {pushSubscribed && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pushTesting}
              onClick={handleTestPush}
            >
              {pushTesting ? "Sending..." : "Send test notification"}
            </Button>
            {pushTestMsg && (
              <span className="text-sm text-muted-foreground">{pushTestMsg}</span>
            )}
            <div className="mt-3 w-full rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.5px] text-muted-foreground">
                  Delivery diagnostics
                </span>
                <Button variant="ghost" size="sm" onClick={() => void loadPushDiag()}>
                  {pushDiag ? "Refresh" : "Check"}
                </Button>
              </div>
              {pushDiag && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[0.75rem]">
                  <dt className="text-muted-foreground">app</dt>
                  <dd>{pushDiag.native ? `native shell (${pushDiag.platform})` : `web browser (${pushDiag.platform})`}</dd>
                  <dt className="text-muted-foreground">permission</dt>
                  <dd>{pushDiag.permission}</dd>
                  <dt className="text-muted-foreground">build</dt>
                  <dd>{pushDiag.build}</dd>
                  <dt className="text-muted-foreground">tokens</dt>
                  <dd>
                    {pushDiag.tokens.length === 0
                      ? "none stored"
                      : pushDiag.tokens.map((t, i) => <div key={i}>{t.kind} · {t.len} chars</div>)}
                  </dd>
                </dl>
              )}
            </div>
          </div>
        )}

        {/* The prefs below are never shown as defaults standing in for a
            read that failed or is still running: a change made over them
            would write those defaults over every other preference. */}
        {user?.id && notifLoad !== "ready" && (
          <div className="mt-4">
            {notifLoad === "failed" ? (
              <InlineError onRetry={() => { setNotifLoad("loading"); setNotifLoadAttempt((n) => n + 1) }}>
                Couldn&apos;t load your notification settings.
              </InlineError>
            ) : (
              <p className="text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>Loading your notification settings…</p>
            )}
          </div>
        )}

        {/* Per-event preferences matrix (Push-only). Gates which kinds of
            push the user receives; the master control above gates whether
            this device can receive push at all. */}
        {user?.id && notifLoad === "ready" && (
          <div className="mt-4">
            <div className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>
              What to notify me about
            </div>

            <div
              className="overflow-hidden rounded-2xl"
              style={{ background: "var(--hh-surface2)", border: "1px solid var(--hh-line)" }}
            >
              {/* Column header */}
              <div
                className="flex items-end px-4 py-2.5"
                style={{ borderBottom: "1px solid var(--hh-line)" }}
              >
                <span className="flex-1" />
                <div className="flex w-10 flex-col items-center gap-0.5">
                  <BellIcon className="size-4" style={{ color: "var(--hh-sub)" }} />
                  {/* A 40px column header over the toggles: grows with Larger Text only
                      as far as the column fits (~1.27x). */}
                  <span className="text-[length:min(0.6875rem,14px)] font-bold uppercase tracking-[0.3px]" style={{ color: "var(--hh-sub)" }}>
                    PUSH
                  </span>
                </div>
              </div>

              {NOTIF_EVENT_ROWS.map((row, i) => {
                const RowIcon = row.icon
                const on = notifPrefs.events[row.key].push
                const unavailable = !!row.unavailable
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-3 px-4 py-3"
                    style={i ? { borderTop: "1px solid var(--hh-line)" } : undefined}
                  >
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-[9px]"
                      style={{ background: "var(--hh-teal-wash)" }}
                    >
                      <RowIcon className="size-[18px]" style={{ color: "var(--hh-teal)" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.9375rem] font-semibold" style={{ color: "var(--hh-ink)" }}>
                        {row.label}
                      </div>
                      <div className="mt-0.5 text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>
                        {row.sub}
                      </div>
                    </div>
                    {unavailable ? (
                      <span className="shrink-0 text-[0.8125rem] font-semibold" style={{ color: "var(--hh-sub)" }}>
                        Not yet
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleNotifEvent(row.key)}
                        aria-pressed={on}
                        aria-label={`${row.label} push ${on ? "on" : "off"}`}
                        className="hit-44 flex size-10 shrink-0 items-center justify-center rounded-[11px] transition-colors"
                        style={{
                          border: `1.5px solid ${on ? "var(--hh-teal-fill)" : "var(--hh-line2)"}`,
                          background: on ? "var(--hh-teal-fill)" : "var(--hh-surface)",
                        }}
                      >
                        {on && <CheckIcon className="size-[17px] text-white" strokeWidth={3} />}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {notifSaveErrorFor("events")}


            {/* Notification style — the breadth dial. */}
            <div className="mb-2 mt-5 text-[0.6875rem] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>
              What reminds me
            </div>
            <div
              role="radiogroup"
              aria-label="Notification style"
              className="overflow-hidden rounded-2xl"
              style={{ background: "var(--hh-surface2)", border: "1px solid var(--hh-line)" }}
            >
              {PUSH_MODE_OPTIONS.map((opt, i) => {
                const on = notifPrefs.push_mode === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPushMode(opt.value)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    style={i ? { borderTop: "1px solid var(--hh-line)" } : undefined}
                  >
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full"
                      style={{ border: `1.5px solid ${on ? "var(--hh-teal-fill)" : "var(--hh-line2)"}`, background: on ? "var(--hh-teal-fill)" : "var(--hh-surface)" }}
                    >
                      {on && <span className="size-2 rounded-full bg-[var(--hh-on-fill)]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] font-semibold" style={{ color: "var(--hh-ink)" }}>{opt.label}</span>
                      <span className="mt-0.5 block text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>{opt.sub}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {notifSaveErrorFor("mode")}
            <p className="mx-1 mt-2.5 text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>
              A task whose bell you turn off stays silent in every style.
            </p>

            {/* Weekly summary — the Sunday digest, at the user's hour. */}
            <div className="mb-2 mt-5 text-[0.6875rem] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>
              Weekly summary
            </div>
            <div
              className="overflow-hidden rounded-2xl"
              style={{ background: "var(--hh-surface2)", border: "1px solid var(--hh-line)" }}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[9px]" style={{ background: "var(--hh-teal-wash)" }}>
                  <BellIcon className="size-[18px]" style={{ color: "var(--hh-teal)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.9375rem] font-semibold" style={{ color: "var(--hh-ink)" }}>Your week at home</div>
                  <div className="mt-0.5 text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>
                    {notifPrefs.weekly_digest.enabled
                      ? `${DIGEST_DAYS[notifPrefs.weekly_digest.day]}s at ${hourLabel(notifPrefs.weekly_digest.hour)} · what's coming, and what to buy first`
                      : "Off — no weekly summary"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWeeklyDigest({ enabled: !notifPrefs.weekly_digest.enabled })}
                  aria-pressed={notifPrefs.weekly_digest.enabled}
                  aria-label={`Weekly summary push ${notifPrefs.weekly_digest.enabled ? "on" : "off"}`}
                  className="hit-44 flex size-10 shrink-0 items-center justify-center rounded-[11px] transition-colors"
                  style={{
                    border: `1.5px solid ${notifPrefs.weekly_digest.enabled ? "var(--hh-teal-fill)" : "var(--hh-line2)"}`,
                    background: notifPrefs.weekly_digest.enabled ? "var(--hh-teal-fill)" : "var(--hh-surface)",
                  }}
                >
                  {notifPrefs.weekly_digest.enabled && <CheckIcon className="size-[17px] text-white" strokeWidth={3} />}
                </button>
              </div>
              {notifPrefs.weekly_digest.enabled && (
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--hh-line)" }}>
                  <div className="min-w-0 flex-1 text-[0.9375rem] font-semibold" style={{ color: "var(--hh-ink)" }}>When</div>
                  <Select value={String(notifPrefs.weekly_digest.day)} onValueChange={(v) => setWeeklyDigest({ day: Number(v) })}>
                    <SelectTrigger className="w-[130px] shrink-0" aria-label="Weekly summary day"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIGEST_DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={String(notifPrefs.weekly_digest.hour)} onValueChange={(v) => setWeeklyDigest({ hour: Number(v) })}>
                    <SelectTrigger className="w-[100px] shrink-0" aria-label="Weekly summary time"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIGEST_HOURS.map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {notifSaveErrorFor("digest")}

            {/* Timing: lead time + quiet hours */}
            <div
              className="mt-4 overflow-hidden rounded-2xl"
              style={{ background: "var(--hh-surface2)", border: "1px solid var(--hh-line)" }}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[0.9375rem] font-semibold" style={{ color: "var(--hh-ink)" }}>
                    Reminder lead time
                  </div>
                  <div className="mt-0.5 text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>
                    How early to notify you before something is due
                  </div>
                </div>
                <Select
                  value={String(Math.min(notifPrefs.lead_time_days, MAX_LEAD_TIME_DAYS))}
                  onValueChange={(v) => setNotifLeadTime(Number(v))}
                >
                  <SelectTrigger className="w-[150px] shrink-0" aria-label="Reminder lead time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIF_LEAD_TIME_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: "1px solid var(--hh-line)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[0.9375rem] font-semibold" style={{ color: "var(--hh-ink)" }}>
                    Quiet hours
                  </div>
                  <div className="mt-0.5 text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>
                    {notifPrefs.quiet_hours
                      ? "Push is held during this window"
                      : "Set a window to mute non-urgent push"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    type="time"
                    aria-label="Quiet hours start"
                    value={notifPrefs.quiet_hours?.start ?? ""}
                    onChange={(e) =>
                      setNotifQuietHours(e.target.value, notifPrefs.quiet_hours?.end ?? "")
                    }
                    className="w-[110px]"
                  />
                  <span className="text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>
                    –
                  </span>
                  <Input
                    type="time"
                    aria-label="Quiet hours end"
                    value={notifPrefs.quiet_hours?.end ?? ""}
                    onChange={(e) =>
                      setNotifQuietHours(notifPrefs.quiet_hours?.start ?? "", e.target.value)
                    }
                    className="w-[110px]"
                  />
                </div>
              </div>
            </div>
            {notifSaveErrorFor("timing")}
          </div>
        )}
      </CardContent>
    </SectionCard>
  )
}
