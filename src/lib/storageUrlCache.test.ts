/**
 * "Item photo pops in late" (beta round 5).
 *
 * Photos are stored as object PATHS, so painting one costs two sequential
 * round-trips — getDownloadURL(), then the image fetch — and the in-memory SWR
 * cache dies with the tab, so every cold start pays it again for a photo you
 * have already seen. This cache is what makes the second view instant.
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  getCachedStorageUrl,
  setCachedStorageUrl,
  invalidateCachedStorageUrl,
} from "./storageUrlCache"

beforeEach(() => localStorage.clear())

describe("storage URL cache", () => {
  it("survives a reload, which is the entire point", () => {
    setCachedStorageUrl("photos/a.jpg", "https://x/a.jpg?token=1")
    // Same localStorage, fresh read — what a cold start does.
    expect(getCachedStorageUrl("photos/a.jpg")).toBe("https://x/a.jpg?token=1")
  })

  it("misses cleanly for unknown paths and null", () => {
    expect(getCachedStorageUrl("photos/never.jpg")).toBeNull()
    expect(getCachedStorageUrl(null)).toBeNull()
    expect(getCachedStorageUrl(undefined)).toBeNull()
  })

  it("drops an entry when an <img> proves it stale", () => {
    setCachedStorageUrl("photos/a.jpg", "https://x/a.jpg?token=old")
    invalidateCachedStorageUrl("photos/a.jpg")
    expect(getCachedStorageUrl("photos/a.jpg")).toBeNull()
  })

  it("replaces rather than duplicates when a path is re-resolved", () => {
    setCachedStorageUrl("photos/a.jpg", "https://x/a.jpg?token=1")
    setCachedStorageUrl("photos/a.jpg", "https://x/a.jpg?token=2")
    expect(getCachedStorageUrl("photos/a.jpg")).toBe("https://x/a.jpg?token=2")
  })

  it("stays bounded, keeping the most recently written", () => {
    for (let i = 0; i < 250; i++) setCachedStorageUrl(`photos/${i}.jpg`, `https://x/${i}`)
    expect(getCachedStorageUrl("photos/249.jpg")).toBe("https://x/249")
    expect(getCachedStorageUrl("photos/0.jpg")).toBeNull()
    expect(Object.keys(JSON.parse(localStorage.getItem("homehub:storage-urls")!)).length).toBe(200)
  })

  it("treats corrupt storage as empty rather than feeding junk to <img>", () => {
    localStorage.setItem("homehub:storage-urls", "not json")
    expect(getCachedStorageUrl("photos/a.jpg")).toBeNull()
    localStorage.setItem("homehub:storage-urls", JSON.stringify({ "photos/a.jpg": { nope: 1 } }))
    expect(getCachedStorageUrl("photos/a.jpg")).toBeNull()
  })
})
