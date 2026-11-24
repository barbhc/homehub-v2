/**
 * Codex review D6 — a Done tapped offline survives signing out.
 *
 * Sign-out used to try each unsent Done for three seconds and then erase the
 * queue: offline, the completion the receipt had promised was simply gone.
 * Unsent Dones now stay on the device, keyed by the account that tapped them,
 * and are sent at THAT account's next sign-in — never shown to, or sent as,
 * anyone else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ auth: { currentUser: { uid: "user-a" } as { uid: string } | null } }))
const markTaskInstanceDone = vi.hoisted(() => vi.fn())
vi.mock("@/integrations/firebase", () => ({ auth: session.auth }))
vi.mock("@/modules/care", () => ({ markTaskInstanceDone: (...a: unknown[]) => markTaskInstanceDone(...a) }))

import {
  failedDones, parkDoneQueue, queueDone, resetDoneQueueForTests, writeAllDonesNow, writeDone, writeUnheldDones,
} from "./doneQueue"
import { localToday } from "../../../../shared/dates/calendar"

const KEY = "hh:pending-dones:v1"
const onDisk = (): Array<Record<string, unknown>> => JSON.parse(localStorage.getItem(KEY) ?? "[]")
const signInAs = (uid: string | null) => { session.auth.currentUser = uid ? { uid } : null }
const OFFLINE = { success: false, error: "You're offline" }
const tap = (id = "ti-1", label = "Replace the furnace filter") =>
  queueDone({ homeId: "home-1", id, label, completedOn: localToday() })
/** What AuthProvider.signOut does, in order. */
const signOut = async () => {
  await writeAllDonesNow()
  parkDoneQueue()
  signInAs(null)
}
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetDoneQueueForTests()
  signInAs("user-a")
  markTaskInstanceDone.mockResolvedValue({ success: true, data: null })
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("a Done tapped offline, then sign out", () => {
  it("stays on the device for the account that tapped it", async () => {
    markTaskInstanceDone.mockResolvedValue(OFFLINE)
    tap()
    await signOut()

    expect(markTaskInstanceDone).toHaveBeenCalledTimes(1) // tried while still signed in
    expect(onDisk()).toEqual([expect.objectContaining({ uid: "user-a", homeId: "home-1", id: "ti-1", state: "pending" })])
  })

  it("is sent at that account's next sign-in, on the day it was tapped", async () => {
    markTaskInstanceDone.mockResolvedValue(OFFLINE)
    tap()
    await signOut()
    markTaskInstanceDone.mockClear()

    // Back online, same account. A fresh app start reads the queue from disk.
    resetDoneQueueForTests()
    signInAs("user-a")
    markTaskInstanceDone.mockResolvedValue({ success: true, data: null })
    writeUnheldDones() // the first screen that mounts useTaskActions
    await flush()

    expect(markTaskInstanceDone).toHaveBeenCalledTimes(1)
    expect(markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-1", null, expect.objectContaining({ completedOn: localToday() }))
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it("is never shown to, or sent as, another account — and is still there for its owner", async () => {
    markTaskInstanceDone.mockResolvedValue(OFFLINE)
    tap()
    await signOut()
    markTaskInstanceDone.mockClear()

    signInAs("user-b")
    markTaskInstanceDone.mockResolvedValue({ success: true, data: null })
    writeUnheldDones()
    await flush()
    expect(failedDones()).toEqual([])
    // Not even when asked for by name under the other sign-in.
    await writeDone("home-1", "ti-1")
    expect(markTaskInstanceDone).not.toHaveBeenCalled()
    expect(onDisk()).toEqual([expect.objectContaining({ uid: "user-a", id: "ti-1" })])

    // …then its owner signs back in, and it goes out as them.
    signInAs("user-a")
    writeUnheldDones()
    await flush()
    expect(markTaskInstanceDone).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it("with nobody signed in, nothing is sent", async () => {
    markTaskInstanceDone.mockResolvedValue(OFFLINE)
    tap()
    await signOut()
    markTaskInstanceDone.mockClear()

    writeUnheldDones()
    await flush()
    expect(markTaskInstanceDone).not.toHaveBeenCalled()
    expect(onDisk()).toHaveLength(1)
  })
})

describe("two accounts on one device", () => {
  it("each keeps its own Done for the same task — neither overwrites the other", async () => {
    markTaskInstanceDone.mockResolvedValue(OFFLINE)
    tap("ti-1")
    await signOut()
    signInAs("user-b")
    tap("ti-1")
    await signOut()

    expect(onDisk().map((e) => e.uid).sort()).toEqual(["user-a", "user-b"])

    // Each is sent only under its own sign-in.
    markTaskInstanceDone.mockClear()
    markTaskInstanceDone.mockResolvedValue({ success: true, data: null })
    signInAs("user-b")
    writeUnheldDones()
    await flush()
    expect(markTaskInstanceDone).toHaveBeenCalledTimes(1)
    expect(onDisk()).toEqual([expect.objectContaining({ uid: "user-a" })])
  })
})

describe("a write still in flight when the account signs out", () => {
  it("is kept when it then fails — even with a refusal that would otherwise drop it", async () => {
    let answer!: (r: unknown) => void
    markTaskInstanceDone.mockReturnValue(new Promise((r) => { answer = r }))
    tap()
    const leaving = writeAllDonesNow(10) // runs out of time: the write is still out
    await leaving
    parkDoneQueue()
    signInAs("user-b")

    // Refused only because the session ended under it.
    answer({ success: false, error: "permission-denied" })
    await flush()
    expect(onDisk()).toEqual([expect.objectContaining({ uid: "user-a", id: "ti-1", state: "pending" })])
    expect(failedDones()).toEqual([])
  })

  it("is gone when it then lands", async () => {
    let answer!: (r: unknown) => void
    markTaskInstanceDone.mockReturnValue(new Promise((r) => { answer = r }))
    tap()
    await writeAllDonesNow(10)
    parkDoneQueue()
    signInAs(null)

    answer({ success: true, data: null })
    await flush()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe("sign-out with a Done already refused on screen", () => {
  it("goes back to waiting, so the next sign-in sends it instead of leaving it for a tap", async () => {
    markTaskInstanceDone.mockResolvedValue(OFFLINE)
    tap()
    await writeDone("home-1", "ti-1")
    expect(failedDones()).toHaveLength(1)

    await signOut()
    expect(onDisk()).toEqual([expect.objectContaining({ state: "pending" })])

    markTaskInstanceDone.mockClear()
    markTaskInstanceDone.mockResolvedValue({ success: true, data: null })
    signInAs("user-a")
    writeUnheldDones()
    await flush()
    expect(markTaskInstanceDone).toHaveBeenCalledTimes(1)
  })
})
