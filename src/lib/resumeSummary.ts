import type { WizardSession } from "@/lib/wizardSession"

/**
 * What the "you have an incomplete setup" prompt should actually say.
 *
 * HH-113 (owner): "When I am reminded that I have incomplete steps for an item
 * that was added earlier, it would be good to give more context on what this
 * item is and what's missing."
 *
 * The screen said "You have an incomplete setup" while holding the item's name,
 * brand, model, the step it stopped on, whether a manual is attached and when it
 * started. Withholding all of that makes *Start fresh* a guess about what you
 * are throwing away — which is the one button on the screen you cannot undo.
 *
 * Pure, so the sentences can be pinned without rendering anything.
 */

export interface ResumeSummary {
  /** What to call it: the typed name, else brand + model, else a safe generic. */
  title: string
  /** The single thing standing between this item and being useful. */
  missing: string
  /** "just now" / "20 minutes ago" / "yesterday". Empty when unknown. */
  when: string
}

/** Whole minutes between two ISO instants; null if either is unusable. */
function minutesSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  const mins = Math.floor((nowMs - then) / 60_000)
  return mins < 0 ? 0 : mins
}

/** Deliberately coarse — the point is recognition, not precision. */
export function describeWhen(iso: string | null | undefined, nowMs: number): string {
  const mins = minutesSince(iso, nowMs)
  if (mins === null) return ""
  if (mins < 2) return "just now"
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  return `${days} days ago`
}

export function resumeSummary(session: WizardSession, nowMs: number): ResumeSummary {
  const name = (session.itemName ?? "").trim()
  const brandModel = [session.brand ?? "", session.model ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
  // "Item" is what composeItemName falls back to, so a session saved before
  // anything was known reads as an unnamed thing rather than as a real name.
  const title = name && name !== "Item" ? name : brandModel || "an item you started adding"

  // Say the ONE thing that is missing, in the order the flow would ask for it.
  // The manual comes first because an item without one has no upkeep at all,
  // which is most of what this product is for.
  const missing = !session.hasManual
    ? "Its manual isn't attached yet — that's where the upkeep comes from."
    : !session.hasTasks
      ? "Its manual is attached, but nothing has been scanned from it yet."
      : "Its upkeep is waiting to be reviewed."

  return { title, missing, when: describeWhen(session.createdAt, nowMs) }
}
