import { Camera, CameraResultType, CameraSource } from "@capacitor/camera"

export { isNativePlatform } from "./native"

export type NativePhotoResult =
  | { kind: "photo"; file: File }
  | { kind: "cancelled" }
  | { kind: "error"; message: string }

/**
 * Capture a photo with the native camera (iOS/Android) and return it as a File
 * so it flows through the existing OCR pipeline unchanged.
 *
 * Cancel and failure are DIFFERENT results: Capacitor also throws when the
 * camera permission is denied or the native plugin isn't registered in the
 * installed binary (stale build) — collapsing those into "no photo" made the
 * whole feature silently dead in the iOS shell. Callers fall back to the
 * in-page `<input capture>` (which WKWebView supports natively) on "error".
 *
 * Requires Info.plist `NSCameraUsageDescription` (+ photo-library strings).
 */
export async function captureNativePhoto(): Promise<NativePhotoResult> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 80,
      correctOrientation: true,
    })
    if (!photo.webPath) return { kind: "error", message: "Camera returned no image." }
    const blob = await fetch(photo.webPath).then((r) => r.blob())
    const ext = photo.format || "jpeg"
    return {
      kind: "photo",
      file: new File([blob], `nameplate.${ext}`, { type: blob.type || `image/${ext}` }),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Capacitor's cancel message is stable across platforms ("User cancelled
    // photos app"); anything else is a real failure worth surfacing.
    if (/cancel/i.test(message)) return { kind: "cancelled" }
    return { kind: "error", message }
  }
}
