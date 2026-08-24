import { describe, it, expect } from "vitest"
import { collapseStores, suggestStores, SEED_STORES } from "./storeSuggestions"

describe("collapseStores — one home, one spelling per store", () => {
  it("merges casing and punctuation variants into a single entry", () => {
    const out = collapseStores(["Home Depot", "home depot", "HomeDepot"])
    expect(out).toHaveLength(1)
    expect(out[0].uses).toBe(3)
  })

  it("keeps the first spelling as the canonical one", () => {
    expect(collapseStores(["home depot", "Home Depot"])[0].value).toBe("home depot")
  })

  it("ranks by use, then alphabetically so ties are stable", () => {
    const out = collapseStores(["Costco", "Amazon", "Costco", "Best Buy"])
    expect(out.map((s) => s.value)).toEqual(["Costco", "Amazon", "Best Buy"])
  })

  it("ignores blanks, whitespace and nulls", () => {
    expect(collapseStores(["", "   ", null, undefined, "!!!"])).toEqual([])
  })

  it("trims before storing", () => {
    expect(collapseStores(["  Costco  "])[0].value).toBe("Costco")
  })
})

describe("suggestStores — help on the first item, normalise on the second", () => {
  it("offers the curated seed when the home has no history", () => {
    const out = suggestStores({ query: "", homeEntries: [] })
    expect(out.length).toBeGreaterThan(0)
    expect(SEED_STORES).toContain(out[0].value)
  })

  it("puts the home's own entries above the seed", () => {
    const out = suggestStores({ query: "", homeEntries: ["Abt", "Abt"] })
    expect(out[0]).toMatchObject({ value: "Abt", uses: 2 })
  })

  it("prefers a prefix match over a substring match", () => {
    const out = suggestStores({ query: "home", homeEntries: [] })
    expect(out[0].value).toBe("Home Depot")
  })

  it("still finds a store from the middle of its name", () => {
    const values = suggestStores({ query: "dep", homeEntries: [] }).map((s) => s.value)
    expect(values).toContain("Home Depot")
  })

  it("matches regardless of the punctuation the user types", () => {
    const values = suggestStores({ query: "lowes", homeEntries: [] }).map((s) => s.value)
    expect(values).toContain("Lowe's")
  })

  it("always offers the raw text as the last option", () => {
    const out = suggestStores({ query: "Bob's Appliance Barn", homeEntries: [] })
    expect(out.at(-1)).toMatchObject({ value: "Bob's Appliance Barn", isRaw: true })
  })

  it("does NOT offer a raw row that duplicates an exact suggestion", () => {
    const out = suggestStores({ query: "Home Depot", homeEntries: [] })
    expect(out.some((s) => s.isRaw)).toBe(false)
  })

  it("treats a differently-cased exact match as the same, not as raw", () => {
    const out = suggestStores({ query: "home depot", homeEntries: [] })
    expect(out.some((s) => s.isRaw)).toBe(false)
  })

  it("respects the limit, and the raw row does not consume a slot", () => {
    const out = suggestStores({ query: "", homeEntries: [], limit: 3 })
    expect(out).toHaveLength(3)
    const typed = suggestStores({ query: "zzz nowhere", homeEntries: [], limit: 3 })
    expect(typed.at(-1)?.isRaw).toBe(true)
  })

  it("normalises the second purchase — the whole point", () => {
    // First item saved "Home Depot"; the user starts typing it again.
    const out = suggestStores({ query: "Home De", homeEntries: ["Home Depot"] })
    expect(out[0]).toMatchObject({ value: "Home Depot", uses: 1 })
    expect(out.at(-1)).toMatchObject({ value: "Home De", isRaw: true })
  })

  it("never suggests a seed entry the home already uses, twice", () => {
    const out = suggestStores({ query: "costco", homeEntries: ["Costco"] })
    expect(out.filter((s) => s.value.toLowerCase() === "costco")).toHaveLength(1)
  })
})
