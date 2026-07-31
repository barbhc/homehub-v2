/**
 * findManual ranking — no network. The stakes here are asymmetric: attaching the
 * WRONG model's manual silently poisons every task generated from it, and the
 * user has no way to tell. So the tests care most about what gets rejected and
 * what gets ranked first.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { isPdfCandidate, looksOfficial, rankCandidates } from "../lib/firebase/functions/src/products/findManual.js"

// ── what counts as a fetchable manual ────────────────────────────────────────

test("isPdfCandidate: accepts real PDF paths, including CDN query strings", () => {
  assert.equal(isPdfCandidate("https://media3.bosch-home.com/Documents/9001234567.pdf"), true)
  assert.equal(isPdfCandidate("https://www.lg.com/us/manuals/WM4000HWA.pdf?v=2"), true)
  assert.equal(isPdfCandidate("https://example.com/pdf/manual-1234"), true)
})

test("isPdfCandidate: rejects non-PDF pages", () => {
  assert.equal(isPdfCandidate("https://www.lg.com/us/support/product/lg-WM4000HWA"), false)
  assert.equal(isPdfCandidate("https://www.youtube.com/watch?v=abc"), false)
})

test("isPdfCandidate: SSRF guard rejects internal and non-http targets", () => {
  // The whole point of routing through isAllowedUrl — a manual URL is later
  // fetched server-side by the parser.
  assert.equal(isPdfCandidate("http://169.254.169.254/latest/meta-data/manual.pdf"), false)
  assert.equal(isPdfCandidate("http://localhost:8080/manual.pdf"), false)
  assert.equal(isPdfCandidate("file:///etc/passwd.pdf"), false)
  assert.equal(isPdfCandidate("not a url"), false)
})

// ── manufacturer vs aggregator ───────────────────────────────────────────────

test("looksOfficial: manufacturer hosts are official", () => {
  assert.equal(looksOfficial("media3.bosch-home.com", "Bosch"), true)
  assert.equal(looksOfficial("support.nespresso.com", "Nespresso"), true)
})

test("looksOfficial: SHORT brands work — the owner has LG and GE appliances", () => {
  assert.equal(looksOfficial("lg.com", "LG"), true)
  assert.equal(looksOfficial("www.lg.com", "LG"), true)
  assert.equal(looksOfficial("products.geappliances.com", "GE"), false, "'ge' inside 'geappliances' is not a label match")
  assert.equal(looksOfficial("ge.com", "GE"), true)
  // ...and the false positives a substring match would have produced:
  assert.equal(looksOfficial("bloglg.example.com", "LG"), false)
  assert.equal(looksOfficial("collegehumor.com", "GE"), false)
})

test("looksOfficial: manual farms are never official even if they name the brand", () => {
  assert.equal(looksOfficial("bosch.manualslib.com", "Bosch"), false)
  assert.equal(looksOfficial("www.manualsonline.com", "Bosch"), false)
  assert.equal(looksOfficial("scribd.com", "Bosch"), false)
})

// ── ranking ──────────────────────────────────────────────────────────────────

test("rankCandidates: manufacturer PDF outranks an aggregator PDF", () => {
  const out = rankCandidates(
    [
      { title: "Bosch SHPM65Z55N manual", url: "https://www.manualslib.com/bosch/shpm65z55n.pdf" },
      { title: "Bosch Dishwasher Use and Care", url: "https://media3.bosch-home.com/Documents/SHPM65Z55N.pdf" },
    ],
    "Bosch",
    "SHPM65Z55N",
  )
  assert.equal(out[0].host, "media3.bosch-home.com")
  assert.equal(out[0].official, true)
  assert.equal(out[1].official, false)
})

test("rankCandidates: within the same tier, a URL naming the model wins", () => {
  const out = rankCandidates(
    [
      { title: "Generic washer manual", url: "https://manualslib.com/generic/washer-guide.pdf" },
      { title: "LG WM4000HWA manual", url: "https://manualslib.com/lg/WM4000HWA.pdf" },
    ],
    "LG",
    "WM4000HWA",
  )
  assert.match(out[0].url, /WM4000HWA/)
})

test("rankCandidates: drops non-PDFs, dedupes, and caps the list", () => {
  const results = [
    { title: "support page", url: "https://www.lg.com/support/wm4000hwa" },
    { title: "dup", url: "https://a.com/m.pdf" },
    { title: "dup again", url: "https://a.com/m.pdf" },
    { title: "b", url: "https://b.com/m.pdf" },
    { title: "c", url: "https://c.com/m.pdf" },
    { title: "d", url: "https://d.com/m.pdf" },
    { title: "e", url: "https://e.com/m.pdf" },
  ]
  const out = rankCandidates(results, "LG", "WM4000HWA")
  assert.ok(out.length <= 4, "caps at 4")
  assert.equal(new Set(out.map((c) => c.url)).size, out.length, "no duplicates")
  assert.ok(!out.some((c) => c.url.includes("/support/")), "no non-PDF pages")
})

test("rankCandidates: empty in, empty out (no manual online is a valid answer)", () => {
  assert.deepEqual(rankCandidates([], "Bosch", "SHPM65Z55N"), [])
  assert.deepEqual(rankCandidates([{ title: "x", url: "https://x.com/page" }], "Bosch", "SHPM65Z55N"), [])
})

test("rankCandidates: surfaces the host, because that's how a person judges trust", () => {
  const out = rankCandidates([{ title: "m", url: "https://media3.bosch-home.com/a.pdf" }], "Bosch", "SHPM65Z55N")
  assert.equal(out[0].host, "media3.bosch-home.com")
})
