/**
 * Haptics (Apple-polish phase 3). The owner asked for two moments only — done/
 * snoozed, and a failed save — and the web bundle reaches every installed shell
 * the moment hosting deploys, including TestFlight builds with no Haptics
 * plugin. So what is pinned here is mostly what must NOT happen: no call in a
 * browser, no call (and one log line) on a shell without the plugin, and never
 * a throw into the save path that called it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

const env = vi.hoisted(() => ({
  native: false,
  available: true,
  notification: vi.fn<(opts: { type: string }) => Promise<void>>(async () => {}),
}))

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => env.native,
    isPluginAvailable: () => env.available,
    getPlatform: () => (env.native ? "ios" : "web"),
  },
}))
vi.mock("@capacitor/haptics", () => ({
  Haptics: { notification: (opts: { type: string }) => env.notification(opts) },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}))

import { hapticError, hapticSuccess, useSaveFailedHaptic } from "./haptics"
import { resetNativeLogOnce } from "./native"
import { InlineError } from "@/components/layout/LoadStates"

beforeEach(() => {
  env.native = false
  env.available = true
  env.notification.mockReset()
  env.notification.mockImplementation(async () => {})
  resetNativeLogOnce()
})
afterEach(() => vi.restoreAllMocks())

describe("haptics — where they must stay silent", () => {
  it("does nothing in a browser", () => {
    hapticSuccess()
    hapticError()
    expect(env.notification).not.toHaveBeenCalled()
  })

  it("does nothing on a shell built without the plugin, and says so once", () => {
    env.native = true
    env.available = false
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    hapticSuccess()
    hapticError()
    hapticError()
    expect(env.notification).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledTimes(1)
    expect(String(info.mock.calls[0][0])).toContain("Haptics")
  })

  it("never throws or rejects into the caller when the bridge refuses", async () => {
    env.native = true
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    env.notification.mockImplementation(async () => {
      throw Object.assign(new Error("not implemented"), { code: "UNIMPLEMENTED" })
    })
    expect(() => hapticError()).not.toThrow()
    expect(() => hapticError()).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(warn).toHaveBeenCalledTimes(1) // logged once, not per tap
  })

  it("survives a synchronous throw from the plugin proxy", () => {
    env.native = true
    vi.spyOn(console, "warn").mockImplementation(() => {})
    env.notification.mockImplementation(() => {
      throw new Error("proxy exploded")
    })
    expect(() => hapticSuccess()).not.toThrow()
  })
})

describe("haptics — the two moments", () => {
  it("plays the success and error notifications on a shell that has the plugin", () => {
    env.native = true
    hapticSuccess()
    hapticError()
    expect(env.notification.mock.calls.map((c) => c[0])).toEqual([{ type: "SUCCESS" }, { type: "ERROR" }])
  })
})

describe("useSaveFailedHaptic", () => {
  function Probe({ failure }: { failure: unknown }) {
    useSaveFailedHaptic(failure)
    return null
  }

  it("fires once when a failure appears, again only for a different failure", () => {
    env.native = true
    const { rerender } = render(<Probe failure={null} />)
    expect(env.notification).not.toHaveBeenCalled()
    rerender(<Probe failure="Couldn't save that." />)
    rerender(<Probe failure="Couldn't save that." />)
    expect(env.notification).toHaveBeenCalledTimes(1)
    rerender(<Probe failure="Couldn't add the part." />)
    expect(env.notification).toHaveBeenCalledTimes(2)
    expect(env.notification).toHaveBeenLastCalledWith({ type: "ERROR" })
    rerender(<Probe failure={null} />)
    expect(env.notification).toHaveBeenCalledTimes(2)
  })
})

describe("InlineError", () => {
  it("is silent by default — a failed read never buzzes", () => {
    env.native = true
    render(<InlineError onRetry={() => {}}>Couldn&apos;t load your rooms.</InlineError>)
    expect(env.notification).not.toHaveBeenCalled()
  })

  it("plays the error haptic when it reports a failed save", () => {
    env.native = true
    render(<InlineError save>Couldn&apos;t rename that room.</InlineError>)
    expect(env.notification).toHaveBeenCalledTimes(1)
    expect(env.notification).toHaveBeenCalledWith({ type: "ERROR" })
  })
})
