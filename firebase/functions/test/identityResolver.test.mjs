/**
 * identityResolver core tests — fixture fetches, no network. Verifies the
 * Icecat parse, Brave exact-match vs variant-mining behavior, title cleaning,
 * variant mining rules, fail-open error handling, and the sequential
 * first-hit-wins layer order (Icecat beats Brave; missing creds skip layers).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  icecatIdentity,
  braveIdentity,
  resolveExternalIdentity,
  cleanResultTitle,
  mineVariants,
  normalizeModel,
} from "../lib/firebase/functions/src/ai/identityResolver.js"

const jsonResponse = (body) => async () => ({ ok: true, status: 200, json: async () => body })
const httpError = (status) => async () => ({ ok: false, status, json: async () => ({}) })

// ── Icecat ────────────────────────────────────────────────────────────────────

test("icecat: parses Title + Category.Name.Value into a high-confidence identity", async () => {
  const fetchJson = jsonResponse({
    data: { GeneralInfo: { Title: "LG WM4000HWA washer", Category: { Name: { Value: "Washing Machines" } } } },
  })
  const id = await icecatIdentity(fetchJson, "user", "LG", "WM4000HWA")
  assert.equal(id.name, "LG WM4000HWA washer")
  assert.equal(id.rawCategory, "Washing Machines")
  assert.equal(id.source, "icecat")
  assert.equal(id.confidence, "high")
})

test("icecat: unknown product / schema surprise / HTTP error → null (fail-open)", async () => {
  assert.equal(await icecatIdentity(jsonResponse({ msg: "not found" }), "u", "B", "M"), null)
  assert.equal(await icecatIdentity(jsonResponse({ data: { GeneralInfo: {} } }), "u", "B", "M"), null)
  assert.equal(await icecatIdentity(httpError(403), "u", "B", "M"), null)
  assert.equal(
    await icecatIdentity(async () => {
      throw new Error("network down")
    }, "u", "B", "M"),
    null,
  )
})

// ── Brave ─────────────────────────────────────────────────────────────────────

const braveBody = (results) => ({ web: { results } })

test("brave: exact model token in a title → medium identity with cleaned name", async () => {
  const fetchJson = jsonResponse(
    braveBody([
      { title: "Some unrelated result", description: "" },
      { title: "LG WM4000HWA: Front Load Washer with TurboWash | LG USA", description: "4.5 cu ft" },
    ]),
  )
  const { identity, variants } = await braveIdentity(fetchJson, "key", "LG", "wm4000hwa")
  assert.equal(identity.name, "LG WM4000HWA: Front Load Washer with TurboWash")
  assert.equal(identity.source, "brave")
  assert.equal(identity.confidence, "medium")
  assert.ok(identity.rawCategory.includes("Front Load Washer"))
  assert.equal(variants.length, 0) // exact hit → no variant noise
})

test("brave: partial model → no identity, mined family variants instead", async () => {
  const fetchJson = jsonResponse(
    braveBody([
      { title: "LG WM4000HWA Front Load Washer - White", description: "" },
      { title: "LG WM4000HBA washer in black steel", description: "compare WM4000HBA vs WM4000HWA" },
    ]),
  )
  const { identity, variants } = await braveIdentity(fetchJson, "key", "LG", "WM4000H")
  assert.equal(identity, null)
  const models = variants.map((v) => v.model).sort()
  assert.deepEqual(models, ["WM4000HBA", "WM4000HWA"])
})

test("brave: token-exact hit on a PARTIAL model (extensions present) → variants, not identity", async () => {
  // The prod failure this pins: typing "SMD24" matched a retailer search page
  // literally titled "Smd24 at US Appliance" and confidently called it the
  // product. When longer family models are mined from the same results, the
  // typed model is a partial and the pick must win.
  const fetchJson = jsonResponse(
    braveBody([
      { title: "Smd24 at US Appliance", description: "Shop Sharp SMD2470AS and SMD2470ASY drawer microwaves" },
      { title: "Sharp SMD2470AS Microwave Drawer", description: "" },
    ]),
  )
  const { identity, variants } = await braveIdentity(fetchJson, "key", "Sharp", "SMD24")
  assert.equal(identity, null)
  const models = variants.map((v) => v.model).sort()
  assert.deepEqual(models, ["SMD2470AS", "SMD2470ASY"])
})

test("brave: HTTP error / empty results / thrown fetch → fail-open empty", async () => {
  assert.deepEqual(await braveIdentity(httpError(429), "k", "B", "MODEL1"), { identity: null, variants: [] })
  assert.deepEqual(await braveIdentity(jsonResponse(braveBody([])), "k", "B", "MODEL1"), {
    identity: null,
    variants: [],
  })
  assert.deepEqual(
    await braveIdentity(async () => {
      throw new Error("timeout")
    }, "k", "B", "MODEL1"),
    { identity: null, variants: [] },
  )
})

// ── Title cleaning + variant mining ──────────────────────────────────────────

test("cleanResultTitle strips pipe/site chrome but never model-number dashes", () => {
  assert.equal(cleanResultTitle("Coway AP-1512HH Mighty Air Purifier | Best Buy"), "Coway AP-1512HH Mighty Air Purifier")
  assert.equal(cleanResultTitle("Coway AP-1512HH Mighty - Amazon.com"), "Coway AP-1512HH Mighty")
  // The dash suffix here contains a digit → looks like part of the product, kept.
  assert.equal(cleanResultTitle("Ninja CREAMi Deluxe - NC501"), "Ninja CREAMi Deluxe - NC501")
})

test("mineVariants: extends-only, deduped, short prefixes refuse to mine", () => {
  const hay = ["LG WM4000HWA and WM4000HBA compared", "also WM4000HWA again", "unrelated RF28R7551SR"]
  const models = mineVariants("WM4000H", hay).map((v) => v.model).sort()
  assert.deepEqual(models, ["WM4000HBA", "WM4000HWA"])
  assert.deepEqual(mineVariants("WM4", hay), []) // prefix too short to mean anything
  assert.deepEqual(mineVariants("RF28R7551SR", ["RF28R7551SR exact only"]), []) // no extension → none
})

test("normalizeModel ignores case, spaces, and dashes", () => {
  assert.equal(normalizeModel("wm-4000 hwa"), "WM4000HWA")
})

// ── Layer order ───────────────────────────────────────────────────────────────

test("resolveExternalIdentity: icecat wins when it hits; brave never called", async () => {
  let braveCalled = false
  const fetchJson = async (url) => {
    if (url.includes("icecat")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { GeneralInfo: { Title: "Hit", Category: { Name: { Value: "Cat" } } } } }),
      }
    }
    braveCalled = true
    return { ok: true, status: 200, json: async () => braveBody([]) }
  }
  const res = await resolveExternalIdentity(
    { fetchJson, icecatUsername: "u", braveApiKey: "k" },
    "LG",
    "WM4000HWA",
  )
  assert.equal(res.identity.source, "icecat")
  assert.equal(braveCalled, false)
})

test("resolveExternalIdentity: icecat miss falls through to brave; no creds → empty", async () => {
  const fetchJson = async (url) => {
    if (url.includes("icecat")) return { ok: false, status: 404, json: async () => ({}) }
    return {
      ok: true,
      status: 200,
      json: async () => braveBody([{ title: "LG WM4000HWA washer", description: "" }]),
    }
  }
  const viaBrave = await resolveExternalIdentity(
    { fetchJson, icecatUsername: "u", braveApiKey: "k" },
    "LG",
    "WM4000HWA",
  )
  assert.equal(viaBrave.identity.source, "brave")

  const dormant = await resolveExternalIdentity(
    { fetchJson, icecatUsername: null, braveApiKey: null },
    "LG",
    "WM4000HWA",
  )
  assert.deepEqual(dormant, { identity: null, variants: [] })
})
