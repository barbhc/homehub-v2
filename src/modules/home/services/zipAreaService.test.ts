import { describe, expect, it } from "vitest"
import { lookupZipArea, toHomeArea } from "./zipAreaService"

describe("toHomeArea: what the home keeps from a zip", () => {
  it("records whether termites are common in the county (VA list), so the monthly card need not ask", async () => {
    const dallas = await lookupZipArea("75201")
    const minneapolis = await lookupZipArea("55401")
    if (dallas.kind !== "found" || minneapolis.kind !== "found") throw new Error("zip table is missing a sample zip")
    expect(toHomeArea(dallas.area).termites).toBe(true)
    expect(toHomeArea(minneapolis.area).termites).toBe(false)
  })
})
