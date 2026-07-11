import { Camera, CameraResultType, CameraSource } from "@capacitor/camera"

export { isNativePlatform } from "./native"

/**
 * Capture a photo with the native camera (iOS/Android) and return it as a File
 * so it flows through the existing OCR pipeline unchanged. Returns null if the
 * user cancels. On the web, callers should fall back to the `<input>` element —
 * this is only used when `isNativePlatform()` is true.
 *
 * Requires Info.plist `NSCameraUsageDescription` (+ photo-library strings).
 */
export async function captureNativePhoto(): Promise<File | null> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 80,
      correctOrientation: true,
    })
    if (!photo.webPath) return null
    const blob = await fetch(photo.webPath).then((r) => r.blob())
    const ext = photo.format || "jpeg"
    return new File([blob], `nameplate.${ext}`, { type: blob.type || `image/${ext}` })
  } catch {
    // Capacitor throws on user cancellation (and on a denied permission, after
    // iOS has already shown its own Settings prompt). Treat as "no photo".
    return null
  }
}
