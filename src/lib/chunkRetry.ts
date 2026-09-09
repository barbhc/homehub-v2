/**
 * chunkRetry — recover from stale-asset failures OUTSIDE the route layer.
 *
 * `lazyWithRetry` already handles this for routes: after a deploy, a tab that
 * still holds the old index.html asks for asset hashes that no longer exist,
 * the import() rejects, and one hard reload fetches the new index.html.
 *
 * The manual viewer never went through that helper. It pulls its renderer,
 * pdf.js and the pdf.js worker in with bare dynamic imports, so a stale tab
 * showed "Couldn't render this page." and kept showing it until the user
 * happened to reload — on the iOS shell that can be days (owner report,
 * 2026-09-08, on the home-focused preview channel right after a redeploy).
 *
 * Two shapes of the same failure have to be caught:
 *  - the import itself rejecting. Firebase Hosting rewrites an unknown path to
 *    index.html, so a missing chunk arrives as HTML with a 200 and the browser
 *    refuses it as a module script ("Expected a JavaScript-or-Wasm module
 *    script but the server responded with a MIME type of text/html").
 *  - pdf.js failing to start its worker. The import of `pdf.worker.mjs?url`
 *    resolves to a URL string from the OLD build, so nothing rejects until
 *    pdf.js fetches it and reports "Setting up fake worker failed".
 *
 * A stale build cannot be repaired in place, so the only recovery is a reload,
 * and it must happen at most once per session per surface — a genuine runtime
 * failure (offline, a corrupt PDF, a real bug) must reach the caller's error
 * state instead of putting the app in a reload loop.
 */

const RELOAD_FLAG = "homehub:chunk-reloaded"

/**
 * Messages browsers and pdf.js use for "the asset I asked for isn't there any
 * more". Matched case-insensitively as substrings — the full text carries the
 * URL and varies per engine.
 */
const STALE_ASSET_MESSAGES = [
  "failed to fetch dynamically imported module", // Chrome
  "error loading dynamically imported module", // Firefox
  "importing a module script failed", // Safari
  "expected a javascript-or-wasm module script", // Chrome, HTML served for a chunk
  "is not a valid javascript mime type", // Firefox, same cause
  "failed to load module script", // older Chrome wording
  "setting up fake worker failed", // pdf.js, wrapping one of the above
]

/** True when the failure is "this build's assets are gone", not a runtime bug. */
export function isStaleChunkError(err: unknown): boolean {
  const text = (err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "")).toLowerCase()
  return STALE_ASSET_MESSAGES.some((m) => text.includes(m))
}

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === "1"
  } catch {
    // sessionStorage is unavailable (private mode, or storage blocked). Treat
    // that as "already retried" so we can never loop without a way to record it.
    return true
  }
}

function markReloaded(): boolean {
  try {
    sessionStorage.setItem(RELOAD_FLAG, "1")
    return true
  } catch {
    return false
  }
}

function clearReloaded(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/**
 * Runs a loader that pulls in lazily-imported assets. On a stale-asset failure
 * it forces one reload and stays pending, so the caller keeps its loading state
 * until the new page takes over. Every other failure is rethrown untouched.
 *
 * `reload` is injectable for tests only; production always reloads the window.
 */
export async function withChunkRetry<T>(
  load: () => Promise<T>,
  tag: string,
  reload: () => void = () => window.location.reload(),
): Promise<T> {
  try {
    const result = await load()
    // A good load means this session is on the current build again.
    clearReloaded()
    return result
  } catch (err) {
    if (!isStaleChunkError(err) || alreadyReloaded()) throw err
    if (!markReloaded()) throw err
    console.warn(`[chunkRetry] ${tag}: assets are from a replaced build, reloading once`, err)
    reload()
    // Never resolves: the reload swaps the page out from under us, and the
    // caller must not fall through to an error state in the meantime.
    return new Promise<T>(() => {})
  }
}
