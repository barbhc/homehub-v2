import { Camera, CameraResultType, CameraSource } from "@capacitor/camera"

export { isNativePlatform } from "./native"

export type NativePhotoResult =
  | { kind: "photo"; file: File }
  | { kind: "cancelled" }
  | { kind: "error"; reason: "permission" | "other"; message: string }

/**
 * Capture a photo with the native camera and return it as a File.
 *
 * The image comes back BASE64 OVER THE BRIDGE, deliberately not as a file URL.
 * The previous implementation asked for a Uri and then fetch()ed it — which
 * works in a bundled build, where page and file share an origin, and fails in
 * REMOTE-URL mode, where the page is the web host and the file is
 * capacitor://localhost: a cross-origin fetch, denied AFTER the user had taken
 * a perfectly good photo. That produced the tester's exact report, twice: the
 * camera opens, the shot is taken, and then an error appears and a second
 * camera opens to redo it. Base64 has no origin, so the whole failure class is
 * gone, at the cost of a larger bridge message — fine at quality 80 for a
 * nameplate shot.
 *
 * Failures are CLASSIFIED, because they need different answers: a denied
 * permission needs the user (only they can flip the iOS setting), while
 * everything else is our problem and should be handled without ceremony.
 */
export async function captureNativePhoto(): Promise<NativePhotoResult> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Base64,
      quality: 80,
      correctOrientation: true,
    })
    if (!photo.base64String) return { kind: "error", reason: "other", message: "Camera returned no image." }
    const format = photo.format || "jpeg"
    return { kind: "photo", file: base64ToFile(photo.base64String, `nameplate.${format}`, `image/${format}`) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Capacitor's cancel message is stable ("User cancelled photos app").
    if (/cancel/i.test(message)) return { kind: "cancelled" }
    return { kind: "error", reason: classifyCameraFailure(message), message }
  }
}

/**
 * Pick an existing photo from the library — same Base64-over-the-bridge path
 * as capture, same failure classification. iOS shows the system photo picker,
 * which needs no permission grant, so the "permission" branch is rare here.
 */
export async function pickNativeLibraryPhoto(): Promise<NativePhotoResult> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Base64,
      quality: 80,
      correctOrientation: true,
    })
    if (!photo.base64String) return { kind: "error", reason: "other", message: "Picker returned no image." }
    const format = photo.format || "jpeg"
    return { kind: "photo", file: base64ToFile(photo.base64String, `photo.${format}`, `image/${format}`) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/cancel/i.test(message)) return { kind: "cancelled" }
    return { kind: "error", reason: classifyCameraFailure(message), message }
  }
}

/** Permission denials need the user; everything else is ours to absorb. */
export function classifyCameraFailure(message: string): "permission" | "other" {
  return /denied|permission|not authorized|restricted/i.test(message) ? "permission" : "other"
}

/** Decode without fetch(data:) — synchronous, and no URL layer to refuse it. */
export function base64ToFile(b64: string, name: string, type: string): File {
  const bytes = atob(b64)
  const buf = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
  return new File([buf], name, { type })
}
