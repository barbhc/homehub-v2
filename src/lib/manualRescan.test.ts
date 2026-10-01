/**
 * Settings → Manuals → Rescan ends in the review, never in a commit.
 *
 * It ran `parseManualAndWait(…, { mode: "commit" })` for one row, for "Rescan
 * all" and for "Retry failed" alike — the worker wrote each manual's tasks into
 * the home with no review, even for a manual already read and waiting to be
 * reviewed ("Read — not saved").
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
// The page's source as text (Vite's ?raw), for the two structural checks at the end.
import settings from "../pages/Settings.tsx?raw"

const svc = vi.hoisted(() => ({ startParse: vi.fn(), parseManualAndWait: vi.fn() }))
vi.mock("@/modules/knowledge/services/parseManualService", () => ({
  startParse: (...a: unknown[]) => svc.startParse(...a),
  parseManualAndWait: (...a: unknown[]) => svc.parseManualAndWait(...a),
}))

const { startRescanForReview, rescanForReviewAndWait, openPendingReview } = await import("./manualRescan")
const { isParsePending } = await import("./parsePickup")
const { isScanQueued } = await import("./scanCapacity")

const manual = { manual_id: "m-1", item_unit_id: "item-1" }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe("a row's Rescan — the add wizard's hand-off, not a commit", () => {
  it("starts a PREVIEW read and sends the owner to the item page's review", async () => {
    svc.startParse.mockResolvedValue({ ok: true, requestId: "r1" })
    const res = await startRescanForReview("h1", manual)
    expect(svc.startParse).toHaveBeenCalledWith("m-1", { homeId: "h1", mode: "preview" })
    expect(res).toEqual({ ok: true, reviewPath: "/items/item-1" })
    // The flag the item page's pickup reads to open the review when it lands.
    expect(isParsePending("m-1")).toBe(true)
  })

  it("a capacity refusal is queued to start itself, not reported as lost (HH-124)", async () => {
    svc.startParse.mockResolvedValue({ ok: false, error: "Daily AI limit reached — try again tomorrow." })
    const res = await startRescanForReview("h1", manual)
    expect(res).toMatchObject({ ok: false, queued: true })
    expect(isScanQueued("m-1")).toBe(true)
    expect(isParsePending("m-1")).toBe(false)
  })

  it("a manual already being read is handed off to that read — not a failure, not a second scan", async () => {
    svc.startParse.mockResolvedValue({
      ok: false,
      error: "This manual is already being read — it'll be ready in a few minutes.",
      inFlight: { requestId: "running-1", mode: "preview" },
    })
    expect(await startRescanForReview("h1", manual)).toEqual({ ok: true, reviewPath: "/items/item-1" })
    expect(isParsePending("m-1")).toBe(true)
    expect(isScanQueued("m-1")).toBe(false)
  })

  it("…also when the refusal's details did not survive the transport", async () => {
    svc.startParse.mockResolvedValue({ ok: false, error: "This manual is already being read — it'll be ready in a few minutes." })
    expect(await startRescanForReview("h1", manual)).toEqual({ ok: true, reviewPath: "/items/item-1" })
  })

  it("a real failure says so, and flags nothing", async () => {
    svc.startParse.mockResolvedValue({ ok: false, error: "Manual not found" })
    const res = await startRescanForReview("h1", manual)
    expect(res).toEqual({ ok: false, error: "Manual not found", queued: false })
    expect(isScanQueued("m-1")).toBe(false)
    expect(isParsePending("m-1")).toBe(false)
  })
})

describe("Rescan all — one at a time, each left for its review", () => {
  it("reads in PREVIEW mode and flags the finished read for its review", async () => {
    svc.parseManualAndWait.mockResolvedValue({ ok: true, chunks: 4, tasks: 7, committed: false })
    const res = await rescanForReviewAndWait("h1", manual)
    expect(svc.parseManualAndWait).toHaveBeenCalledWith("m-1", { homeId: "h1", mode: "preview" })
    expect(res.ok).toBe(true)
    expect(isParsePending("m-1")).toBe(true)
  })

  it("a failed read flags nothing for review", async () => {
    svc.parseManualAndWait.mockResolvedValue({ ok: false, error: "The scan failed" })
    await rescanForReviewAndWait("h1", manual)
    expect(isParsePending("m-1")).toBe(false)
  })
})

describe("Read — not saved", () => {
  it("goes to the waiting review without reading the manual again", () => {
    expect(openPendingReview(manual)).toBe("/items/item-1")
    expect(isParsePending("m-1")).toBe(true)
    expect(svc.startParse).not.toHaveBeenCalled()
    expect(svc.parseManualAndWait).not.toHaveBeenCalled()
  })

  it("asks the item page to OPEN that review on arrival — Review is a tap, not a visit (HH-161)", async () => {
    const { pendingReviewFor, takeReviewRequest } = await import("./reviewRequest")
    openPendingReview(manual)
    expect(pendingReviewFor()).toBe("m-1")
    takeReviewRequest("m-1")
  })
})

describe("the Settings page itself", () => {
  it("never starts a read in commit mode", () => {
    expect(settings).not.toMatch(/mode:\s*"commit"/)
    expect(settings).not.toContain("parseManualAndWait(")
  })

  it("routes every rescan through the review hand-off", () => {
    expect(settings).toContain("startRescanForReview(homeId, m)")
    expect(settings).toContain("rescanForReviewAndWait(homeId, m)")
    expect(settings).toContain("openPendingReview(m)")
  })
})
