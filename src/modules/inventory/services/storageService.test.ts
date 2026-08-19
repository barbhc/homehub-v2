/**
 * storageService uid requirement: the tightened storage.rules scope manual and
 * photo writes to the caller's own uid prefix, so the old unscoped fallback
 * paths ({itemId}/…, photos/{itemId}/…) would be DENIED — the service now
 * fails fast instead of uploading to a path the rules reject.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

const uploadBytes = vi.fn()
vi.mock("firebase/storage", () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: (...a: unknown[]) => uploadBytes(...a),
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(async () => "https://x/token-url"),
}))
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn().mockReturnThis(), commit: vi.fn() })),
}))
vi.mock("@/integrations/firebase", () => ({
  storage: {},
  db: {},
  callable: () => async () => ({ ok: true, images: [] }),
}))

import { uploadManualPdf, uploadItemPhoto, uploadReceiptImage, uploadDiagramImage } from "./storageService"

beforeEach(() => uploadBytes.mockReset())

const file = new File(["x"], "m.pdf", { type: "application/pdf" })

describe("storageService uid requirement", () => {
  it("uploadManualPdf without userId fails fast (no unscoped write)", async () => {
    const res = await uploadManualPdf("h1", "item1", file, null)
    expect(res.error?.message).toMatch(/not signed in/i)
    expect(uploadBytes).not.toHaveBeenCalled()
  })

  it("uploadItemPhoto without userId fails fast", async () => {
    const res = await uploadItemPhoto("h1", "item1", file, undefined)
    expect(res.error?.message).toMatch(/not signed in/i)
    expect(uploadBytes).not.toHaveBeenCalled()
  })
})

/**
 * The leading homes/{homeId}/ segment is what makes a Storage object
 * membership-checkable at all (storage.rules gates reads on a Firestore member
 * doc for that home). If an upload path ever loses it, the object silently
 * lands back in the un-scoped legacy space where any signed-in user can read
 * it — so the prefix is asserted here, not just the uid segment.
 */
describe("upload paths are home-scoped", () => {
  beforeEach(() => uploadBytes.mockResolvedValue(undefined))

  it("manual PDFs: homes/{homeId}/manuals/{uid}/{itemId}/…", async () => {
    const res = await uploadManualPdf("h1", "item1", file, "uid-9")
    expect(res.data?.path).toMatch(/^homes\/h1\/manuals\/uid-9\/item1\/manual_\d+\.pdf$/)
  })

  it("receipts: homes/{homeId}/receipts/{itemUnitId}/…", async () => {
    const res = await uploadReceiptImage("h1", "item1", file, "uid-9")
    expect(res.data?.path).toMatch(/^homes\/h1\/receipts\/item1\/\d+-m\.pdf$/)
  })

  it("diagram renders: homes/{homeId}/images/{manualId}/page_{n}.jpg", async () => {
    const res = await uploadDiagramImage("h1", "man-1", 4, new Blob(["x"]))
    expect(res.data?.path).toBe("homes/h1/images/man-1/page_4.jpg")
  })
})
