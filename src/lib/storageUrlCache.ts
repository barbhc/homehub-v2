/**
 * Remembering resolved Storage URLs across sessions.
 *
 * Item photos are stored as object PATHS, so painting one costs two sequential
 * round-trips: getDownloadURL() to turn the path into a token URL, and only
 * then the image fetch. Nothing can render until the first completes, which is
 * why a photo you have already looked at still arrives late every time you open
 * the app — the in-memory SWR cache dies with the tab.
 *
 * Token URLs are stable until the token is revoked, so they are worth keeping.
 * This is a cache, not a source of truth: a miss costs exactly today's
 * behaviour, and a stale entry is dropped the moment an <img> fails on it.
 */
const KEY = "homehub:storage-urls"
/** Bounded so a long-lived install can't grow this without limit. Oldest out
 *  first; a trimmed entry just costs one resolve next time it is needed. */
const MAX_ENTRIES = 200

type CacheShape = Record<string, string>

function read(): CacheShape {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    // Anything unexpected in storage is treated as absent rather than trusted —
    // this feeds <img src>, so it must be a plain string map or nothing.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const out: CacheShape = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function write(cache: CacheShape): void {
  try {
    const keys = Object.keys(cache)
    const trimmed =
      keys.length <= MAX_ENTRIES
        ? cache
        : Object.fromEntries(keys.slice(keys.length - MAX_ENTRIES).map((k) => [k, cache[k]]))
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    // Private mode, or the quota is full. Losing the cache is not an error.
  }
}

export function getCachedStorageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return read()[path] ?? null
}

export function setCachedStorageUrl(path: string, url: string): void {
  const cache = read()
  if (cache[path] === url) return
  // Re-insert at the end so recently used entries survive trimming.
  delete cache[path]
  cache[path] = url
  write(cache)
}

/** Called when an <img> fails on a cached URL — the token was revoked, the
 *  object moved, or the entry was never good. Next read resolves afresh. */
export function invalidateCachedStorageUrl(path: string | null | undefined): void {
  if (!path) return
  const cache = read()
  if (!(path in cache)) return
  delete cache[path]
  write(cache)
}
