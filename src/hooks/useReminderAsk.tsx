/**
 * The reminder ask after a Mark done (design/day-one-home.md, release C).
 *
 * New homes never saw Home's "Turn on notifications" nudge (it gives way to
 * the first-minute cards), so nothing could ever bring them back. And an
 * abstract nudge is the wrong moment anyway: iOS shows its permission dialog
 * ONCE per install. The right moment is right after someone finishes an
 * Essential task — its next one is coming, and the sheet can show the exact
 * notification they would get, with the date it would arrive.
 *
 * Once per device: Turn on → the system prompt; Not now (or closing the
 * sheet) → never asked again here. Settings keeps the switch either way.
 */
import { useCallback, useState } from "react"
import { BellRingIcon, Loader2Icon } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { InlineError } from "@/components/layout/LoadStates"
import { isPushSupported, isSubscribed, subscribeToPush } from "@/lib/pushNotifications"
import { isNativePlatform, isNativePushRegistered, isNativePushTurnedOff, nativePushPermission, registerNativePush } from "@/lib/nativePush"
import { sampleReminder, shouldAskAfterDone, WHAT_NOTIFICATIONS_SEND } from "@/lib/notifyGate"
import { receiptDate } from "@/components/home/tasks/shared"
import { track } from "@/lib/analytics"

const declinedKey = (userId: string) => `homehub:reminder_ask_declined:${userId}`
/** Home's own nudge, declined for this home: the same answer, given earlier. */
const nudgeDismissedKey = (homeId: string) => `homehub:push_nudge_dismissed:${homeId}`

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1"
  } catch {
    // Blocked storage: treat as never declined; the OS state still gates the ask.
    return false
  }
}
function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1")
  } catch (e) {
    // Only the memory of the answer is lost: the sheet may be offered once more here.
    console.warn(`[reminder ask] could not remember ${key}:`, e instanceof Error ? e.message : e)
  }
}

/** What the platform says right now: may we ask, and is it on already? */
async function platformState(): Promise<{ permission: "granted" | "denied" | "prompt" | "unsupported"; alreadyOn: boolean; turnedOffHere: boolean }> {
  if (isNativePlatform()) {
    const turnedOffHere = isNativePushTurnedOff()
    return { permission: await nativePushPermission(), alreadyOn: await isNativePushRegistered(), turnedOffHere }
  }
  if (!isPushSupported() || typeof Notification === "undefined") return { permission: "unsupported", alreadyOn: false, turnedOffHere: false }
  const p = Notification.permission
  return { permission: p === "default" ? "prompt" : p, alreadyOn: await isSubscribed(), turnedOffHere: false }
}

export interface DoneTask {
  title: string
  essential: boolean
  /** The item it belongs to, when it has one. */
  itemName: string | null
  /** The next due date the receipt named, if it did. */
  nextDue: string | null
}

type Stage = "ask" | "turning-on" | "on"

/** Home calls `offer` after a Done is SAVED; render `sheet` once. */
export function useReminderAsk(userId: string | null, homeId: string | null) {
  const [task, setTask] = useState<DoneTask | null>(null)
  const [stage, setStage] = useState<Stage>("ask")
  const [error, setError] = useState<string | null>(null)

  const offer = useCallback(async (t: DoneTask) => {
    if (!userId || !homeId) return
    const declinedHere = readFlag(declinedKey(userId)) || readFlag(nudgeDismissedKey(homeId))
    if (declinedHere || !t.essential) return
    const p = await platformState()
    if (!shouldAskAfterDone({ essential: t.essential, ...p, declinedHere })) return
    setStage("ask")
    setError(null)
    setTask(t)
    track("reminder_ask_shown", {})
  }, [userId, homeId])

  const close = useCallback((answer: "not_now" | "on" | "denied") => {
    if (userId) writeFlag(declinedKey(userId))
    if (answer === "not_now") track("reminder_ask_answered", { answer })
    setTask(null)
  }, [userId])

  const turnOn = useCallback(async () => {
    if (!userId) return
    setStage("turning-on")
    setError(null)
    const res = isNativePlatform() ? await registerNativePush(userId) : await subscribeToPush(userId)
    if (res.success) {
      track("reminder_ask_answered", { answer: "on" })
      setStage("on")
      window.setTimeout(() => close("on"), 1600)
      return
    }
    if (res.error === "Permission denied") {
      // A final answer from the OS: the sheet has nothing left to offer.
      track("reminder_ask_answered", { answer: "denied" })
      close("denied")
      return
    }
    track("reminder_ask_answered", { answer: "error" })
    setError(res.error ?? "Couldn't turn on reminders.")
    setStage("ask")
  }, [userId, close])

  const when = task?.nextDue ? `on ${receiptDate(task.nextDue)}, the day it's due` : "on the day it's due"

  const sheet = (
    <Sheet open={task !== null} onOpenChange={(open) => { if (!open && stage !== "turning-on") close("not_now") }}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto px-5 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:max-w-md" data-testid="reminder-ask">
        <SheetHeader className="px-0 pt-0">
          <SheetTitle className="text-[1.0625rem] font-extrabold tracking-[-0.015em]">
            {stage === "on" ? "Reminders are on" : "Want a heads-up next time?"}
          </SheetTitle>
          <SheetDescription className="text-[0.875rem]" style={{ color: "var(--hh-sub)" }}>
            {stage === "on" ? "You can change what you get in Settings." : `We'd send this ${when}.`}
          </SheetDescription>
        </SheetHeader>

        {task && stage !== "on" && (
          <>
            {/* A preview of the real thing, not an illustration of a bell. */}
            <div className="mt-3 flex items-start gap-3 rounded-2xl border px-3.5 py-3 shadow-[0_2px_8px_rgba(15,23,42,0.08)]" style={{ background: "var(--hh-surface)", borderColor: "var(--hh-line)" }} aria-label="Sample notification">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px]" style={{ background: "var(--hh-mark)" }}>
                <BellRingIcon className="size-[18px] text-white" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2 text-[0.75rem]" style={{ color: "var(--hh-sub)" }}>
                  <span className="font-semibold uppercase tracking-[0.4px]">Homehub</span>
                  <span>now</span>
                </span>
                {/* The morning push's own words for one task (composeMorning in
                    firebase/functions/src/push/lanes.ts), so the preview is
                    what would actually arrive. */}
                <span className="block text-[0.9375rem] font-semibold leading-snug" style={{ color: "var(--hh-ink)" }}>{sampleReminder(task).title}</span>
                <span className="block text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>{sampleReminder(task).body}</span>
              </span>
            </div>

            <p className="mt-4 text-[0.8125rem] font-semibold" style={{ color: "var(--hh-ink)" }}>Turning them on sends:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[0.8125rem]" style={{ color: "var(--hh-sub)" }}>
              {WHAT_NOTIFICATIONS_SEND.map((line) => <li key={line}>{line}</li>)}
            </ul>

            {error && <InlineError className="mt-3">{error}</InlineError>}

            <button
              type="button"
              onClick={() => void turnOn()}
              disabled={stage === "turning-on"}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-bold disabled:opacity-70"
              style={{ background: "var(--hh-teal-fill)", color: "var(--hh-on-fill)" }}
            >
              {stage === "turning-on" && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
              Turn on reminders
            </button>
            <button
              type="button"
              onClick={() => close("not_now")}
              disabled={stage === "turning-on"}
              className="mt-1 min-h-11 w-full text-[0.875rem] font-semibold"
              style={{ color: "var(--hh-sub)" }}
            >
              Not now
            </button>
          </>
        )}
      </SheetContent>
    </Sheet>
  )

  return { offer, sheet }
}
