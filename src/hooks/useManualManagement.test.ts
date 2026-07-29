/**
 * isDeadLegacyManualUrl — the predicate that keeps the item page from handing a
 * dead v1 Supabase upload URL to an <a href> (dogfooding hit ERR_NAME_NOT_RESOLVED
 * in Safari). v2 stores everything in Firebase Storage and never mints a
 * supabase.co URL, so that host is an unambiguous "the original file is gone".
 */
import { describe, it, expect } from "vitest"
import { isDeadLegacyManualUrl } from "./useManualManagement"

describe("isDeadLegacyManualUrl", () => {
  it("flags v1 Supabase storage upload URLs as dead", () => {
    expect(
      isDeadLegacyManualUrl(
        "url",
        "https://mpvhwuigpyrqdmjdkdjy.supabase.co/storage/v1/object/public/Manuals/bosch.pdf",
      ),
    ).toBe(true)
  })

  it("flags the bare supabase.co host too", () => {
    expect(isDeadLegacyManualUrl("url", "https://supabase.co/whatever.pdf")).toBe(true)
  })

  it("passes through a live manufacturer manual URL", () => {
    expect(
      isDeadLegacyManualUrl("url", "https://media3.bosch-home.com/Documents/9001234567_A.pdf"),
    ).toBe(false)
  })

  it("does not false-positive on a lookalike host", () => {
    // endsWith(".supabase.co") must not match "notsupabase.com" or a path mention.
    expect(isDeadLegacyManualUrl("url", "https://notsupabase.com/manual.pdf")).toBe(false)
    expect(isDeadLegacyManualUrl("url", "https://example.com/supabase.co/manual.pdf")).toBe(false)
  })

  it("ignores uploads (Firebase Storage paths) and empty refs", () => {
    // Firebase uploads resolve through resolveStorageUrl, never this predicate.
    expect(isDeadLegacyManualUrl("upload", "manuals/dishwasher/abc.pdf")).toBe(false)
    expect(isDeadLegacyManualUrl("url", "")).toBe(false)
  })

  it("treats an unparseable URL as not-dead (let normal resolution handle it)", () => {
    expect(isDeadLegacyManualUrl("url", "not a url at all")).toBe(false)
  })
})
