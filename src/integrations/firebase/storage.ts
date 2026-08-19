import { getStorage, connectStorageEmulator, ref, getDownloadURL } from "firebase/storage"
import { firebaseApp, USE_EMULATORS, EMULATOR_PORTS } from "./app"

export const storage = getStorage(firebaseApp)

if (USE_EMULATORS) {
  connectStorageEmulator(storage, "127.0.0.1", EMULATOR_PORTS.storage)
}

/** Matches a Firebase Storage download URL (prod host or the local emulator). */
// Built from the configured port so an alt-port emulator run still resolves
// its own download URLs (the literal 9199 silently stopped matching).
const STORAGE_URL_RE = new RegExp(
  `^(?:https://firebasestorage\\.googleapis\\.com|http://127\\.0\\.0\\.1:${EMULATOR_PORTS.storage})/v0/b/([^/]+)/o/([^?]+)`,
)

/**
 * Extract the object path from a Firebase Storage download URL pointing at THIS
 * app's bucket. Returns null for external URLs (and other buckets).
 */
export function storagePathFromUrl(url: string): string | null {
  const m = url.match(STORAGE_URL_RE)
  if (!m) return null
  if (m[1] !== storage.app.options.storageBucket) return null
  return decodeURIComponent(m[2])
}

/**
 * Resolve a Storage object path — or a legacy tokenless download URL persisted
 * before the public-read rules were closed (launch-readiness P0) — to a
 * token-bearing download URL via getDownloadURL. Token URLs work in plain
 * <img>/<a>/fetch (which send no auth header), regardless of Storage rules.
 * External non-Storage URLs and URLs that already carry a token pass through.
 */
export async function resolveStorageUrl(pathOrUrl: string | null | undefined): Promise<string | null> {
  if (!pathOrUrl) return null
  if (/^https?:\/\//.test(pathOrUrl)) {
    if (new URL(pathOrUrl).searchParams.has("token")) return pathOrUrl
    const path = storagePathFromUrl(pathOrUrl)
    if (!path) return pathOrUrl // external URL — not ours to resolve
    return getDownloadURL(ref(storage, path))
  }
  return getDownloadURL(ref(storage, pathOrUrl))
}
