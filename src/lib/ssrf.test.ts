/**
 * SSRF guard tests, with the emphasis on REDIRECTS.
 *
 * isAllowedUrl was always called on the URL the user supplied — and that was the
 * whole check. Because `fetch` follows redirects by default, an attacker-owned
 * host could answer 302 -> http://169.254.169.254/latest/meta-data/ and the
 * runtime would chase it with the guard none the wiser. These tests pin the
 * per-hop re-validation that closes it.
 */
import { describe, it, expect, vi } from "vitest"
import { isAllowedUrl, fetchGuarded, MAX_REDIRECTS } from "../../shared/parse/ssrf"

/** A fetch stand-in driven by a scripted list of hops. */
function scriptedFetch(hops: Array<{ status: number; location?: string; body?: string }>) {
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = []
  let i = 0
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), redirect: init?.redirect })
    const hop = hops[Math.min(i++, hops.length - 1)]
    return {
      status: hop.status,
      ok: hop.status >= 200 && hop.status < 300,
      headers: { get: (h: string) => (h.toLowerCase() === "location" ? (hop.location ?? null) : null) },
      text: async () => hop.body ?? "",
    } as unknown as Response
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

describe("isAllowedUrl (unchanged behaviour)", () => {
  it("blocks the cloud metadata endpoint, loopback, and RFC1918", () => {
    expect(isAllowedUrl("http://169.254.169.254/latest/meta-data/")).toBe(false)
    expect(isAllowedUrl("http://127.0.0.1:8080/")).toBe(false)
    expect(isAllowedUrl("http://10.0.0.5/")).toBe(false)
    expect(isAllowedUrl("http://192.168.1.1/")).toBe(false)
    expect(isAllowedUrl("http://172.16.0.1/")).toBe(false)
    expect(isAllowedUrl("http://localhost/")).toBe(false)
    expect(isAllowedUrl("file:///etc/passwd")).toBe(false)
  })

  it("allows ordinary public https URLs", () => {
    expect(isAllowedUrl("https://example.com/manual.pdf")).toBe(true)
  })
})

describe("fetchGuarded — redirects are re-validated per hop", () => {
  it("blocks a redirect into the metadata endpoint (the actual hole)", async () => {
    const { impl } = scriptedFetch([
      { status: 302, location: "http://169.254.169.254/latest/meta-data/" },
      { status: 200, body: "SECRET" },
    ])
    await expect(fetchGuarded("https://evil.example.com/manual.pdf", {}, impl)).rejects.toThrow(
      /redirect to a private or internal address/i
    )
  })

  it("blocks a redirect to an RFC1918 host", async () => {
    const { impl } = scriptedFetch([{ status: 301, location: "http://10.1.2.3/admin" }])
    await expect(fetchGuarded("https://evil.example.com/x", {}, impl)).rejects.toThrow(/redirect/i)
  })

  it("never issues the blocked request at all", async () => {
    const { impl, calls } = scriptedFetch([{ status: 302, location: "http://127.0.0.1:9000/" }])
    await expect(fetchGuarded("https://evil.example.com/x", {}, impl)).rejects.toThrow()
    expect(calls.map((c) => c.url)).toEqual(["https://evil.example.com/x"])
  })

  it("always asks for manual redirects — that is what keeps the guard in the loop", async () => {
    const { impl, calls } = scriptedFetch([{ status: 200 }])
    await fetchGuarded("https://example.com/a.pdf", {}, impl)
    expect(calls[0].redirect).toBe("manual")
  })

  it("still follows a legitimate public redirect chain", async () => {
    const { impl, calls } = scriptedFetch([
      { status: 301, location: "https://www.example.com/manual.pdf" },
      { status: 200, body: "%PDF" },
    ])
    const res = await fetchGuarded("http://example.com/manual.pdf", {}, impl)
    expect(res.status).toBe(200)
    expect(calls.map((c) => c.url)).toEqual([
      "http://example.com/manual.pdf",
      "https://www.example.com/manual.pdf",
    ])
  })

  it("resolves a RELATIVE Location against the hop it came from", async () => {
    const { impl, calls } = scriptedFetch([
      { status: 302, location: "/docs/manual.pdf" },
      { status: 200 },
    ])
    await fetchGuarded("https://cdn.example.com/a/b.pdf", {}, impl)
    expect(calls[1].url).toBe("https://cdn.example.com/docs/manual.pdf")
  })

  it("a relative Location cannot smuggle in a private host", async () => {
    // Protocol-relative //169.254.169.254 resolves to the metadata endpoint.
    const { impl } = scriptedFetch([{ status: 302, location: "//169.254.169.254/" }])
    await expect(fetchGuarded("https://evil.example.com/x", {}, impl)).rejects.toThrow(/redirect/i)
  })

  it("gives up after MAX_REDIRECTS rather than looping forever", async () => {
    const { impl } = scriptedFetch([{ status: 302, location: "https://example.com/next" }])
    await expect(fetchGuarded("https://example.com/start", {}, impl)).rejects.toThrow(/too many redirects/i)
    expect(MAX_REDIRECTS).toBe(3)
  })

  it("rejects a private URL on the first hop too", async () => {
    const { impl, calls } = scriptedFetch([{ status: 200 }])
    await expect(fetchGuarded("http://169.254.169.254/", {}, impl)).rejects.toThrow(/private or internal/i)
    expect(calls).toHaveLength(0)
  })

  it("returns a 3xx with no Location as-is instead of hanging", async () => {
    const { impl } = scriptedFetch([{ status: 302 }])
    const res = await fetchGuarded("https://example.com/x", {}, impl)
    expect(res.status).toBe(302)
  })

  it("treats 304 as a response, not a redirect", async () => {
    const { impl } = scriptedFetch([{ status: 304 }])
    const res = await fetchGuarded("https://example.com/x", {}, impl)
    expect(res.status).toBe(304)
  })
})
