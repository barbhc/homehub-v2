/**
 * The date a check-off is recorded on — markTaskInstanceDone's default.
 *
 * It used to send `new Date().toISOString().slice(0, 10)`: the UTC date. At
 * 7 pm in California that is already tomorrow, so every evening check-off was
 * recorded a day late and the next due date slid with it. It now sends the
 * DEVICE's calendar date (the server checks it against the home's, ±1 day).
 *
 * A test at a fixed instant only has teeth where the local and UTC dates
 * differ at that instant, and that depends on the zone the suite runs in —
 * CI's runners are UTC, where the old code passes everything. So each case
 * pins the zone (the TZ env var, which Node re-reads at runtime) and asserts
 * the UTC date is wrong at the instant that discriminates: west of UTC that is
 * 23:30, east of it 00:30.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const calls: Array<{ name: string; data: Record<string, unknown> }> = []

vi.mock("@/integrations/firebase", () => ({
  db: {},
  callable: (name: string) => async (data: Record<string, unknown>) => {
    calls.push({ name, data })
    return { completedInstanceId: data.taskInstanceId, nextInstanceId: null }
  },
}))
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => true, id: "ti-1", data: () => ({ status: "done" }) })),
}))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

import { markTaskInstanceDone } from "./taskService"

const sentCompletedOn = () => {
  const call = calls.find((c) => c.name === "completeTask")
  expect(call, "completeTask was never called").toBeDefined()
  return call!.data
}

const ZONES = [
  { tz: "America/Los_Angeles", discriminatingHour: 23 }, // 23:30 PDT = 06:30Z the next day
  { tz: "Asia/Tokyo", discriminatingHour: 0 }, // 00:30 JST = 15:30Z the day before
]

describe.each(ZONES)("markTaskInstanceDone — default completedOn on a device in $tz", ({ tz, discriminatingHour }) => {
  beforeAll(() => {
    vi.stubEnv("TZ", tz)
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })
  beforeEach(() => {
    calls.length = 0
    vi.useFakeTimers({ toFake: ["Date"] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    { at: "23:30 on Sep 29", hour: 23, day: 29, expected: "2026-09-29" },
    { at: "00:30 on Sep 30", hour: 0, day: 30, expected: "2026-09-30" },
  ])("$at local → $expected", async ({ hour, day, expected }) => {
    vi.setSystemTime(new Date(2026, 8, day, hour, 30)) // LOCAL wall-clock time in `tz`

    if (hour === discriminatingHour) {
      // The test's teeth: here the UTC date — what the old code sent — is wrong.
      expect(new Date().toISOString().slice(0, 10)).not.toBe(expected)
    }

    const res = await markTaskInstanceDone("home-1", "ti-1")
    expect(res.success).toBe(true)
    expect(sentCompletedOn()).toMatchObject({ completedOn: expected, backdated: false })
  })
})

describe("markTaskInstanceDone — an explicit date is sent as given", () => {
  beforeEach(() => {
    calls.length = 0
  })

  it("passes completedOn, backdated and nextDueOverride through untouched", async () => {
    await markTaskInstanceDone("home-1", "ti-1", null, {
      completedOn: "2026-09-24",
      backdated: true,
      nextDueOverride: "2026-10-24",
    })
    expect(sentCompletedOn()).toMatchObject({
      homeId: "home-1",
      taskInstanceId: "ti-1",
      completedOn: "2026-09-24",
      backdated: true,
      nextDueOverride: "2026-10-24",
    })
  })
})
