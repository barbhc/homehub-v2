/**
 * The CSP in firebase.json pins the two inline <script> blocks in index.html by
 * SHA-256 hash. Both are load-bearing and deliberately inline — the theme class
 * has to be set before first paint, and the boot-splash safety timeout has to
 * arm before the bundle parses — so neither can move to a file without putting
 * a network request back on the cold-start path this file has been tuned to
 * keep clear.
 *
 * Hashes are exact. Edit either script by one character and the browser silently
 * refuses to run it: the app boots in the wrong theme, or the splash never
 * clears on a hang. Nothing in a build or a type-check notices, and it only
 * shows up in production.
 *
 * So this test recomputes the hashes from index.html and asserts the CSP still
 * carries them. If it fails, the fix is to update the CSP — never to add
 * 'unsafe-inline', which is what the hashes exist to avoid.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

// Paths are repo-root relative, matching the other static guards in this dir.
const html = readFileSync("index.html", "utf8")
const firebaseJson = JSON.parse(readFileSync("firebase.json", "utf8"))

function inlineScriptHashes(): string[] {
  // A <script> with a src attribute is not inline and needs no hash.
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => "sha256-" + createHash("sha256").update(m[1], "utf8").digest("base64"),
  )
}

function cspValue(): string {
  const block = firebaseJson.hosting.headers.find(
    (h: { source: string }) => h.source === "**",
  )
  const header = block?.headers.find(
    (h: { key: string }) => h.key === "Content-Security-Policy",
  )
  return header?.value ?? ""
}

const directive = (name: string): string => {
  const found = cspValue()
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(name + " "))
  return found ?? ""
}

describe("Content-Security-Policy", () => {
  it("is served on every path", () => {
    expect(cspValue()).not.toBe("")
  })

  it("pins every inline script in index.html by hash", () => {
    const hashes = inlineScriptHashes()
    // If this drops to zero the regex stopped matching and every assertion
    // below would pass vacuously.
    expect(hashes.length).toBeGreaterThan(0)
    const scriptSrc = directive("script-src")
    for (const h of hashes) expect(scriptSrc).toContain(h)
  })

  it("carries no stale hashes for scripts that no longer exist", () => {
    const current = new Set(inlineScriptHashes())
    const inPolicy = [...directive("script-src").matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1])
    for (const h of inPolicy) expect(current).toContain(h)
  })

  it("never allows inline or eval'd script", () => {
    const scriptSrc = directive("script-src")
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
  })

  it("locks down the directives that cost the most when missing", () => {
    expect(directive("object-src")).toBe("object-src 'none'")
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'")
    expect(directive("base-uri")).toBe("base-uri 'self'")
    expect(directive("default-src")).toBe("default-src 'self'")
  })

  it("allows the origins the app genuinely talks to", () => {
    const connect = directive("connect-src")
    for (const origin of [
      "https://*.googleapis.com",   // firestore, storage, identitytoolkit, securetoken
      "https://*.cloudfunctions.net", // callables
      "https://us.i.posthog.com",   // analytics
    ]) {
      expect(connect).toContain(origin)
    }
    // pdfjs instantiates its worker from a blob URL.
    expect(directive("worker-src")).toContain("blob:")
    // Product-photo search renders thumbnails from arbitrary retailer hosts.
    expect(directive("img-src")).toContain("https:")
  })

  /**
   * Apple sign-in on the web runs signInWithPopup, falling back to
   * signInWithRedirect when a popup is blocked. Both load Firebase Auth's gapi
   * bootstrap from apis.google.com and embed the auth helper iframe served from
   * the project's authDomain, so BOTH halves of that fallback chain need the
   * same two sources — allowing one and not the other fixes nothing.
   *
   * Until 2026-08-27 the policy allowed neither: script-src had no
   * apis.google.com, and frame-src was never declared at all, so the iframe
   * fell back to default-src 'self'. Both were confirmed blocked against
   * production, not inferred. Native iOS signs in through the OS sheet and
   * never touches this path, which is why no tester ever reported it.
   */
  it("allows the two sources Firebase Auth's web sign-in needs", () => {
    expect(directive("script-src")).toContain("https://apis.google.com")
    expect(directive("frame-src")).toContain("https://homehub-2068d.firebaseapp.com")
  })

  it("ships the other headers that cost nothing to get right", () => {
    const block = firebaseJson.hosting.headers.find((h: { source: string }) => h.source === "**")
    const keys = block.headers.map((h: { key: string }) => h.key)
    expect(keys).toContain("X-Content-Type-Options")
    expect(keys).toContain("Referrer-Policy")
  })
})
