import { Capacitor } from "@capacitor/core"

/** True inside the native iOS/Android shell; false on the web. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/** Current platform: "ios" | "android" | "web". */
export function getNativePlatform(): string {
  return Capacitor.getPlatform()
}
