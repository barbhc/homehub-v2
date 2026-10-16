/**
 * Ask's labels say where things go in plain words (audit 2026-10-15):
 * "Save to knowledge base" named our feature, not the person's thing, and
 * "Scoped to:" was the code's word for what an answer is about.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const { ChatMessageBubble } = await import("./ChatMessageBubble")

const answer = (over: Record<string, unknown> = {}) => ({
  id: "a1", role: "assistant" as const, content: "A 20x25x5 media filter.", ...over,
})
const furnace = { item_unit_id: "item-a", display_name: "Carrier Infinity Furnace" }

describe("ChatMessageBubble — labels", () => {
  it("an answer about an item: 'About:' and 'Save to this item', saving to that item", () => {
    const onSaveFaq = vi.fn()
    render(<MemoryRouter><ChatMessageBubble message={answer({ inferredItem: furnace })} precedingQuestion="Filter size?" onSaveFaq={onSaveFaq} /></MemoryRouter>)
    expect(screen.getByText("About:", { exact: false })).toHaveTextContent("About: Carrier Infinity Furnace")
    expect(screen.queryByText(/Scoped to/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Save to this item" }))
    expect(onSaveFaq).toHaveBeenCalledWith("Filter size?", "A 20x25x5 media filter.", "item-a")
  })

  it("an item picked in the scope filter counts as the item too", () => {
    render(<MemoryRouter><ChatMessageBubble message={answer()} precedingQuestion="Filter size?" onSaveFaq={vi.fn()} activeFilterType="item" activeFilterValue="item-b" /></MemoryRouter>)
    expect(screen.getByRole("button", { name: "Save to this item" })).toBeInTheDocument()
  })

  it("no item yet: plain 'Save' — the dialog asks which", () => {
    render(<MemoryRouter><ChatMessageBubble message={answer()} precedingQuestion="Filter size?" onSaveFaq={vi.fn()} /></MemoryRouter>)
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
    expect(screen.queryByText(/knowledge base/)).toBeNull()
  })
})
