import { describe, expect, it } from "vitest"
import { buildGeneralRequest, generalSystemPrompt, homeFactsBlock, type HomeFacts } from "../generalGuidance"
import { SAFETY_RULES } from "../chatMessages"

const dallas: HomeFacts = {
  zip: "75201", county: "Dallas County", hardinessZone: "8b", freezeRisk: true, hazards: [], homeType: "house", ownership: "own",
  itemNames: [], taskTitles: ["Test smoke and CO alarms"], scopeName: null,
}

describe("homeFactsBlock", () => {
  it("says the winter low in words, never the zone code", () => {
    const b = homeFactsBlock(dallas)
    expect(b).toContain("- Location: Dallas County, zip 75201")
    expect(b).toContain("- Typical coldest winter night: 15 to 20°F")
    expect(b).not.toContain("8b")
    expect(b).toContain("- Home: house, owned")
    expect(b).toContain("- Already on their task list: Test smoke and CO alarms")
  })
  it("leaves out what it does not know, and is empty with nothing at all", () => {
    expect(homeFactsBlock({ ...dallas, county: null, zip: null, hardinessZone: null, freezeRisk: null, homeType: null, ownership: null, taskTitles: [] })).toBe("")
  })
  it("names a renter and the item asked about", () => {
    const b = homeFactsBlock({ ...dallas, ownership: "rent", itemNames: ["Dishwasher"], scopeName: "Dishwasher" })
    expect(b).toContain("- Home: house, rented")
    expect(b).toContain("- Appliances recorded (no manual in Homehub): Dishwasher")
    expect(b).toContain("- The question is about: Dishwasher")
  })
})

describe("buildGeneralRequest", () => {
  it("carries the safety rules, the question, then the facts — and no documents", () => {
    const { params, meta } = buildGeneralRequest({ question: "Before the first freeze?", history: [], facts: dallas, webContextBlock: "" })
    expect(params.system).toBe(generalSystemPrompt({ webSearch: false }))
    expect(params.system).toContain(SAFETY_RULES)
    expect(params.system).toContain("Never say anything comes from their manual or their notes")
    const last = params.messages[params.messages.length - 1]
    expect(last.content).toEqual([{ type: "text", text: `Before the first freeze?\n\n${homeFactsBlock(dallas)}` }])
    expect(meta.pdfs).toBe(0)
  })
  it("drops an opening assistant turn so the roles start with the user", () => {
    const { params, meta } = buildGeneralRequest({
      question: "And the gutters?",
      history: [{ role: "assistant", content: "Earlier answer" }, { role: "user", content: "Q" }, { role: "assistant", content: "A" }],
      facts: dallas,
      webContextBlock: "",
    })
    expect(params.messages[0].role).toBe("user")
    expect(meta.historyTurns).toBe(2)
    expect(meta.droppedHistoryTurns).toBe(1)
  })
})
