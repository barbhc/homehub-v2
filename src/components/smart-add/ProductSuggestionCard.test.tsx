/**
 * The reported bug, as a test: a tester saw "Power (W) 700 ✓ Applied" sitting
 * directly above a Wattage field reading 1690. "Applied" was tracked in a Set of
 * tapped chips, so it described a click rather than the form — and could not
 * notice that the value had landed on a key the form does not render.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ProductSuggestionCard } from "./ProductSuggestionCard"
import type { ProductLookupCandidate } from "@/modules/inventory/services/productLookupService"

const wattage: ProductLookupCandidate = {
  key: "wattage",
  label: "Wattage",
  value: 700,
  rationale: "Ninja DZ201 product specifications listing",
}

function setup(currentValues: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const props = {
    candidates: [wattage],
    knowledgeConfidence: "high" as const,
    currentValues,
    onApply: vi.fn(),
    onRemove: vi.fn(),
    onDismissCandidate: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  }
  render(<ProductSuggestionCard {...props} />)
  return props
}

describe("ProductSuggestionCard", () => {
  it("does NOT claim Applied when the form holds a different value", () => {
    setup({ wattage: 1690 })
    expect(screen.queryByRole("button", { name: /applied/i })).toBeNull()
  })

  it("shows the conflict with both numbers and a real choice", () => {
    setup({ wattage: 1690 })
    expect(screen.getByText(/1690/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /keep mine/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /use 700/i })).toBeInTheDocument()
  })

  it("'Keep mine' drops the suggestion without touching the user's value", async () => {
    const props = setup({ wattage: 1690 })
    await userEvent.click(screen.getByRole("button", { name: /keep mine/i }))
    expect(props.onDismissCandidate).toHaveBeenCalledWith("wattage")
    expect(props.onApply).not.toHaveBeenCalled()
  })

  it("says Applied only when the form actually holds the suggested value", () => {
    setup({ wattage: 700 })
    expect(screen.getByRole("button", { name: /applied/i })).toBeInTheDocument()
  })

  it("matches across the string/number boundary a number input introduces", () => {
    setup({ wattage: "700" })
    expect(screen.getByRole("button", { name: /applied/i })).toBeInTheDocument()
  })

  it("offers a plain Apply when the field is empty", () => {
    setup({})
    expect(screen.getByRole("button", { name: /^apply$/i })).toBeInTheDocument()
  })

  it("states the source instead of asserting confidence we have not verified", () => {
    setup({})
    expect(screen.getByText(/not checked against the manufacturer/i)).toBeInTheDocument()
    expect(screen.queryByText(/high confidence/i)).toBeNull()
  })

  it("shows the whole citation rather than truncating it mid-word", () => {
    setup({})
    expect(screen.getByText(/Ninja DZ201 product specifications listing/)).toBeInTheDocument()
  })
})
