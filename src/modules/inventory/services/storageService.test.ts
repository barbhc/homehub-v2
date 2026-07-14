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
  storageDownloadUrl: (p: string) => `https://x/${p}`,
}))

import { uploadManualPdf, uploadItemPhoto } from "./storageService"

beforeEach(() => uploadBytes.mockReset())

const file = new File(["x"], "m.pdf", { type: "application/pdf" })

describe("storageService uid requirement", () => {
  it("uploadManualPdf without userId fails fast (no unscoped write)", async () => {
    const res = await uploadManualPdf("item1", file, null)
    expect(res.error?.message).toMatch(/not signed in/i)
    expect(uploadBytes).not.toHaveBeenCalled()
  })

  it("uploadItemPhoto without userId fails fast", async () => {
    const res = await uploadItemPhoto("h1", "item1", file, undefined)
    expect(res.error?.message).toMatch(/not signed in/i)
    expect(uploadBytes).not.toHaveBeenCalled()
  })

  it("with userId the path is uid-scoped", async () => {
    uploadBytes.mockResolvedValue(undefined)
    const res = await uploadManualPdf("item1", file, "uid-9")
    expect(res.data?.path).toMatch(/^uid-9\/item1\/manual_\d+\.pdf$/)
  })
})
