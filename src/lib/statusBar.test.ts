/**
 * The iOS status bar follows the app's EFFECTIVE appearance (Apple-polish
 * phase 3). The failure it exists to prevent: Settings › Appearance set to Dark
 * on a phone in Light mode, and the clock drawn in dark text on the dark page —
 * or the reverse. So the full matrix is pinned: every in-app choice against
 * both phone appearances, through applyAppearance, the one function the
 * Appearance picker calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const env = vi.hoisted(() => ({
  native: true,
  available: true,
  osDark: false,
  setStyle: vi.fn<(opts: { style: string }) => Promise<void>>(async () => {}),
}))

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => env.native,
    isPluginAvailable: () => env.available,
    getPlatform: () => (env.native ? "ios" : "web"),
  },
}))
vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: (opts: { style: string }) => env.setStyle(opts) },
  // Capacitor's real values: named for the BACKGROUND, not the text.
  Style: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" },
}))

import { applyAppearance, type Appearance } from "./theme"
import { resetStatusBarSync, statusBarStyleFor, syncStatusBar, syncStatusBarToDocument } from "./statusBar"
import { resetNativeLogOnce } from "./native"

const originalMatchMedia = window.matchMedia
beforeEach(() => {
  env.native = true
  env.available = true
  env.osDark = false
  env.setStyle.mockReset()
  env.setStyle.mockImplementation(async () => {})
  resetStatusBarSync()
  resetNativeLogOnce()
  document.documentElement.classList.remove("dark")
  window.matchMedia = ((query: string) => ({
    matches: env.osDark && query === "(prefers-color-scheme: dark)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
})
afterEach(() => {
  window.matchMedia = originalMatchMedia
  document.documentElement.classList.remove("dark")
  vi.restoreAllMocks()
})

describe("statusBarStyleFor", () => {
  it("light text on a dark page, dark text on a light page", () => {
    expect(statusBarStyleFor(true)).toBe("DARK")
    expect(statusBarStyleFor(false)).toBe("LIGHT")
  })
})

describe("in-app Appearance × phone appearance", () => {
  const matrix: { choice: Appearance; osDark: boolean; page: "dark" | "light"; style: "DARK" | "LIGHT" }[] = [
    { choice: "system", osDark: false, page: "light", style: "LIGHT" },
    { choice: "system", osDark: true, page: "dark", style: "DARK" },
    { choice: "light", osDark: false, page: "light", style: "LIGHT" },
    { choice: "light", osDark: true, page: "light", style: "LIGHT" }, // the case iOS alone gets wrong
    { choice: "dark", osDark: false, page: "dark", style: "DARK" }, // and this one
    { choice: "dark", osDark: true, page: "dark", style: "DARK" },
  ]
  for (const { choice, osDark, page, style } of matrix) {
    it(`${choice} on a ${osDark ? "dark" : "light"} phone → ${page} page, ${style} status bar`, () => {
      env.osDark = osDark
      applyAppearance(choice)
      expect(document.documentElement.classList.contains("dark")).toBe(page === "dark")
      expect(env.setStyle).toHaveBeenCalledTimes(1)
      expect(env.setStyle).toHaveBeenCalledWith({ style })
    })
  }

  it("follows a change of choice, and skips repeats", () => {
    applyAppearance("dark")
    applyAppearance("dark")
    applyAppearance("light")
    expect(env.setStyle.mock.calls.map((c) => c[0].style)).toEqual(["DARK", "LIGHT"])
  })
})

describe("boot sync", () => {
  it("reads the class the pre-paint script set", () => {
    document.documentElement.classList.add("dark")
    syncStatusBarToDocument()
    expect(env.setStyle).toHaveBeenCalledWith({ style: "DARK" })
  })
})

describe("where it must stay silent", () => {
  it("does nothing in a browser", () => {
    env.native = false
    applyAppearance("dark")
    expect(env.setStyle).not.toHaveBeenCalled()
    // ...and the page itself still switches.
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("does nothing on a shell without the plugin", () => {
    env.available = false
    vi.spyOn(console, "info").mockImplementation(() => {})
    applyAppearance("dark")
    expect(env.setStyle).not.toHaveBeenCalled()
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("never throws when the bridge refuses, and retries on the next sync", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    env.setStyle.mockImplementationOnce(async () => {
      throw new Error("UNIMPLEMENTED")
    })
    expect(() => syncStatusBar(true)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(warn).toHaveBeenCalledTimes(1)
    syncStatusBar(true)
    expect(env.setStyle).toHaveBeenCalledTimes(2)
  })
})
