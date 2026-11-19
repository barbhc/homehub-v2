import { beforeEach, describe, expect, it, vi } from "vitest"

const setPreference = vi.hoisted(() => vi.fn(async () => {}))
vi.mock("./userPreferences", () => ({ setPreference }))

const { syncTimeZone, deviceTimeZone, PREF_TIME_ZONE } = await import("./timeZone")

beforeEach(() => {
  window.localStorage.clear()
  setPreference.mockReset()
  setPreference.mockResolvedValue(undefined)
})

describe("syncTimeZone", () => {
  it("records this device's zone once, then not again while it stays the same", async () => {
    const tz = deviceTimeZone()!
    expect(tz).toBeTruthy()
    await syncTimeZone("uid-1")
    expect(setPreference).toHaveBeenCalledWith("uid-1", PREF_TIME_ZONE, tz)
    await syncTimeZone("uid-1")
    expect(setPreference).toHaveBeenCalledTimes(1)
  })

  it("writes again when the device moves to another zone", async () => {
    window.localStorage.setItem("homehub:tz-synced:uid-1", "Pacific/Honolulu")
    await syncTimeZone("uid-1")
    expect(setPreference).toHaveBeenCalledTimes(1)
  })

  it("a failed write is retried on the next boot, and never throws", async () => {
    setPreference.mockRejectedValueOnce(new Error("offline"))
    await expect(syncTimeZone("uid-1")).resolves.toBeUndefined()
    await syncTimeZone("uid-1")
    expect(setPreference).toHaveBeenCalledTimes(2)
  })
})
