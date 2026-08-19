import { describe, it, expect } from "vitest"
import { buildMailto, SUPPORT_EMAIL } from "./feedback"

describe("buildMailto", () => {
  it("addresses the published support mailbox", () => {
    expect(buildMailto("problem", ["hi"])).toContain(`mailto:${SUPPORT_EMAIL}`)
  })

  it("labels a crash differently from a problem", () => {
    // The subject is how a crash gets triaged ahead of a feature request.
    expect(buildMailto("crash", [])).toContain(encodeURIComponent("Homehub crashed"))
    expect(buildMailto("problem", [])).toContain(encodeURIComponent("Homehub problem report"))
  })

  it("escapes newlines and ampersands in the body", () => {
    // An unescaped & truncates the body at the first one, silently — the
    // report arrives looking like the user just stopped typing.
    const url = buildMailto("problem", ["a & b", "second line"])
    expect(url).toContain("a%20%26%20b")
    expect(url).toContain("%0Asecond%20line")
    expect(url.split("&body=")).toHaveLength(2)
  })

  it("publishes a real address rather than a placeholder", () => {
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i)
    expect(SUPPORT_EMAIL).not.toMatch(/example|todo|changeme/i)
  })
})
