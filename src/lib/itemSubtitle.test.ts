import { describe, expect, it } from "vitest"
import { itemSubtitle } from "./itemSubtitle"

describe("itemSubtitle — only speaks when it adds something", () => {
  it("suppresses the reported echo: composed name over brand · model", () => {
    // #139 composes a blank name as "Brand Model"; the header then repeated it.
    expect(itemSubtitle("LG DLGX3901B", "LG", "DLGX3901B")).toBeNull()
  })

  it("suppresses regardless of separators and case", () => {
    expect(itemSubtitle("lg dlgx3901b", "LG", "DLGX3901B")).toBeNull()
    expect(itemSubtitle("LG-DLGX3901B", "LG", "DLGX3901B")).toBeNull()
  })

  it("suppresses when the name carries MORE than brand + model", () => {
    expect(itemSubtitle("LG DLGX3901B laundry dryer", "LG", "DLGX3901B")).toBeNull()
  })

  it("shows for a name that does not contain the identity", () => {
    // The pre-#139 normal case: a hand-typed name.
    expect(itemSubtitle("Kitchen dryer", "LG", "DLGX3901B")).toBe("LG · DLGX3901B")
  })

  it("shows when only PART of the identity is in the name", () => {
    // The name says the brand; the model is still new information.
    expect(itemSubtitle("LG dryer", "LG", "DLGX3901B")).toBe("LG · DLGX3901B")
  })

  it("handles missing pieces without inventing a separator", () => {
    expect(itemSubtitle("Dryer", "LG", null)).toBe("LG")
    expect(itemSubtitle("Dryer", null, "DLGX3901B")).toBe("DLGX3901B")
    expect(itemSubtitle("Dryer", null, null)).toBeNull()
    expect(itemSubtitle("Dryer", "  ", "")).toBeNull()
  })
})
