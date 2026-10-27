/**
 * Edge-swipe back is switched off while a sheet or dialog is open, so the swipe
 * can never navigate away underneath it (and drop what was typed) — and back on
 * when the last one closes. Off the shell, and on a shell built before the
 * BackGesture plugin, nothing happens at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const env = vi.hoisted(() => ({
  native: true,
  available: true,
  setEnabled: vi.fn<(opts: { enabled: boolean }) => Promise<void>>(async () => {}),
}))

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => env.native,
    isPluginAvailable: () => env.available,
    getPlatform: () => (env.native ? "ios" : "web"),
  },
  registerPlugin: () => ({ setEnabled: (opts: { enabled: boolean }) => env.setEnabled(opts) }),
}))

import { modalIsOpen, resetBackGestureState, startBackGestureGuard } from "./backGesture"
import { resetNativeLogOnce } from "./native"

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
let stop: () => void = () => {}

beforeEach(() => {
  env.native = true
  env.available = true
  env.setEnabled.mockReset()
  env.setEnabled.mockImplementation(async () => {})
  resetBackGestureState()
  resetNativeLogOnce()
  document.body.innerHTML = ""
})
afterEach(() => {
  stop()
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

function openDialog(role = "dialog"): HTMLElement {
  const el = document.createElement("div")
  el.setAttribute("role", role)
  document.body.appendChild(el)
  return el
}

describe("modalIsOpen", () => {
  it("sees Radix and hand-built sheets alike", () => {
    expect(modalIsOpen()).toBe(false)
    const d = openDialog()
    expect(modalIsOpen()).toBe(true)
    d.remove()
    openDialog("alertdialog")
    expect(modalIsOpen()).toBe(true)
  })
})

describe("startBackGestureGuard", () => {
  it("turns the swipe off while a sheet is open and back on when it closes", async () => {
    stop = startBackGestureGuard()
    expect(env.setEnabled).not.toHaveBeenCalled() // already on: nothing to say
    const sheet = openDialog()
    await nextFrame()
    expect(env.setEnabled).toHaveBeenLastCalledWith({ enabled: false })
    const confirm = openDialog("alertdialog") // a discard question over the sheet
    await nextFrame()
    sheet.remove()
    await nextFrame()
    expect(env.setEnabled).toHaveBeenCalledTimes(1) // still a modal open
    confirm.remove()
    await nextFrame()
    expect(env.setEnabled).toHaveBeenLastCalledWith({ enabled: true })
    expect(env.setEnabled).toHaveBeenCalledTimes(2)
  })

  it("does nothing in a browser", async () => {
    env.native = false
    stop = startBackGestureGuard()
    openDialog()
    await nextFrame()
    expect(env.setEnabled).not.toHaveBeenCalled()
  })

  it("does nothing on a shell built before the plugin", async () => {
    env.available = false
    vi.spyOn(console, "info").mockImplementation(() => {})
    stop = startBackGestureGuard()
    openDialog()
    await nextFrame()
    expect(env.setEnabled).not.toHaveBeenCalled()
  })
})
