import { getStorage, connectStorageEmulator } from "firebase/storage"
import { firebaseApp, USE_EMULATORS } from "./app"

export const storage = getStorage(firebaseApp)

if (USE_EMULATORS) {
  connectStorageEmulator(storage, "127.0.0.1", 9199)
}

/**
 * Synchronous public download URL for a storage object path. Relies on the
 * public-read Storage rules (mirroring v1's public Manuals bucket), so it needs
 * no async getDownloadURL/token — usable directly at render time. Points at the
 * emulator when VITE_USE_EMULATORS is set.
 */
export function storageDownloadUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const bucket = storage.app.options.storageBucket
  if (!bucket) return null
  const encoded = encodeURIComponent(path.replace(/^\//, ""))
  const host = USE_EMULATORS ? "http://127.0.0.1:9199" : "https://firebasestorage.googleapis.com"
  return `${host}/v0/b/${bucket}/o/${encoded}?alt=media`
}
