import { describe, it, expect } from "vitest"
import { buildChatMessages, PDF_ONLY_TURN_TEXT, type PdfDoc } from "../chatMessages"

const pdf = (title: string): PdfDoc => ({
  type: "document",
  source: { type: "base64", media_type: "application/pdf", data: "cGRm" },
  title,
})

// The cache only hits if system + PDFs form the SAME prefix on every turn, so
// the PDFs must lead the conversation and must never move to the latest turn.
describe("buildChatMessages", () => {
  it("first question: PDFs then the question, breakpoint on the last PDF", () => {
    const m = buildChatMessages([], "How do I descale?", [pdf("A"), pdf("B")])
    expect(m).toHaveLength(1)
    const blocks = m[0].content as Array<Record<string, unknown>>
    expect(blocks.map((b) => b.type)).toEqual(["document", "document", "text"])
    expect(blocks[0].cache_control).toBeUndefined()
    expect(blocks[1].cache_control).toEqual({ type: "ephemeral" })
    expect(blocks[2]).toEqual({ type: "text", text: "How do I descale?" })
  })

  it("follow-up: PDFs sit in the FIRST user turn, latest turn is text only", () => {
    const m = buildChatMessages(
      [{ role: "user", content: "q1" }, { role: "assistant", content: "a1" }],
      "q2",
      [pdf("A")],
    )
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"])
    const first = m[0].content as Array<Record<string, unknown>>
    expect(first.map((b) => b.type)).toEqual(["document", "text"])
    expect(first[0].cache_control).toEqual({ type: "ephemeral" })
    expect(first[1]).toEqual({ type: "text", text: "q1" })
    expect(m[2].content).toEqual([{ type: "text", text: "q2" }])
  })

  it("the cached prefix (first turn's PDF blocks) is identical across turns", () => {
    const t1 = buildChatMessages([], "q1", [pdf("A")])
    const t2 = buildChatMessages([{ role: "user", content: "q1" }, { role: "assistant", content: "a1" }], "q2", [pdf("A")])
    const prefix = (m: ReturnType<typeof buildChatMessages>) => (m[0].content as unknown[]).slice(0, 1)
    expect(prefix(t2)).toEqual(prefix(t1))
  })

  it("history trimmed to start on an assistant turn gets a leading PDF-only user turn", () => {
    const m = buildChatMessages([{ role: "assistant", content: "a0" }], "q1", [pdf("A")])
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"])
    const first = m[0].content as Array<Record<string, unknown>>
    expect(first[0].type).toBe("document")
    expect(first[1]).toEqual({ type: "text", text: PDF_ONLY_TURN_TEXT })
  })

  it("no PDFs: history plus the text turn, no cache_control anywhere", () => {
    const m = buildChatMessages([{ role: "user", content: "q1" }, { role: "assistant", content: "a1" }], "q2", [])
    expect(m).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: [{ type: "text", text: "q2" }] },
    ])
  })
})
