/**
 * Cross-restart warm start for the pages that can paint from memory: Home,
 * Items and Tasks.
 *
 * SWR's cache is in-memory, so every cold launch (or WebView reload) throws away
 * the last result and re-runs its Firestore queries before anything renders —
 * the multi-second blank/skeleton page on reopen. We persist the last resolved
 * payload of each allowlisted key to localStorage and hand it back on the next
 * launch as SWR `fallback` data, so the page paints immediately and revalidates
 * behind it.
 *
 * This deliberately does NOT use a custom SWR cache `provider`. That was the
 * first implementation and it wedged Home permanently in development: SWRConfig
 * creates the provider during render but tears it down in a layout-effect
 * cleanup (`SWRGlobalState.delete(provider)`), and React StrictMode runs layout
 * effects mount → cleanup → mount. Because children's effects run before the
 * parent's, `useSWR` in Home re-subscribed and then SWRConfig re-initialized the
 * provider's registries underneath it — the fetch resolved with nobody listening,
 * so `isLoading` never flipped and Home showed its skeleton forever. (Production
 * was unaffected: StrictMode only double-invokes effects in dev.) `fallback` is
 * plain config with no lifecycle, so there is nothing to tear down.
 *
 * Scope stays narrow: allowlisted keys only, data only (never an error or
 * in-flight state). Cleared on sign-out so one user's home never lingers for the
 * next.
 */
import type { HomeItemsSnapshot } from "./homeItemsCache"
import type { WeekAgendaSnapshot } from "@/hooks/useWeekAgenda"

// The name predates Items and Tasks. Kept, so devices that already hold a warm
// Home keep it through this release.
const CACHE_KEY = "hh-swr-dashboard-cache"

/** Items page: `items:v1:<homeId>` → { items, rooms } (src/lib/homeItemsCache.ts). */
export const ITEMS_KEY_PREFIX = "items:v1:"
/** Tasks page: `week:v1:<homeId>` → { items, hiddenCleaning } (src/hooks/useWeekAgenda.ts). */
export const WEEK_KEY_PREFIX = "week:v1:"

/**
 * The keys a snapshot may be written under — and the ONLY keys ever read back.
 *
 * Items and Tasks carry their payload's VERSION in the prefix. When a payload's
 * shape changes, bump it: every snapshot of the old shape is then never read
 * again (and is dropped by the next write) instead of being handed to a page
 * that expects the new one. `dashboard:` predates versioning.
 */
const PERSISTED_PREFIXES = ["dashboard:", ITEMS_KEY_PREFIX, WEEK_KEY_PREFIX] as const

function isPersistedKey(key: string): boolean {
  return PERSISTED_PREFIXES.some((prefix) => key.startsWith(prefix))
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

/** Every element is an object whose `fields` are strings. */
function rowsWith(v: unknown, fields: readonly string[]): boolean {
  return Array.isArray(v) && v.every((row) => isRecord(row) && fields.every((f) => typeof row[f] === "string"))
}

/*
 * A persisted payload comes from outside this build — an older release wrote
 * it, or a write was cut short — so before SWR may render one, the fields the
 * pages index into are checked (ids and the names they lowercase, group and
 * sort by). A payload that fails is dropped and the page cold-starts; it is
 * never rendered. The version in the key covers deliberate shape changes; these
 * guards cover everything else.
 */

/** An Items snapshot: rows with an id and a display name, rooms with an id and a name. */
export function isHomeItemsSnapshot(v: unknown): v is HomeItemsSnapshot {
  return isRecord(v) && rowsWith(v.items, ["item_unit_id", "display_name"]) && rowsWith(v.rooms, ["room_id", "name"])
}

/** A Tasks snapshot: rows with an instance id, a title and a due date, plus the hidden-cleaning count. */
export function isWeekAgendaSnapshot(v: unknown): v is WeekAgendaSnapshot {
  return isRecord(v) && rowsWith(v.items, ["taskInstanceId", "title", "dueDate"]) && typeof v.hiddenCleaning === "number"
}

function hasPersistedShape(key: string, data: unknown): boolean {
  if (key.startsWith(ITEMS_KEY_PREFIX)) return isHomeItemsSnapshot(data)
  if (key.startsWith(WEEK_KEY_PREFIX)) return isWeekAgendaSnapshot(data)
  return true
}

export function clearPersistedSwrCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/**
 * The persisted snapshots as an SWR `fallback` map ({ [key]: data }). Read once
 * at module scope by App so the very first render already has data. Tolerates a
 * missing, corrupt, or legacy-shaped payload by leaving that entry out.
 */
export function readPersistedSwrFallback(): Record<string, unknown> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return {}
    const out: Record<string, unknown> = {}
    for (const entry of parsed as unknown[]) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue
      const key: string = entry[0]
      if (!isPersistedKey(key)) continue
      // The provider-era format stored SWR state objects ({ data }); unwrap those
      // so a Home cache written by that version still warms this one. Only
      // `dashboard:` keys existed then — a later payload that happens to carry a
      // `data` field must never be unwrapped.
      const value: unknown = entry[1]
      const data = key.startsWith("dashboard:") && isRecord(value) && "data" in value ? value.data : value
      if (data === undefined || !hasPersistedShape(key, data)) continue
      out[key] = data
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Record one resolved payload. Called on every successful fetch rather than on
 * `beforeunload`/`visibilitychange`: iOS can kill a backgrounded WebView without
 * firing either, which is exactly the reopen this is meant to speed up.
 */
export function persistSwrSnapshot(key: string, data: unknown): void {
  if (typeof window === "undefined") return
  if (!isPersistedKey(key) || data === undefined) return
  try {
    const current = readPersistedSwrFallback()
    current[key] = data
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.entries(current)))
  } catch {
    /* quota / serialization — non-fatal, we just lose the warm cache */
  }
}
