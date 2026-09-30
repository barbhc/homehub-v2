/**
 * parseManualAndWait follows ONE run (C2).
 *
 * The worker now stamps every stage write with its run's requestId. The
 * watcher must act only on its own run's writes: an older run's `done`
 * satisfying a newer run's watcher is how the review opened on the wrong
 * draft. And when the server refuses a second scan of a manual already being
 * read, the same kind of scan is followed instead of reported as a failure —
 * the item page re-asking for the manual the add wizard had just started is
 * the everyday case, and it used to cost a second scan.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { PARSE_ERR } from "../../../../shared/parse/parseErrors"

const h = vi.hoisted(() => ({
  enqueue: vi.fn(),
  listeners: [] as Array<(snap: { data: () => unknown }) => void>,
  unsubscribed: 0,
  docData: undefined as unknown,
}))

vi.mock("@/integrations/firebase", () => ({
  callable: () => h.enqueue,
  docRef: (path: string) => ({ path }),
}))
vi.mock("firebase/firestore", () => ({
  onSnapshot: (_ref: unknown, cb: (snap: { data: () => unknown }) => void) => {
    h.listeners.push(cb)
    return () => {
      h.unsubscribed += 1
    }
  },
  getDoc: async () => ({ data: () => h.docData }),
}))

import { parseManualAndWait } from "./parseManualService"

const emit = (parse: Record<string, unknown>) => {
  for (const cb of [...h.listeners]) cb({ data: () => ({ parse }) })
}
const subscribed = () => vi.waitFor(() => expect(h.listeners.length).toBeGreaterThan(0))
const OPTS = { homeId: "home-1", mode: "preview" as const }

/** Resolves true once `p` settles, false if it is still pending. */
const settled = async (p: Promise<unknown>) => {
  let done = false
  void p.then(() => {
    done = true
  })
  await new Promise((r) => setTimeout(r, 0))
  return done
}

const refusal = (details?: Record<string, unknown>) =>
  Object.assign(new Error(PARSE_ERR.alreadyReading), details ? { details } : {})

beforeEach(() => {
  h.enqueue.mockReset()
  h.listeners.length = 0
  h.unsubscribed = 0
  h.docData = undefined
})

describe("the watcher acts on its own run's writes only", () => {
  it("an OLDER run's `done` does not satisfy it — its own `done` does", async () => {
    h.enqueue.mockResolvedValue({ ok: true, requestId: "run-2" })
    const p = parseManualAndWait("m1", OPTS)
    await subscribed()

    emit({ requestId: "run-1", stage: "done", summary: { tasks: 99 } })
    expect(await settled(p)).toBe(false)

    emit({ requestId: "run-2", stage: "done", summary: { chunks: 3, tasks: 4 } })
    await expect(p).resolves.toMatchObject({ ok: true, tasks: 4, chunks: 3 })
    expect(h.unsubscribed).toBe(1)
  })

  it("a snapshot with no requestId at all is not its run", async () => {
    h.enqueue.mockResolvedValue({ ok: true, requestId: "run-2" })
    const p = parseManualAndWait("m1", OPTS)
    await subscribed()
    emit({ stage: "done", summary: { tasks: 1 } })
    expect(await settled(p)).toBe(false)
    emit({ requestId: "run-2", stage: "error", error: { message: "boom" } })
    await expect(p).resolves.toEqual({ ok: false, error: "boom" })
  })

  it("streams its own run's progress, and only its own", async () => {
    h.enqueue.mockResolvedValue({ ok: true, requestId: "run-2" })
    const stages: string[] = []
    const p = parseManualAndWait("m1", OPTS, (s) => stages.push(s))
    await subscribed()
    emit({ requestId: "run-1", stage: "claude_call" })
    emit({ requestId: "run-2", stage: "pdf_fetched" })
    emit({ requestId: "run-2", stage: "done", summary: {} })
    await p
    expect(stages).toEqual(["uploading", "reading", "done"])
  })
})

describe("'already being read' → follow that scan, don't fail", () => {
  it("follows the running scan named in the refusal's details", async () => {
    h.enqueue.mockRejectedValue(refusal({ kind: "parse_in_flight", requestId: "wizard-run", mode: "preview", stage: "claude_call" }))
    const p = parseManualAndWait("m1", OPTS)
    await subscribed()
    emit({ requestId: "wizard-run", stage: "done", summary: { chunks: 2, tasks: 5 } })
    await expect(p).resolves.toMatchObject({ ok: true, tasks: 5 })
  })

  it("without details, reads the manual to find the running scan", async () => {
    h.enqueue.mockRejectedValue(refusal())
    h.docData = { parse: { stage: "claude_call", requestId: "wizard-run", mode: "preview" } }
    const p = parseManualAndWait("m1", OPTS)
    await subscribed()
    emit({ requestId: "wizard-run", stage: "done", summary: { tasks: 1 } })
    await expect(p).resolves.toMatchObject({ ok: true })
  })

  it("does NOT follow a different kind of scan — a rescan must not report a preview as committed", async () => {
    h.enqueue.mockRejectedValue(refusal({ kind: "parse_in_flight", requestId: "preview-run", mode: "preview", stage: "started" }))
    const res = await parseManualAndWait("m1", { homeId: "home-1", mode: "commit" })
    expect(res).toEqual({ ok: false, error: PARSE_ERR.alreadyReading })
    expect(h.listeners.length).toBe(0)
  })

  it("any other refusal is still reported, as before", async () => {
    h.enqueue.mockRejectedValue(new Error("That's a lot of requests at once — please wait about 9 seconds and try again."))
    const res = await parseManualAndWait("m1", OPTS)
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/wait about 9 seconds/) })
  })
})

describe("replaced while watching", () => {
  it("a replacement of the same kind is followed through to its end", async () => {
    h.enqueue.mockResolvedValue({ ok: true, requestId: "run-2" })
    const p = parseManualAndWait("m1", OPTS)
    await subscribed()
    emit({ requestId: "run-2", stage: "started", mode: "preview" })
    emit({ requestId: "run-3", stage: "queued", mode: "preview" })
    emit({ requestId: "run-3", stage: "done", mode: "preview", summary: { tasks: 7 } })
    await expect(p).resolves.toMatchObject({ ok: true, tasks: 7 })
  })

  it("a replacement of another kind ends the wait honestly instead of leaving it open", async () => {
    h.enqueue.mockResolvedValue({ ok: true, requestId: "run-2" })
    const p = parseManualAndWait("m1", OPTS)
    await subscribed()
    emit({ requestId: "run-2", stage: "claude_call", mode: "preview" })
    emit({ requestId: "run-3", stage: "queued", mode: "commit" })
    await expect(p).resolves.toEqual({ ok: false, error: PARSE_ERR.superseded })
  })

  it("a different requestId seen BEFORE its own run (a stale cached snapshot) is ignored, not followed", async () => {
    h.enqueue.mockResolvedValue({ ok: true, requestId: "run-2" })
    const p = parseManualAndWait("m1", OPTS)
    await subscribed()
    emit({ requestId: "run-1", stage: "done", mode: "preview", summary: { tasks: 99 } })
    expect(await settled(p)).toBe(false)
    emit({ requestId: "run-2", stage: "done", mode: "preview", summary: { tasks: 2 } })
    await expect(p).resolves.toMatchObject({ ok: true, tasks: 2 })
  })
})
