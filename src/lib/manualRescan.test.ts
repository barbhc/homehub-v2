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

// ── What a bulk rescan may read ─────────────────────────────────────────────
//
// Codex review 2026-10-29, findings 3 and 5. The guard was on the ROW — a
// manual "Read — not saved" offers Review, not another read — and missing from
// the "Rescan All" button underneath it, which passed every manual. Both
// promises it broke are written down above and in docs/add-item-flow.md.
describe("rescanTargets — Rescan All keeps the promises the rows keep", () => {
  const doc = (over: Record<string, unknown> = {}) => ({
    manual_id: "m-x",
    role: "primary" as "primary" | "reference",
    parse_stage: "done",
    parsed_at: "2026-10-01T00:00:00.000Z",
    has_preview_draft: false,
    parse_mode: "preview",
    ...over,
  })

  it("leaves a review that is waiting alone — a new read would replace that draft", async () => {
    const { rescanTargets } = await import("./manualRescan")
    // "Read — not saved": done, with a draft, never saved (isAwaitingReview).
    const waiting = doc({ manual_id: "waiting", parsed_at: null, has_preview_draft: true })
    const ordinary = doc({ manual_id: "ordinary" })
    expect(rescanTargets([waiting, ordinary]).map((m) => m.manual_id)).toEqual(["ordinary"])
  })

  it("leaves a rescan's unsaved draft alone too (HH-161: a read AGAIN keeps its old parsed_at)", async () => {
    const { rescanTargets } = await import("./manualRescan")
    const reRead = doc({ manual_id: "re-read", has_preview_draft: true, parse_mode: "preview" })
    expect(rescanTargets([reRead])).toEqual([])
  })

  it("never sends a reference document through the task parser", async () => {
    const { rescanTargets } = await import("./manualRescan")
    // Attached as "Reference doc", on the screen's promise that it won't
    // generate upkeep. Saving a review of it created upkeep from a recipe book.
    const reference = doc({ manual_id: "recipes", role: "reference" })
    const owners = doc({ manual_id: "dishwasher" })
    expect(rescanTargets([reference, owners]).map((m) => m.manual_id)).toEqual(["dishwasher"])
  })

  it("a stale draft overtaken by a commit run is still readable — it is not waiting on anyone", async () => {
    const { rescanTargets } = await import("./manualRescan")
    // done + draft + saved by a later commit run → not awaiting review.
    const stale = doc({ manual_id: "stale", has_preview_draft: true, parse_mode: "fill_gaps" })
    expect(rescanTargets([stale]).map((m) => m.manual_id)).toEqual(["stale"])
  })

  it("isReferenceDoc reads the role and nothing else", async () => {
    const { isReferenceDoc } = await import("./manualRescan")
    expect(isReferenceDoc({ role: "reference" })).toBe(true)
    expect(isReferenceDoc({ role: "primary" })).toBe(false)
    expect(isReferenceDoc({ role: null } as { role: string | null })).toBe(false)
  })
})

describe("the Settings page routes bulk rescans through the rule", () => {
  it("Rescan All and Retry failed both filter, rather than passing every manual", () => {
    expect(settings).toContain("runRescan(rescanTargets(manuals))")
    expect(settings).not.toMatch(/runRescan\(manuals\)/)
    expect(settings).toContain("rescanTargets(failed)")
  })

  it("says how many it left alone, so skipping is not silent", () => {
    expect(settings).toContain("rescanSkipped")
  })

  it("a reference document is re-read, never parsed, from its own row", () => {
    expect(settings).toContain("isReferenceDoc(m)")
    expect(settings).toContain("ingestReference(homeId, m.manual_id)")
  })
})

