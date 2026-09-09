import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { isStaleChunkError, withChunkRetry } from "./chunkRetry"

/** Resolves to "pending" if the promise hasn't settled by the next few ticks. */
async function settleOrPending<T>(p: Promise<T>): Promise<T | "pending"> {
  return Promise.race([p, new Promise<"pending">((r) => setTimeout(() => r("pending"), 10))])
}

describe("isStaleChunkError", () => {
  it("recognises the browser's refusal of HTML served in place of a missing chunk", () => {
    // Firebase Hosting rewrites an unknown path to index.html, so the chunk
    // arrives as HTML with a 200 rather than a 404.
    expect(isStaleChunkError(new TypeError(
      'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server ' +
      'responded with a MIME type of "text/html".',
    ))).toBe(true)
  })

  it("recognises each engine's dynamic-import failure", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: /assets/x.js"))).toBe(true)
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module"))).toBe(true)
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true)
  })

  it("recognises pdf.js failing to start its worker", () => {
    // The worker URL import resolves to a string from the OLD build, so nothing
    // rejects until pdf.js fetches it — this is the only signal we get.
    expect(isStaleChunkError(new Error(
      'Setting up fake worker failed: "Failed to fetch dynamically imported module: ' +
      'https://app.example/assets/pdf.worker-OLDHASH.mjs".',
    ))).toBe(true)
  })

  it("does NOT claim a real runtime failure is a stale build", () => {
    expect(isStaleChunkError(new Error("InvalidPDFException: Invalid PDF structure"))).toBe(false)
    expect(isStaleChunkError(new Error("Could not get canvas 2d context"))).toBe(false)
    expect(isStaleChunkError(new TypeError("Failed to fetch"))).toBe(false)
    expect(isStaleChunkError(undefined)).toBe(false)
  })
})

describe("withChunkRetry", () => {
  const stale = () => new TypeError("Failed to fetch dynamically imported module: /assets/a.js")

  beforeEach(() => { sessionStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it("returns the loaded value and never reloads on success", async () => {
    const reload = vi.fn()
    await expect(withChunkRetry(async () => "pdf", "test", reload)).resolves.toBe("pdf")
    expect(reload).not.toHaveBeenCalled()
  })

  it("reloads once on a stale-asset failure and stays pending so the caller keeps loading", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const reload = vi.fn()
    const result = await settleOrPending(withChunkRetry(() => Promise.reject(stale()), "test", reload))
    expect(reload).toHaveBeenCalledTimes(1)
    // Pending, NOT rejected: an error state would flash before the reload lands.
    expect(result).toBe("pending")
  })

  it("rethrows the second time so a genuinely broken asset can't loop the app", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const reload = vi.fn()
    await settleOrPending(withChunkRetry(() => Promise.reject(stale()), "first", reload))
    await expect(withChunkRetry(() => Promise.reject(stale()), "second", reload)).rejects.toThrow(
      /dynamically imported module/,
    )
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("a later good load re-arms the recovery for the NEXT deploy", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const reload = vi.fn()
    await settleOrPending(withChunkRetry(() => Promise.reject(stale()), "first", reload))
    await withChunkRetry(async () => "ok", "recovered", reload)
    await settleOrPending(withChunkRetry(() => Promise.reject(stale()), "next deploy", reload))
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it("rethrows a real failure untouched, without reloading", async () => {
    const reload = vi.fn()
    await expect(
      withChunkRetry(() => Promise.reject(new Error("InvalidPDFException")), "test", reload),
    ).rejects.toThrow("InvalidPDFException")
    expect(reload).not.toHaveBeenCalled()
  })
})
