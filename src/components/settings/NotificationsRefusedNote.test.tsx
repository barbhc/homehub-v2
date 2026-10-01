/**
 * Settings → Notifications on a device that refused notifications — the page
 * the review's "Turn on in Settings" opens (owner, #228 review; HH-161 S5.2 as
 * amended). It says where the switch is, because the OS never asks twice.
 *
 * Pinned here rather than in the emulator walk: the e2e build carries no
 * web-push key, so its Settings renders no Notifications section at all.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
// The page's source as text (Vite's ?raw), for the wiring check at the end.
import settings from "../../pages/Settings.tsx?raw"

const device = vi.hoisted(() => ({ native: false, platform: "web", receive: "denied" }))
vi.mock("@/lib/native", () => ({
  isNativePlatform: () => device.native,
  getNativePlatform: () => device.platform,
}))
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: { checkPermissions: async () => ({ receive: device.receive }) },
}))

import { NotificationsRefusedNote } from "./NotificationsRefusedNote"

let webPermission: NotificationPermission = "denied"
function installWebNotification() {
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: Object.defineProperty(function Notification() {}, "permission", { configurable: true, get: () => webPermission }),
  })
}

afterEach(() => {
  Reflect.deleteProperty(window, "Notification")
  Object.assign(device, { native: false, platform: "web", receive: "denied" })
})

describe("Settings names where the switch is, once a device has refused", () => {
  it("the iPhone app: the approved sentence, word for word", async () => {
    Object.assign(device, { native: true, platform: "ios", receive: "denied" })
    render(<NotificationsRefusedNote />)
    expect(await screen.findByTestId("notifications-refused")).toHaveTextContent(
      "Notifications are off for Homehub on this phone. Open iPhone Settings → Homehub → Notifications.",
    )
  })

  it("a browser that refused: the browser's settings, never a phone menu it does not have", () => {
    installWebNotification()
    webPermission = "denied"
    render(<NotificationsRefusedNote />)
    const note = screen.getByTestId("notifications-refused")
    expect(note).toHaveTextContent(/in this browser/)
    expect(note).not.toHaveTextContent(/iPhone/)
  })

  it("says nothing while notifications are allowed or not yet asked (not rendered)", async () => {
    installWebNotification()
    for (const p of ["granted", "default"] as const) {
      webPermission = p
      const { unmount } = render(<NotificationsRefusedNote />)
      expect(screen.queryByTestId("notifications-refused")).toBeNull()
      unmount()
    }
    Reflect.deleteProperty(window, "Notification")
    Object.assign(device, { native: true, platform: "ios", receive: "granted" })
    render(<NotificationsRefusedNote />)
    await act(async () => {})
    expect(screen.queryByTestId("notifications-refused")).toBeNull()
  })

  it("sits in Settings' Notifications section — where 'Turn on in Settings' lands", () => {
    const start = settings.indexOf('<SectionCard id="notifications"')
    expect(start).toBeGreaterThan(-1)
    const section = settings.slice(start, settings.indexOf("</SectionCard>", start))
    expect(section).toContain("<NotificationsRefusedNote />")
  })
})
