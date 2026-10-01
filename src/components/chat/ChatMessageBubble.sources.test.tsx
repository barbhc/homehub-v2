/**
 * Ask's sources: an answer drawn from the household's own note says so —
 * "Your note · House" — instead of posing as a manual excerpt.
 */
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const { ChatMessageBubble } = await import("./ChatMessageBubble")

const answer = (sources: { title: string; item_name: string; source_type: "manual" | "web" | "ai" | "note"; url?: string }[]) => ({
  id: "m1", role: "assistant" as const, content: "It's under the kitchen sink — the blue lever.", sources,
})

describe("ChatMessageBubble — sources", () => {
  it("a note source reads 'Your note · <scope>'", () => {
    render(<MemoryRouter><ChatMessageBubble message={answer([
      { title: "Your note", item_name: "House", source_type: "note" },
      { title: "Your note", item_name: "Kitchen", source_type: "note" },
    ])} /></MemoryRouter>)
    expect(screen.getByText("Your note · House")).toBeInTheDocument()
    expect(screen.getByText("Your note · Kitchen")).toBeInTheDocument()
  })

  it("a manual source still reads as the item and its excerpt", () => {
    render(<MemoryRouter><ChatMessageBubble message={answer([
      { title: "Replacing the filter", item_name: "Carrier Infinity Furnace", source_type: "manual" },
    ])} /></MemoryRouter>)
    expect(screen.getByText("Carrier Infinity Furnace — Replacing the filter")).toBeInTheDocument()
    expect(screen.queryByText(/Your note/)).toBeNull()
  })
})
