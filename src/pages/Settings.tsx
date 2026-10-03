import { useCallback, useEffect, useRef, useState } from "react"
import { useDepsChanged } from "@/hooks/useDepsChanged"
import { useIsCurrent } from "@/hooks/useIsCurrent"
import { isAwaitingReview } from "@/lib/manualReviewState"
import { FeedbackButton } from "@/components/FeedbackButton"
import { SUPPORT_EMAIL } from "@/lib/feedback"
import { BootDiagnostics } from "@/components/settings/BootDiagnostics"
import { AlertCircleIcon, BellIcon, HomeIcon as HomeSetupIcon, CheckCircle2Icon, CheckIcon, CircleDotIcon, CompassIcon, DownloadIcon, LifeBuoyIcon, Loader2Icon, LockIcon, LogOutIcon, MegaphoneIcon, PencilIcon, PlusIcon, RefreshCwIcon, ShieldCheckIcon, ShieldIcon, Trash2, ShoppingBagIcon, ChevronRightIcon } from "lucide-react"
import { InlineError, SectionCard } from "@/components/layout"
import { useAutoFindManuals } from "@/hooks/useAutoFindManuals"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Link, useNavigate } from "react-router-dom"
import { useCurrentHome, getRooms, createRoom, renameRoom, deleteRoom } from "@/modules/home"
import { HomeMembersSection } from "@/components/settings/HomeMembersSection"
import { HomeProfileSection } from "@/components/settings/HomeProfileSection"
import { InterfaceLevelSection } from "@/components/settings/InterfaceLevelSection"
import { ServiceProvidersSection } from "@/components/settings/ServiceProvidersSection"
import { AdminToolsSection } from "@/components/settings/AdminToolsSection"
import { HouseRulesSection } from "@/components/settings/HouseRulesSection"
import { useFeatureTour } from "@/hooks/useFeatureTour"
import { useUserLevel } from "@/hooks/useUserLevel"
import { useAppearance, type Appearance } from "@/lib/theme"
import { useAuth } from "@/modules/auth"
import { isPushSupported, subscribeToPush, unsubscribeFromPush, isSubscribed as checkIsSubscribed } from "@/lib/pushNotifications"
import { isNativePlatform, isNativePushRegistered, PushOffError, registerNativePush, unregisterNativePush } from "@/lib/nativePush"
import { NotificationsRefusedNote } from "@/components/settings/NotificationsRefusedNote"
import {
  getRoutineTemplates,
  saveRoutineTask,
  deleteRoutineTask,
  type RoutineTemplate,
} from "@/lib/cleanSession"
import { getManualsByHome, getKnowledgeChunksByHome, getFaqsByHome, deleteManualDocument } from "@/modules/knowledge"
import { openPendingReview, rescanForReviewAndWait, startRescanForReview } from "@/lib/manualRescan"
import { isCapacityRefusal } from "@/lib/scanCapacity"
import { getItemUnits } from "@/modules/items"
import { getTaskTemplates } from "@/modules/care"
import { getNotificationPrefs, setNotificationPrefs } from "@/lib/userPreferences"
import {
  DEFAULT_NOTIFICATION_PREFS,
  MAX_LEAD_TIME_DAYS,
  normalizeNotificationPrefs,
  type NotificationEventKey,
  type NotificationPrefs,
  type PushMode,
} from "@/lib/notificationPreferences"
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore"
import { db, callable } from "@/integrations/firebase"

const sendTestPushCallable = callable<void, { ok: boolean; sent?: number }>("sendTestPush")
import type { ManualDocument, Room } from "@/integrations/types"
import { withChunkRetry } from "@/lib/chunkRetry"
import { localToday } from "../../shared/dates/calendar"

type ManualWithName = ManualDocument & { display_name: string }
/** `ready`: read, and waiting for its review on the item page — never saved from here.
 *  `queued`: refused for capacity and recorded to start itself (HH-124). */
type ManualStatus = "idle" | "scanning" | "ready" | "queued" | "error"
type ManualScanState = { status: ManualStatus; error?: string }
/** Which block of notification controls a failed save belongs to — its error is said there. */
type NotifSection = "events" | "mode" | "digest" | "timing"

const SCHEDULE_OPTIONS = [
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "as_needed",
] as const

// Per-event notification rows for the preferences matrix. Push-only by design
// (see notificationPreferences.ts). Safety & recalls is locked on.
const NOTIF_EVENT_ROWS: {
  key: NotificationEventKey
  icon: typeof BellIcon
  label: string
  sub: string
  locked?: boolean
}[] = [
  { key: "task_reminders", icon: BellIcon, label: "Task reminders", sub: "When upkeep is due" },
  {
    key: "warranty_expiring",
    icon: ShieldCheckIcon,
    label: "Warranty expiring",
    sub: "30 days before coverage ends",
  },
  {
    key: "safety_recalls",
    icon: MegaphoneIcon,
    label: "Safety & recalls",
    sub: "For items you own",
    locked: true,
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
const PUSH_MODE_OPTIONS: { value: PushMode; label: string; sub: string }[] = [
  { value: "curated", label: "Just my list", sub: "Only reminders you turned on. Nothing else notifies." },
  { value: "curated+essential", label: "My list + anything Essential", sub: "Your list, plus safety and damage-prevention work by default." },
  { value: "all", label: "Everything on a schedule", sub: "Every scheduled task reminds you when it's due." },
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

// Desktop section-index rail (anchors map to ids on the sections below).
const SETTINGS_NAV: [string, string][] = [
  ["account", "Account"],
  ["level", "Experience level"],
  ["appearance", "Appearance"],
  ["tasks", "Custom tasks"],
  ["rooms", "Rooms"],
  ["house-rules", "House rules"],
  ["home-profile", "Home profile"],
  ["providers", "Service providers"],
  ["members", "Members"],
  ["manuals", "Manuals"],
  ["data", "Export data"],
  ["reminders", "Your reminders"],
  ["home-setup", "Your home"],
  ["notifications", "Notifications"],
  ["privacy", "Data & privacy"],
]

type RoutinesRead = { routines: RoutineTemplate[] } | { error: unknown }

/** One read of the home's custom tasks — the list, or the error. */
async function readRoutines(homeId: string): Promise<RoutinesRead> {
  try {
    return { routines: await getRoutineTemplates(homeId) }
  } catch (error) {
    // Not swallowed: handed back to be logged and said (applyRoutines).
    return { error }
  }
}

type RoomsRead =
  | { rooms: Room[]; counts: Record<string, number>; error: null }
  | { rooms: Room[] | null; counts: null; error: unknown }

/** One read of the home's rooms and how many items each holds. A room list
 *  that arrived before the counts failed is still handed back. */
async function readRooms(homeId: string): Promise<RoomsRead> {
  let rooms: Room[] | null = null
  try {
    const res = await getRooms(homeId)
    if (res.error) throw new Error(res.error.message)
    rooms = res.data ?? []

    // Fetch item counts per room
    const countsSnap = await getDocs(
      query(collection(db, `homes/${homeId}/items`), where("deletedAt", "==", null))
    )

    const countMap: Record<string, number> = {}
    for (const d of countsSnap.docs) {
      const roomId = d.data().roomId as string | null | undefined
      if (roomId) {
        countMap[roomId] = (countMap[roomId] ?? 0) + 1
      }
    }
    return { rooms, counts: countMap, error: null }
  } catch (error) {
    // Not swallowed: handed back to be logged and said (applyRooms).
    return { rooms, counts: null, error }
  }
}

export default function Settings() {
  const [autoFindManuals, setAutoFindManuals] = useAutoFindManuals()
  const { user, signOut } = useAuth()
  // The callbacks below depend on the id, not the user object; reading
  // `user.id` inside them made the compiler infer `user` and skip them
  // (react-hooks/preserve-manual-memoization).
  const userId = user?.id
  const { home } = useCurrentHome()
  const { level } = useUserLevel()
  const { appearance, setAppearance } = useAppearance()
  const homeId = home?.home_id ?? null
  const { restartTour } = useFeatureTour()
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)

  // Profile editing state
  const [profileName, setProfileName] = useState("")
  const [profileNameDraft, setProfileNameDraft] = useState("")
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        // Public profile lives on users/{uid} (fullName).
        const snap = await getDoc(doc(db, `users/${user.id}`))
        if (cancelled) return
        const name = (snap.exists() ? (snap.get("fullName") as string | null) : null) ?? ""
        setProfileName(name)
        setProfileNameDraft(name)
      } catch (e) {
        if (!cancelled) setProfileError(e instanceof Error ? e.message : "Failed to load profile")
      }
      if (!cancelled) setProfileLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const handleSaveProfile = useCallback(async () => {
    if (!userId) return
    const trimmed = profileNameDraft.trim()
    if (trimmed === profileName) return
    setProfileSaving(true)
    setProfileError(null)
    setProfileSaved(false)
    try {
      // Upsert-style merge on users/{uid} — creates the doc if it's missing
      // (v1's 0-rows RLS failure mode doesn't exist here).
      await setDoc(
        doc(db, `users/${userId}`),
        { fullName: trimmed || null, updatedAt: serverTimestamp() },
        { merge: true }
      )
      setProfileName(trimmed)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to save profile")
    } finally {
      setProfileSaving(false)
    }
  }, [userId, profileNameDraft, profileName])

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      await signOut()
      navigate("/", { replace: true })
    } finally {
      setIsSigningOut(false)
    }
  }, [isSigningOut, signOut, navigate])

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
        const raw = (snap.get("tokens") as string[] | undefined) ?? []
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
      if (key === "safety_recalls") return // locked on
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

  const [routines, setRoutines] = useState<RoutineTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState("")
  const [newSchedule, setNewSchedule] = useState<(typeof SCHEDULE_OPTIONS)[number]>("weekly")
  const [newMinutes, setNewMinutes] = useState<string>("")
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Room management state
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomItemCounts, setRoomItemCounts] = useState<Record<string, number>>({})
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [addingRoom, setAddingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [savingRoom, setSavingRoom] = useState(false)
  const [deleteConfirmRoom, setDeleteConfirmRoom] = useState<Room | null>(null)
  const [deletingRoom, setDeletingRoom] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const renamingRef = useRef(false)
  /** The rename that just failed — leaving the field does not send it again. */
  const failedRenameRef = useRef<{ roomId: string; name: string } | null>(null)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Rescan state
  const [manuals, setManuals] = useState<ManualWithName[]>([])
  const [manualStates, setManualStates] = useState<Record<string, ManualScanState>>({})
  const [rescanRunning, setRescanRunning] = useState(false)
  const [manualsLoaded, setManualsLoaded] = useState(false)
  const [manualsLoadFailed, setManualsLoadFailed] = useState(false)
  const [manualsAttempt, setManualsAttempt] = useState(0)

  // Each section says when its read or a write failed (audit H6). These all
  // used to fail in silence: a list that never loaded rendered as empty, and a
  // rename, add or delete that the server refused closed its editor as if it
  // had worked.
  const [routinesLoadFailed, setRoutinesLoadFailed] = useState(false)
  const [routinesError, setRoutinesError] = useState<string | null>(null)
  const [roomsLoadFailed, setRoomsLoadFailed] = useState(false)
  const [roomsError, setRoomsError] = useState<string | null>(null)

  // Custom tasks and rooms are each read by ONE function (readRoutines /
  // readRooms) and land through ONE apply, whether the read is the first, a
  // home switch, Try again, or the re-read after an add. Before H5 each was a
  // load() that set its spinner synchronously inside the effect calling it.
  const applyRoutines = useCallback((res: RoutinesRead) => {
    if ("routines" in res) {
      setRoutines(res.routines)
      setRoutinesLoadFailed(false)
    } else {
      console.warn(`[settings] could not load custom tasks for home ${homeId}:`, res.error instanceof Error ? res.error.message : res.error)
      setRoutinesLoadFailed(true)
    }
    setLoading(false)
  }, [homeId])

  // Both lists land only while their home is still the one on screen (H4):
  // home A's read answering after a switch to B used to replace B's list with
  // A's. A Try again or post-add re-read held from before the switch does not
  // start at all — it would put a spinner on B's list, then have its answer
  // dropped.
  const isCurrentHome = useIsCurrent(homeId)

  const loadRoutines = useCallback(async () => {
    if (!homeId || !isCurrentHome(homeId)) return
    setLoading(true)
    const res = await readRoutines(homeId)
    if (isCurrentHome(homeId)) applyRoutines(res)
  }, [homeId, applyRoutines, isCurrentHome])

  // Load rooms and item counts
  const applyRooms = useCallback((res: RoomsRead) => {
    if (res.rooms) setRooms(res.rooms)
    if (res.counts !== null) {
      setRoomItemCounts(res.counts)
      setRoomsLoadFailed(false)
    } else {
      console.warn(`[settings] could not load rooms for home ${homeId}:`, res.error instanceof Error ? res.error.message : res.error)
      setRoomsLoadFailed(true)
    }
    setRoomsLoading(false)
  }, [homeId])

  const loadRooms = useCallback(async () => {
    if (!homeId || !isCurrentHome(homeId)) return
    setRoomsLoading(true)
    const res = await readRooms(homeId)
    if (isCurrentHome(homeId)) applyRooms(res)
  }, [homeId, applyRooms, isCurrentHome])

  // The first read and a home switch: both spinners start in the render that
  // switches (they start on for the first), and the effects only read.
  if (useDepsChanged([homeId]) && homeId) {
    setLoading(true)
    setRoomsLoading(true)
  }
  useEffect(() => {
    if (!homeId) return
    void readRoutines(homeId).then((res) => {
      if (isCurrentHome(homeId)) applyRoutines(res)
    })
  }, [homeId, applyRoutines, isCurrentHome])
  useEffect(() => {
    if (!homeId) return
    void readRooms(homeId).then((res) => {
      if (isCurrentHome(homeId)) applyRooms(res)
    })
  }, [homeId, applyRooms, isCurrentHome])

  const handleStartEditRoom = useCallback((room: Room) => {
    failedRenameRef.current = null
    setEditingRoomId(room.room_id)
    setEditingName(room.name)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }, [])

  /** `via` is how the save was asked for: Enter in the field, or leaving it. */
  const handleSaveRename = useCallback(async (via: "enter" | "blur") => {
    if (!editingRoomId || !editingName.trim()) {
      setEditingRoomId(null)
      return
    }
    // The room this save is for. The editor can move on while the save is in
    // flight — "Rename" on another room opens that room's editor — so all that
    // follows the await is about THIS room, not whichever editor is open then.
    const roomId = editingRoomId
    const name = editingName.trim()
    const existingRoom = rooms.find((r) => r.room_id === roomId)
    if (existingRoom && existingRoom.name === name) {
      setEditingRoomId(null)
      return
    }
    if (!homeId || renamingRef.current) return
    // Leaving the field never re-sends the rename that just failed. The editor
    // stays open after a failure, so every tap elsewhere would write, and fail,
    // again. Enter, or a changed name, tries again.
    const failed = failedRenameRef.current
    if (via === "blur" && failed?.roomId === roomId && failed.name === name) return
    // One rename at a time: the editor disabling itself mid-save can blur it,
    // and blur saves — that must not start a second write.
    renamingRef.current = true
    setSavingRoom(true)
    setRoomsError(null)
    const res = await renameRoom(homeId, roomId, name)
    renamingRef.current = false
    setSavingRoom(false)
    if (res.error || !res.data) {
      // The editor stays open with what was typed (as Add room's form does),
      // and the section says why — Enter tries again, Escape keeps the old name.
      console.warn(`[settings] could not rename room ${roomId} (home ${homeId}):`, res.error?.message)
      setRoomsError("Couldn't rename that room. Check your connection and try again.")
      failedRenameRef.current = { roomId, name }
      // Focus goes back only after Enter, when the person was still in the
      // field. A save that ran because they LEFT it must not pull them back:
      // each attempt to leave would save, fail and refocus again, with Escape
      // the only way out.
      if (via === "enter") setTimeout(() => editInputRef.current?.focus(), 0)
      return
    }
    failedRenameRef.current = null
    setRooms((prev) => prev.map((r) => (r.room_id === roomId ? res.data! : r)))
    // Closes THIS room's editor only. Leaving room X's field for "Rename Y"
    // saves X on the blur, and Y's editor opened while that save was in flight
    // used to be closed by it landing.
    setEditingRoomId((open) => (open === roomId ? null : open))
  }, [homeId, editingRoomId, editingName, rooms])

  const handleAddRoom = useCallback(async () => {
    if (!homeId || !newRoomName.trim()) return
    setSavingRoom(true)
    setRoomsError(null)
    const res = await createRoom({ home_id: homeId, name: newRoomName.trim() })
    setSavingRoom(false)
    if (res.error || !res.data) {
      // The form stays open with the name typed, ready to try again.
      // Ids and lengths only — what someone typed stays out of the logs.
      console.warn(`[settings] could not add a room (${newRoomName.trim().length}-char name, home ${homeId}):`, res.error?.message)
      setRoomsError("Couldn't add that room. Check your connection and try again.")
      return
    }
    setRooms((prev) => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)))
    setNewRoomName("")
    setAddingRoom(false)
  }, [homeId, newRoomName])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmRoom || !homeId) return
    setDeletingRoom(true)
    setRoomsError(null)
    const res = await deleteRoom(homeId, deleteConfirmRoom.room_id)
    setDeletingRoom(false)
    setDeleteConfirmRoom(null)
    if (res.error || !res.data) {
      // The room is still there — the list says so rather than looking deleted.
      console.warn(`[settings] could not delete room ${deleteConfirmRoom.room_id} (home ${homeId}):`, res.error?.message)
      setRoomsError(`Couldn't delete ${deleteConfirmRoom.name}. Check your connection and try again.`)
      return
    }
    setRooms((prev) => prev.filter((r) => r.room_id !== deleteConfirmRoom.room_id))
    setRoomItemCounts((prev) => {
      const next = { ...prev }
      delete next[deleteConfirmRoom.room_id]
      return next
    })
  }, [deleteConfirmRoom, homeId])

  const handleAdd = useCallback(async () => {
    if (!homeId || !newTitle.trim()) return
    setAdding(true)
    setRoutinesError(null)
    try {
      const result = await saveRoutineTask(
        homeId,
        newTitle.trim(),
        newSchedule,
        newMinutes ? parseInt(newMinutes, 10) : null
      )
      if ("error" in result) {
        // The typed task stays in the form, ready to try again.
        console.warn(`[settings] could not add custom task (home ${homeId}):`, result.error)
        setRoutinesError("Couldn't add that task. Check your connection and try again.")
        return
      }
      setNewTitle("")
      setNewMinutes("")
      await loadRoutines()
    } finally {
      setAdding(false)
    }
  }, [homeId, newTitle, newSchedule, newMinutes, loadRoutines])

  const handleDelete = useCallback(
    async (templateId: string) => {
      // `homeId` was missing from this callback's deps, so a page opened before
      // the home loaded deleted against an empty home id — refused, in silence.
      if (!homeId) return
      setDeletingId(templateId)
      setRoutinesError(null)
      const result = await deleteRoutineTask(homeId, templateId)
      setDeletingId(null)
      if (!result.ok) {
        console.warn(`[settings] could not delete custom task ${templateId} (home ${homeId}):`, result.error)
        setRoutinesError("Couldn't delete that task. Check your connection and try again.")
        return
      }
      setRoutines((prev) => prev.filter((r) => r.task_template_id !== templateId))
    },
    [homeId]
  )

  // Load manuals list. A failed read says so — it used to render as
  // "0 manuals uploaded".
  useEffect(() => {
    if (!homeId) return
    let cancelled = false
    void getManualsByHome(homeId).then((res) => {
      if (cancelled) return
      if (res.error) {
        console.warn(`[settings] could not load manuals for home ${homeId}:`, res.error.message)
        setManualsLoadFailed(true)
      } else {
        setManuals(res.data ?? [])
        setManualsLoadFailed(false)
      }
      setManualsLoaded(true)
    })
    return () => { cancelled = true }
  }, [homeId, manualsAttempt])

  // "Rescan all": one manual at a time, each read left for its review on the
  // item page. It used to run in COMMIT mode and write every manual's tasks
  // into the home unreviewed — see lib/manualRescan.
  const runRescan = useCallback(async (targets: ManualWithName[]) => {
    if (!homeId || rescanRunning || targets.length === 0) return
    setRescanRunning(true)

    for (let i = 0; i < targets.length; i++) {
      const m = targets[i]
      setManualStates((prev) => ({ ...prev, [m.manual_id]: { status: "scanning" } }))
      const result = await rescanForReviewAndWait(homeId, m)
      setManualStates((prev) => ({
        ...prev,
        [m.manual_id]: result.ok
          ? { status: "ready" }
          : isCapacityRefusal(result.error)
            ? { status: "queued" }
            : { status: "error", error: result.error },
      }))
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 5000))
      }
    }

    setRescanRunning(false)
  }, [homeId, rescanRunning])

  // HH-154: a row that says "Not scanned" with no way to act on it is a dead
  // end — the owner had three of them. Every row can now be rescanned or
  // removed on its own.
  //
  // A row's Rescan hands off like the add wizard does: start a fresh read and
  // go to the item page, which watches it land and opens the review there.
  const handleRescanOne = useCallback(async (m: ManualWithName) => {
    if (!homeId || rescanRunning) return
    setManualStates((prev) => ({ ...prev, [m.manual_id]: { status: "scanning" } }))
    const started = await startRescanForReview(homeId, m)
    if (started.ok) {
      navigate(started.reviewPath)
      return
    }
    setManualStates((prev) => ({
      ...prev,
      [m.manual_id]: started.queued ? { status: "queued" } : { status: "error", error: started.error },
    }))
  }, [homeId, rescanRunning, navigate])

  // Read and not saved: the review is waiting, so go to it — a new read would
  // throw the waiting one away.
  const handleOpenReview = useCallback((m: ManualWithName) => {
    navigate(openPendingReview(m))
  }, [navigate])
  const [removingManual, setRemovingManual] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)
  const handleRemoveManual = useCallback(async (m: ManualWithName) => {
    if (!homeId || removingManual) return
    setRemovingManual(m.manual_id)
    setManualError(null)
    const res = await deleteManualDocument(homeId, m.manual_id)
    setRemovingManual(null)
    if (res.error) { setManualError(`Could not remove ${m.display_name}: ${res.error.message}`); return }
    setManuals((prev) => prev.filter((x) => x.manual_id !== m.manual_id))
  }, [homeId, removingManual])

  const handleRescanAll = useCallback(() => {
    runRescan(manuals)
  }, [manuals, runRescan])

  const handleRetryFailed = useCallback(() => {
    const failed = manuals.filter((m) => manualStates[m.manual_id]?.status === "error")
    runRescan(failed)
  }, [manuals, manualStates, runRescan])

  const handleExport = useCallback(async () => {
    if (!homeId) return
    setExporting(true)
    setExportError(null)
    try {
      const [itemsRes, tasksRes, chunksRes, faqsRes] = await Promise.all([
        getItemUnits(homeId),
        getTaskTemplates(homeId),
        getKnowledgeChunksByHome(homeId),
        getFaqsByHome(homeId),
      ])
      // A read that failed used to export as an empty list — a backup missing
      // whole sections, downloaded as if it were complete.
      const reads = [["items", itemsRes], ["tasks", tasksRes], ["knowledge", chunksRes], ["saved answers", faqsRes]] as const
      const missing: string[] = reads.filter(([, r]) => r.error).map(([name]) => name)
      if (manualsLoadFailed) missing.push("manuals")
      if (missing.length > 0) {
        console.warn(`[settings] export refused — could not read ${missing.join(", ")} (home ${homeId})`)
        setExportError("Couldn't export your data — part of it couldn't be read. Check your connection and try again.")
        return
      }

      const data = {
        exported_at: new Date().toISOString(),
        items: itemsRes.data ?? [],
        tasks: tasksRes.data ?? [],
        knowledge: chunksRes.data ?? [],
        faqs: faqsRes.data ?? [],
        manuals: manuals,
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const date = localToday()
      const a = document.createElement("a")
      a.href = url
      a.download = `homehub-export-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }, [homeId, manuals, manualsLoadFailed])

  const failedCount = manuals.filter((m) => manualStates[m.manual_id]?.status === "error").length

  return (
    <div className="mx-auto max-w-5xl p-6 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-8">
      {/* Desktop section-index rail */}
      <nav className="hidden lg:sticky lg:top-6 lg:block">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>On this page</div>
        <ul className="space-y-0.5">
          {SETTINGS_NAV.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="block rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors"
                style={{ color: "var(--hh-ink)" }}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main settings column */}
      <div className="min-w-0 space-y-6 lg:max-w-3xl">
      {/* Redesigned header + profile card (calm tier language) */}
      <h1 id="account" className="scroll-mt-6 text-[28px] font-extrabold tracking-[-0.7px]" style={{ color: "var(--hh-ink)" }}>Settings</h1>
      <div className="mt-3 flex items-center gap-3.5 rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: "var(--hh-surface)" }}>
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
          style={{ background: "linear-gradient(135deg,var(--hh-teal),#2D9B82)" }}
        >
          {(user?.email ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold tracking-[-0.3px]" style={{ color: "var(--hh-ink)" }}>
            {(user?.user_metadata?.full_name as string | undefined) ?? "Your account"}
          </div>
          <div className="truncate text-[13px]" style={{ color: "var(--hh-sub)" }}>{user?.email ?? ""}</div>
        </div>
      </div>

      {/* Homehub level — the signature progressive-disclosure control, up top */}
      <div id="level" className="scroll-mt-6">
        <InterfaceLevelSection />
      </div>

      {/* Appearance — Light / Dark / System */}
      <section
        id="appearance"
        className="scroll-mt-6 rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
        style={{ background: "var(--hh-surface)" }}
      >
        <h2 className="text-[17px] font-bold tracking-[-0.3px]" style={{ color: "var(--hh-ink)" }}>
          Appearance
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: "var(--hh-sub)" }}>
          Choose a light or dark theme, or follow your device setting.
        </p>
        <div
          className="mt-3 inline-flex rounded-xl p-1"
          style={{ background: "var(--hh-surface2)", border: "1px solid var(--hh-line)" }}
          role="radiogroup"
          aria-label="Appearance"
        >
          {([
            ["light", "Light"],
            ["dark", "Dark"],
            ["system", "System"],
          ] as [Appearance, string][]).map(([value, label]) => {
            const active = appearance === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAppearance(value)}
                className="rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors"
                style={
                  active
                    ? { background: "var(--hh-surface)", color: "var(--hh-teal)", boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }
                    : { background: "transparent", color: "var(--hh-sub)" }
                }
              >
                {label}
              </button>
            )
          })}
        </div>
      </section>

      {homeId && (
        <SectionCard id="tasks" className="mt-6 scroll-mt-6">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Custom Tasks
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {/* HH-153 (owner, 2026-09-05): this promised a door that does not
                  exist — nothing on the Tasks page adds a task. Say what the box
                  is for, and point at the door that IS there. */}
              Tasks for the whole home rather than one item — cleaning, maintenance,
              anything on a schedule. Tasks that belong to an item are added from
              that item&apos;s page.
            </p>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                {/* A list that never loaded is not an empty list. */}
                {routinesLoadFailed && (
                  <InlineError className="mb-4" onRetry={() => void loadRoutines()}>
                    Couldn&apos;t load your custom tasks.
                  </InlineError>
                )}
                <div className="space-y-2 mb-4">
                  {routines.map((r) => (
                    <div
                      key={r.task_template_id}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <span className="font-medium text-sm">{r.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                          {r.schedule_type.replace(/_/g, " ")}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={deletingId === r.task_template_id}
                          onClick={() => handleDelete(r.task_template_id)}
                          aria-label={`Delete ${r.title}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[140px]">
                    <label className="sr-only" htmlFor="routine-title">
                      Task name
                    </label>
                    <Input
                      id="routine-title"
                      placeholder="Task name"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                  </div>
                  <Select
                    value={newSchedule}
                    onValueChange={(v) => setNewSchedule(v as (typeof SCHEDULE_OPTIONS)[number])}
                  >
                    <SelectTrigger className="w-[120px]" aria-label="Routine schedule">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="w-20">
                    <label className="sr-only" htmlFor="routine-minutes">
                      Minutes
                    </label>
                    <Input
                      id="routine-minutes"
                      type="number"
                      min={1}
                      placeholder="~min"
                      value={newMinutes}
                      onChange={(e) => setNewMinutes(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!newTitle.trim() || adding}
                    onClick={handleAdd}
                  >
                    {adding ? "Adding…" : "Add"}
                  </Button>
                </div>
                {routinesError && <InlineError className="mt-3">{routinesError}</InlineError>}
              </>
            )}
          </CardContent>
        </SectionCard>
      )}
      {homeId && (
        <SectionCard id="rooms" className="mt-6 scroll-mt-6">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Rooms
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Manage the rooms in your home. Items and tasks can be organized by room.
            </p>

            {roomsLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <>
                {roomsLoadFailed && (
                  <InlineError className="mb-4" onRetry={() => void loadRooms()}>
                    Couldn&apos;t load your rooms.
                  </InlineError>
                )}
                {roomsError && <InlineError className="mb-3">{roomsError}</InlineError>}
                <div className="space-y-1 mb-4">
                  {rooms.map((room) => (
                    <div
                      key={room.room_id}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0 group"
                    >
                      {editingRoomId === room.room_id ? (
                        <Input
                          ref={editInputRef}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => void handleSaveRename("blur")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveRename("enter")
                            if (e.key === "Escape") setEditingRoomId(null)
                          }}
                          disabled={savingRoom}
                          className="max-w-[200px]"
                        />
                      ) : (
                        <button
                          type="button"
                          className="font-medium text-sm text-left hover:text-primary transition-colors"
                          onClick={() => handleStartEditRoom(room)}
                        >
                          {room.name}
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        {(roomItemCounts[room.room_id] ?? 0) > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {roomItemCounts[room.room_id]} item{roomItemCounts[room.room_id] !== 1 ? "s" : ""}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 hover:text-primary transition-opacity"
                          onClick={() => handleStartEditRoom(room)}
                          aria-label={`Rename ${room.name}`}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 hover:text-destructive transition-opacity"
                          onClick={() => setDeleteConfirmRoom(room)}
                          aria-label={`Delete ${room.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {addingRoom ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={addInputRef}
                      placeholder="Room name"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddRoom()
                        if (e.key === "Escape") {
                          setAddingRoom(false)
                          setNewRoomName("")
                        }
                      }}
                      disabled={savingRoom}
                      className="max-w-[200px]"
                      autoFocus
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!newRoomName.trim() || savingRoom}
                      onClick={handleAddRoom}
                    >
                      {savingRoom ? "Adding..." : "Add"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddingRoom(false)
                        setNewRoomName("")
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAddingRoom(true)
                      setTimeout(() => addInputRef.current?.focus(), 0)
                    }}
                  >
                    <PlusIcon className="size-4 mr-1.5" />
                    Add Room
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </SectionCard>
      )}

      {/* Delete room confirmation dialog */}
      <Dialog open={!!deleteConfirmRoom} onOpenChange={(open) => !open && setDeleteConfirmRoom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirmRoom?.name}?</DialogTitle>
            <DialogDescription>
              Items in this room will be moved to "No room." This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmRoom(null)} disabled={deletingRoom}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deletingRoom}>
              {deletingRoom ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {homeId && <HouseRulesSection homeId={homeId} />}

      {homeId && <div id="home-profile" className="scroll-mt-6"><HomeProfileSection homeId={homeId} /></div>}

      {homeId && <div id="providers" className="scroll-mt-6"><ServiceProvidersSection homeId={homeId} /></div>}

      {homeId && <div id="members" className="scroll-mt-6"><HomeMembersSection homeId={homeId} /></div>}

        {/* Beta features — off by default. The automatic manual search is a
            work in progress that can offer a near-miss model (a Core 300S
            manual for a Core 300), and the wrong manual becomes a whole care
            plan for the wrong appliance. Opt in knowingly or not at all. */}
        <SectionCard id="beta" className="mt-6 scroll-mt-6">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-1">Beta features</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Still finding their feet. They never change anything without asking you first.
            </p>
            <div
              className="flex items-start justify-between gap-3 rounded-xl border p-3"
              style={{ borderColor: "var(--hh-line)" }}
            >
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>
                  Find manuals automatically
                </p>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--hh-sub)" }}>
                  Search as soon as the brand and model are known, instead of waiting to be asked.
                  Results always need your confirmation before anything is attached.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoFindManuals}
                aria-label="Find manuals automatically"
                onClick={() => setAutoFindManuals(!autoFindManuals)}
                className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors"
                style={{ background: autoFindManuals ? "var(--hh-teal)" : "var(--hh-line2)" }}
              >
                <span
                  className="absolute top-0.5 size-5 rounded-full bg-white transition-all"
                  style={{ left: autoFindManuals ? "calc(100% - 22px)" : "2px" }}
                />
              </button>
            </div>
          </CardContent>
        </SectionCard>

      {homeId && manualsLoaded && (
        <SectionCard id="manuals" className="mt-6 scroll-mt-6">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-1">
              Manuals
            </h2>
            {manualsLoadFailed ? (
              // Not "0 manuals uploaded" — that is a count of a list never read.
              <InlineError className="mb-4" onRetry={() => setManualsAttempt((n) => n + 1)}>
                Couldn&apos;t load your manuals.
              </InlineError>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">
                {manuals.length} manual{manuals.length !== 1 ? "s" : ""} uploaded.
                Rescan reads a manual again — nothing changes until you review it.
              </p>
            )}

            {manuals.length > 0 && (
              <div className="space-y-1.5 mb-4">
                {manuals.map((m) => {
                  const state = manualStates[m.manual_id]
                  // HH-141: "Not scanned" is false for a manual we HAVE read
                  // and never saved — the same lie the item page was telling
                  // one screen over. `isAwaitingReview` is the shared answer.
                  const awaitingReview = isAwaitingReview(m)
                  const parsedDate = m.parsed_at
                    ? new Date(m.parsed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : null
                  return (
                    <div
                      key={m.manual_id}
                      className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0 text-sm"
                    >
                      {/* Status icon */}
                      {state?.status === "scanning" ? (
                        <Loader2Icon className="size-3.5 animate-spin text-primary shrink-0" />
                      ) : state?.status === "ready" ? (
                        <CheckCircle2Icon className="size-3.5 shrink-0" style={{ color: "var(--hh-teal)" }} />
                      ) : state?.status === "queued" ? (
                        <CircleDotIcon className="size-3.5 text-muted-foreground shrink-0" />
                      ) : state?.status === "error" ? (
                        <AlertCircleIcon className="size-3.5 text-destructive shrink-0" />
                      ) : parsedDate ? (
                        <CircleDotIcon className="size-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        // One colour per status: this dot and its label were
                        // amber and clay respectively after the contrast fix.
                        <CircleDotIcon className="size-3.5 shrink-0" style={{ color: "var(--hh-clay)" }} />
                      )}

                      {/* Name */}
                      <span className="font-medium flex-1 min-w-0 truncate">{m.display_name}</span>

                      {/* Status text */}
                      {state?.status === "scanning" ? (
                        <span className="text-xs text-muted-foreground shrink-0">Scanning…</span>
                      ) : state?.status === "ready" ? (
                        // Read, not saved: what it found waits for the review.
                        <span className="text-xs shrink-0" style={{ color: "var(--hh-teal)" }}>Ready to review</span>
                      ) : state?.status === "queued" ? (
                        // HH-124: a ceiling is not a failure — it starts itself.
                        <span className="text-xs text-muted-foreground shrink-0">Queued</span>
                      ) : state?.status === "error" ? (
                        <span className="text-xs text-destructive shrink-0 max-w-[200px] truncate" title={state.error}>
                          {state.error}
                        </span>
                      ) : parsedDate ? (
                        <span className="text-xs text-muted-foreground shrink-0">
                          Scanned {parsedDate}
                        </span>
                      ) : (
                        // Clay, not amber-600: at 12px on the settings surface
                        // amber-600 lands at 3.08:1 against a 4.5:1 floor, and
                        // this is the ONE line telling someone the state of
                        // their manual. It stayed invisible to the a11y suite
                        // until the seed gained an unsaved manual (HH-140).
                        <span className="text-xs shrink-0" style={{ color: "var(--hh-clay)" }}>
                          {awaitingReview ? "Read — not saved" : "Not scanned"}
                        </span>
                      )}

                      {/* HH-154: per-row actions. Without these a stuck manual
                          was permanent — "Rescan All" was the only lever and it
                          re-ran every manual to fix one. */}
                      <span className="flex shrink-0 items-center gap-2.5 text-xs font-bold" style={{ color: "var(--hh-teal)" }}>
                        {/* A read waiting to be saved offers its review, not
                            another read; everything else can be read again —
                            and either way it ends in the item page's review,
                            never in a save from here. */}
                        {state?.status === "ready" || (!state && awaitingReview) ? (
                          <button type="button" onClick={() => handleOpenReview(m)}>
                            Review
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleRescanOne(m)}
                            disabled={rescanRunning || state?.status === "scanning"}
                            className="disabled:opacity-40"
                          >
                            Rescan
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleRemoveManual(m)}
                          disabled={removingManual === m.manual_id}
                          className="disabled:opacity-40"
                          style={{ color: "var(--hh-clay)" }}
                        >
                          {removingManual === m.manual_id ? "Removing…" : "Remove"}
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {manualError && (
              <div role="alert" className="mb-3 text-xs font-medium" style={{ color: "var(--hh-clay)" }}>
                {manualError}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={rescanRunning || manuals.length === 0}
                onClick={handleRescanAll}
              >
                <RefreshCwIcon className="size-4 mr-1.5" />
                {rescanRunning ? "Scanning…" : "Rescan All"}
              </Button>
              {failedCount > 0 && !rescanRunning && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryFailed}
                >
                  Retry {failedCount} Failed
                </Button>
              )}
            </div>
          </CardContent>
        </SectionCard>
      )}

      {homeId && (
        <SectionCard id="data" className="mt-6 scroll-mt-6">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-1">
              Export Your Data
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Download all your items, tasks, knowledge, and manuals as a JSON file.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={handleExport}
            >
              {exporting ? (
                <Loader2Icon className="size-4 mr-1.5 animate-spin" />
              ) : (
                <DownloadIcon className="size-4 mr-1.5" />
              )}
              {exporting ? "Exporting…" : "Export All Data"}
            </Button>
            {exportError && <InlineError className="mt-3">{exportError}</InlineError>}
          </CardContent>
        </SectionCard>
      )}

      <SectionCard className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CompassIcon className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Feature Tour</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigate("/home")
                setTimeout(() => restartTour(), 300)
              }}
            >
              Restart Tour
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Take a guided walkthrough of Homehub&apos;s main features.
          </p>
        </CardContent>
      </SectionCard>

      {/* Report a problem.
          The subject and body are pre-filled with the build, platform and OS so
          a report arrives actionable instead of starting a round-trip for
          "which version are you on?". Testers on TestFlight also have Apple's
          own screenshot-feedback channel; this is for everyone else, and for
          anything that needs a reply. */}
      <SectionCard className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <LifeBuoyIcon className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Report a problem</h2>
            </div>
            <FeedbackButton label="Send report" />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Something broken or confusing? This opens an email with your app version filled in.
            You can also write to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>{" "}
            directly.
          </p>
        </CardContent>
      </SectionCard>

      <SectionCard id="reminders" className="mt-6 scroll-mt-6">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Your reminders</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Tell Homehub what you want to stay on top of, and it proposes a short list from the tasks it already knows. You approve every one; nothing else notifies.
          </p>
          <Link
            to="/reminders"
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: "var(--hh-surface2)", border: "1px solid var(--hh-line)" }}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px]" style={{ background: "var(--hh-teal-wash)" }}>
              <BellIcon className="size-[18px]" style={{ color: "var(--hh-teal)" }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold" style={{ color: "var(--hh-ink)" }}>Set up your reminders</span>
              <span className="mt-0.5 block text-[13px]" style={{ color: "var(--hh-sub)" }}>Describe it in your own words · edit any time</span>
            </span>
            <ChevronRightIcon className="size-[18px] shrink-0" style={{ color: "var(--hh-faint)" }} />
          </Link>
        </CardContent>
      </SectionCard>

      <SectionCard id="home-setup" className="mt-6 scroll-mt-6">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Your home</h2>
          <p className="text-sm text-muted-foreground mb-4">
            A few questions about the house — alarms, the water heater, pests, gutters — unlock the care no manual covers. You add each suggestion yourself.
          </p>
          <Link
            to="/home-setup"
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: "var(--hh-surface2)", border: "1px solid var(--hh-line)" }}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px]" style={{ background: "var(--hh-teal-wash)" }}>
              <HomeSetupIcon className="size-[18px]" style={{ color: "var(--hh-teal)" }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">Set up your home</span>
              <span className="block text-xs text-muted-foreground">Answer what you know; skip the rest</span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </CardContent>
      </SectionCard>

      {pushSupported && (
        <SectionCard id="notifications" className="mt-6 scroll-mt-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellIcon className="size-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
              </div>
              <Button
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
            <p className="text-sm text-muted-foreground mt-1">
              {pushSubscribed
                ? "You'll receive reminders for due and overdue tasks."
                : "Enable push notifications to get reminders when tasks are due."}
            </p>
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
                    <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground">
                      Delivery diagnostics
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => void loadPushDiag()}>
                      {pushDiag ? "Refresh" : "Check"}
                    </Button>
                  </div>
                  {pushDiag && (
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[12px]">
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
                  <p className="text-[13px]" style={{ color: "var(--hh-sub)" }}>Loading your notification settings…</p>
                )}
              </div>
            )}

            {/* Per-event preferences matrix (Push-only). Gates which kinds of
                push the user receives; the master control above gates whether
                this device can receive push at all. */}
            {user?.id && notifLoad === "ready" && (
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>
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
                      <span className="text-[9.5px] font-bold tracking-[0.3px]" style={{ color: "var(--hh-sub)" }}>
                        PUSH
                      </span>
                    </div>
                  </div>

                  {NOTIF_EVENT_ROWS.map((row, i) => {
                    const RowIcon = row.icon
                    const on = notifPrefs.events[row.key].push
                    const locked = !!row.locked
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
                          <div className="text-[15px] font-semibold" style={{ color: "var(--hh-ink)" }}>
                            {row.label}
                          </div>
                          <div className="mt-0.5 text-[13px]" style={{ color: "var(--hh-sub)" }}>
                            {row.sub}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleNotifEvent(row.key)}
                          disabled={locked}
                          aria-pressed={on}
                          aria-label={
                            locked
                              ? `${row.label} (always on)`
                              : `${row.label} push ${on ? "on" : "off"}`
                          }
                          className="flex size-10 shrink-0 items-center justify-center rounded-[11px] transition-colors"
                          style={{
                            border: `1.5px solid ${on ? "var(--hh-teal)" : "var(--hh-line2)"}`,
                            background: on ? "var(--hh-teal)" : "var(--hh-surface)",
                            cursor: locked ? "default" : "pointer",
                            opacity: locked ? 0.75 : 1,
                          }}
                        >
                          {on &&
                            (locked ? (
                              <LockIcon className="size-3.5 text-white" strokeWidth={2.4} />
                            ) : (
                              <CheckIcon className="size-[17px] text-white" strokeWidth={3} />
                            ))}
                        </button>
                      </div>
                    )
                  })}
                </div>
                {notifSaveErrorFor("events")}

                <p className="mx-1 mt-2.5 text-[13px]" style={{ color: "var(--hh-sub)" }}>
                  Safety &amp; recall notices are always delivered.
                </p>

                {/* Notification style — the breadth dial. */}
                <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>
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
                          style={{ border: `1.5px solid ${on ? "var(--hh-teal)" : "var(--hh-line2)"}`, background: on ? "var(--hh-teal)" : "var(--hh-surface)" }}
                        >
                          {on && <span className="size-2 rounded-full bg-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold" style={{ color: "var(--hh-ink)" }}>{opt.label}</span>
                          <span className="mt-0.5 block text-[13px]" style={{ color: "var(--hh-sub)" }}>{opt.sub}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {notifSaveErrorFor("mode")}
                <p className="mx-1 mt-2.5 text-[13px]" style={{ color: "var(--hh-sub)" }}>
                  Any single reminder can be turned off on its task — the bell. Lapsed safety checks are mentioned in every style.
                </p>

                {/* Weekly summary — the Sunday digest, at the user's hour. */}
                <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: "var(--hh-sub)" }}>
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
                      <div className="text-[15px] font-semibold" style={{ color: "var(--hh-ink)" }}>Your week at home</div>
                      <div className="mt-0.5 text-[13px]" style={{ color: "var(--hh-sub)" }}>
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
                      className="flex size-10 shrink-0 items-center justify-center rounded-[11px] transition-colors"
                      style={{
                        border: `1.5px solid ${notifPrefs.weekly_digest.enabled ? "var(--hh-teal)" : "var(--hh-line2)"}`,
                        background: notifPrefs.weekly_digest.enabled ? "var(--hh-teal)" : "var(--hh-surface)",
                      }}
                    >
                      {notifPrefs.weekly_digest.enabled && <CheckIcon className="size-[17px] text-white" strokeWidth={3} />}
                    </button>
                  </div>
                  {notifPrefs.weekly_digest.enabled && (
                    <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--hh-line)" }}>
                      <div className="min-w-0 flex-1 text-[15px] font-semibold" style={{ color: "var(--hh-ink)" }}>When</div>
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
                      <div className="text-[15px] font-semibold" style={{ color: "var(--hh-ink)" }}>
                        Reminder lead time
                      </div>
                      <div className="mt-0.5 text-[13px]" style={{ color: "var(--hh-sub)" }}>
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
                      <div className="text-[15px] font-semibold" style={{ color: "var(--hh-ink)" }}>
                        Quiet hours
                      </div>
                      <div className="mt-0.5 text-[13px]" style={{ color: "var(--hh-sub)" }}>
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
                      <span className="text-[13px]" style={{ color: "var(--hh-sub)" }}>
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
      )}

      {/* Real numbers from the real device — see BootDiagnostics for why. */}
      <div className="mt-6">
        <BootDiagnostics />
      </div>

      <SectionCard id="privacy" className="mt-6 scroll-mt-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Data &amp; Privacy</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Your data is stored in your private database. Homehub does not sell data or show ads.
          </p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">AI chat &amp; manual scanning</span> — Your
              questions and uploaded PDF manuals are sent to Anthropic (Claude) for answers and task
              extraction. Anthropic does not train on this data.
            </p>
            <p>
              <span className="font-medium text-foreground">Web search</span> — When you use "Search
              the web," your question and item name are sent to Brave Search.
            </p>
            <p>
              <span className="font-medium text-foreground">Photo recognition</span> — Uploaded
              appliance photos are sent to Google Cloud Vision for label detection.
            </p>
          </div>
        </CardContent>
      </SectionCard>

      {/* Admin/classifier tools are a power-user surface — hidden until the
          user reaches the Power level (progressive complexity). */}
      {homeId && level === "power" && <AdminToolsSection homeId={homeId} />}

      <SectionCard title="Account">
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="profile-name" className="text-sm font-medium">
              Display name
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="profile-name"
                value={profileNameDraft}
                onChange={(e) => {
                  setProfileNameDraft(e.target.value)
                  setProfileSaved(false)
                }}
                placeholder="Your name"
                disabled={profileLoading || profileSaving}
                className="sm:max-w-xs"
              />
              <Button
                onClick={handleSaveProfile}
                disabled={
                  profileLoading ||
                  profileSaving ||
                  profileNameDraft.trim() === profileName
                }
                className="sm:w-auto"
              >
                {profileSaving ? (
                  <>
                    <Loader2Icon className="size-4 mr-2 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
            {profileError && (
              <p className="text-sm text-destructive">{profileError}</p>
            )}
            {profileSaved && !profileError && (
              <p className="text-sm text-muted-foreground">Saved.</p>
            )}
          </div>
          {user?.email && (
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.email}</span>
            </p>
          )}
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full sm:w-auto"
          >
            {isSigningOut ? (
              <Loader2Icon className="size-4 mr-2 animate-spin" aria-hidden />
            ) : (
              <LogOutIcon className="size-4 mr-2" aria-hidden />
            )}
            {isSigningOut ? "Signing out…" : "Sign out"}
          </Button>
        </CardContent>
      </SectionCard>
      </div>
    </div>
  )
}
