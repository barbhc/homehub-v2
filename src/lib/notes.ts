/**
 * Notes — what the household would otherwise have to remember, at three
 * scopes: the house, a room, an item (design/spares-and-notes.md §2).
 *
 * A note is just text. Nothing here adds fields: "Paint" is an IDEA that
 * starts a note ("Paint: ") with a one-line hint, never a paint form. The
 * owner, 2026-09-27: "Don't make it too specific like a field for paints, but
 * give suggestions."
 */
import type { CareNote, ItemCategory, ItemUnit } from "@/integrations/types"
import { splitNote } from "../../shared/notes/splitNote"

export type NoteScope = "home" | "room" | "item_unit"

/** A chip that STARTS a note — the seed goes in the text, the hint under it. */
export type NoteIdea = { label: string; seed: string; hint: string }

const idea = (label: string, hint: string): NoteIdea => ({ label, seed: `${label}: `, hint })

export const HOUSE_IDEAS: NoteIdea[] = [
  idea("Water shutoff", "Where the main valve is, and which way closes it."),
  idea("Breaker panel", "Where it is, and which breakers matter."),
  idea("Paint colors", "Brand, color name or code, finish — and where the leftover is."),
  idea("Router & modem", "Where they are, and what fixes the Wi-Fi."),
  idea("Fire extinguisher", "Where each one is, and when it expires."),
  idea("Trash & recycling", "Where it goes, and which days."),
  idea("Measurements", "Rooms, doorways, the spot a new sofa has to fit."),
]

export const ROOM_IDEAS: NoteIdea[] = [
  idea("Paint", "Brand, color name or code, finish — and where the leftover is."),
  idea("Light bulbs", "Type, base, color temperature, wattage — and where the spares are."),
  idea("Breaker", "Which breaker runs this room."),
  idea("Window & blind sizes", "Width × height, and inside or outside mount."),
  idea("Flooring", "What it is, brand and color, and where spare boards or tiles are."),
  idea("Measurements", "Wall lengths, ceiling height, the space for furniture."),
]

const ITEM_COMMON: NoteIdea[] = [
  idea("Who services it", "The company or person, and when they usually come."),
  idea("Quirks & noises", "What it does that's normal — and what isn't."),
]

const ITEM_BY_CATEGORY: Partial<Record<ItemCategory, NoteIdea[]>> = {
  system: [
    idea("How to reach the filter", "Which panel, any tools, anything tricky."),
    idea("Thermostat settings", "The settings you use, and any schedule."),
    idea("Shutoff", "Where its shutoff or breaker is."),
  ],
  major_appliance: [
    idea("Settings you use", "The cycle or settings that work best."),
    idea("Shutoff valve", "Where its water or gas shutoff is."),
  ],
  small_appliance: [idea("Settings you use", "The settings that work best.")],
  fixture: [
    idea("Shutoff valve", "Where its shutoff is."),
    idea("Replacement parts", "Model or part numbers for cartridges, bulbs or trim."),
  ],
  structure: [idea("Materials", "What it's made of, brand and color.")],
  outdoor: [idea("Season routine", "What to do before winter, and after.")],
  smart_home: [idea("App & account", "Which app runs it, and whose account. Never a password.")],
  media: [idea("Inputs & remotes", "Which input is which, and where the remotes live.")],
  furniture: [idea("Care", "How to clean it, and what to avoid.")],
}

/**
 * The ideas worth offering here: by scope (and, for an item, its category),
 * minus any whose note already exists — once "Water shutoff" is written down,
 * suggesting it again is noise.
 */
export function ideasFor(
  scope: NoteScope,
  category: string | null | undefined,
  notes: Pick<CareNote, "content" | "title">[],
): NoteIdea[] {
  const base =
    scope === "home" ? HOUSE_IDEAS
    : scope === "room" ? ROOM_IDEAS
    : [...(ITEM_BY_CATEGORY[category as ItemCategory] ?? []), ...ITEM_COMMON]
  const taken = new Set(
    notes.map((n) => (splitNote(n.content, n.title).heading ?? "").toLowerCase()).filter(Boolean),
  )
  return base.filter((i) => !taken.has(i.label.toLowerCase()))
}

// The heading rule lives in shared/ so Ask (firebase/functions) reads a note
// exactly the way these rows do.
export { splitNote } from "../../shared/notes/splitNote"

/**
 * Display only: the line under a heading starts with a capital ("Paint:
 * hall closet" → "Hall closet"). The stored note stays exactly as typed.
 */
export function displayBody(body: string, hasHeading: boolean): string {
  // Only a plain lowercase first word: "iPhone" or "eBay" keep their own casing.
  return hasHeading && /^[a-z][a-z'-]*(?=[\s,.;:!?]|$)/.test(body) ? body[0].toUpperCase() + body.slice(1) : body
}

/** Nothing worth saving yet: empty, or only an idea's seed ("Paint:"). */
export function isBlankNote(text: string): boolean {
  const t = text.trim()
  return t === "" || /^[^:\n]{1,40}:$/.test(t)
}

/** Lower-cases a leading Capitalized word ("Breaker panel" → "breaker panel"), never an acronym ("LG remote"). */
function softLower(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s
}

/** "Water shutoff, breaker panel and 2 more" — the House notes card's line. */
export function notesSummary(notes: Pick<CareNote, "content" | "title">[]): string | null {
  const labels = notes.map((n) => {
    const { heading, body } = splitNote(n.content, n.title)
    return heading ?? body.split(/\s+/).slice(0, 4).join(" ")
  }).filter(Boolean)
  if (labels.length === 0) return null
  const [a, b] = labels
  if (labels.length === 1) return a
  if (labels.length === 2) return `${a} and ${softLower(b)}`
  return `${a}, ${softLower(b)} and ${labels.length - 2} more`
}

/** Room notes counted by room, for the room headings on Items. */
export function roomNoteCounts(notes: Pick<CareNote, "scope" | "room_id">[] | null): Map<string, number> {
  const counts = new Map<string, number>()
  for (const n of notes ?? []) {
    if (n.scope === "room" && n.room_id) counts.set(n.room_id, (counts.get(n.room_id) ?? 0) + 1)
  }
  return counts
}

// ── The legacy item note ──────────────────────────────────────────────────────
// Items once carried ONE free-text `notes` field, edited by a card that was
// later orphaned — 4 of 17 items in the owner's home still hold text there
// (measured 2026-09-27). It shows as an ordinary note with a fixed id; editing
// moves it into careNotes and clears the field, deleting clears it. Nothing is
// written just by looking.

export const LEGACY_NOTE_PREFIX = "legacy-"
export const isLegacyNote = (noteId: string) => noteId.startsWith(LEGACY_NOTE_PREFIX)

export function legacyItemNote(
  item: Pick<ItemUnit, "item_unit_id" | "home_id" | "notes" | "created_at" | "updated_at">,
): CareNote | null {
  const text = item.notes?.trim()
  if (!text) return null
  return {
    note_id: `${LEGACY_NOTE_PREFIX}${item.item_unit_id}`,
    home_id: item.home_id,
    room_id: null,
    item_unit_id: item.item_unit_id,
    scope: "item_unit",
    category: null,
    chunk_type: "care",
    title: null,
    content: text,
    source: "user",
    source_url: null,
    task_template_id: null,
    created_at: item.created_at ?? "",
    updated_at: item.updated_at ?? item.created_at ?? "",
    deleted_at: null,
  }
}

/** "Sep 12", or "Sep 12, 2025" outside this year; "" for a missing date. */
export function noteDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  })
}
