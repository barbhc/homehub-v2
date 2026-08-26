/**
 * IdentityCard state tests — every unhappy path the design promises must
 * actually render: found (explicit apply only), fuzzy (variants + None of
 * these), applied (Undo / Not my product), miss (quiet, with snap assist).
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { IdentityCard } from "./IdentityCard"
import type { ProductIdentity } from "@/modules/inventory/services/productLookupService"

const identity: ProductIdentity = {
  name: "LG WM4000HWA Front Load Washer",
  rawCategory: "washing machine",
  source: "icecat",
  confidence: "high",
}

describe("IdentityCard", () => {
  it("loading: spinner line", () => {
    render(<IdentityCard state="loading" />)
    expect(screen.getByText("Looking it up…")).toBeInTheDocument()
  })

  it("found: name, source, and an explicit Use this button", () => {
    const onUse = vi.fn()
    render(<IdentityCard state="found" identity={identity} categoryLabel="Washer" onUse={onUse} />)
    expect(screen.getByText("We found this item")).toBeInTheDocument()
    expect(screen.getByText("LG WM4000HWA Front Load Washer")).toBeInTheDocument()
    expect(screen.getByText("Washer")).toBeInTheDocument()
    expect(screen.getByText(/Icecat product data/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Use this/ }))
    expect(onUse).toHaveBeenCalledOnce()
  })

  it("fuzzy: lists variants with differentiators + None of these", () => {
    const onPick = vi.fn()
    const onNone = vi.fn()
    render(
      <IdentityCard
        state="fuzzy"
        variants={[
          { model: "WM4000HWA", differentiator: "White" },
          { model: "WM4000HBA", differentiator: null },
        ]}
        onPickVariant={onPick}
        onNoneOfThese={onNone}
      />,
    )
    expect(screen.getByText("Which one is yours?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /WM4000HWA/ }))
    expect(onPick).toHaveBeenCalledWith("WM4000HWA")
    fireEvent.click(screen.getByRole("button", { name: "None of these" }))
    expect(onNone).toHaveBeenCalledOnce()
  })

  it("applied: Undo and Not my product both wired", () => {
    const onUndo = vi.fn()
    const onNotMine = vi.fn()
    render(<IdentityCard state="applied" identity={identity} onUndo={onUndo} onNotMine={onNotMine} />)
    expect(screen.getByText("Using this")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }))
    expect(onUndo).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Not my product" }))
    expect(onNotMine).toHaveBeenCalledOnce()
  })

  it("miss: quiet copy, no red, snap-label assist when offered", () => {
    const onSnap = vi.fn()
    render(<IdentityCard state="miss" onSnapLabel={onSnap} />)
    expect(screen.getByText("We don’t recognize this one")).toBeInTheDocument()
    expect(screen.getByText(/we’ll use exactly what you typed/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Snap the label/ }))
    expect(onSnap).toHaveBeenCalledOnce()
  })

  it("miss without a snap handler renders no button", () => {
    render(<IdentityCard state="miss" />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})

/**
 * HH-138 — "I took a photo of the label of my dishwasher and it found the model
 * however it said that it found the manual."
 *
 * The resolver returned a web page's <title>. The card printed it verbatim, so
 * the identify screen announced a manual it had never looked for.
 */
describe("a resolver string that is a page title, not a product", () => {
  const pageTitle: ProductIdentity = {
    name: "Bosch SHPM65Z55N/01 Manuals",
    rawCategory: "dishwasher",
    source: "brave",
    confidence: "medium",
  }

  it("never prints the page title", () => {
    render(
      <IdentityCard
        state="found" identity={pageTitle} categoryLabel="Dishwasher"
        brand="Bosch" model="SHPM65Z55N/01" onUse={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Manuals/)).toBeNull()
    // Nothing on this screen may claim a manual — that is the next step's job,
    // and only once one is actually found.
    expect(screen.queryByText(/manual/i)).toBeNull()
  })

  it("says what it DID match: the kind, and the fields it matched on", () => {
    render(
      <IdentityCard
        state="found" identity={pageTitle} categoryLabel="Dishwasher"
        brand="Bosch" model="SHPM65Z55N/01" onUse={vi.fn()}
      />,
    )
    expect(screen.getByText("Dishwasher")).toBeInTheDocument()
    expect(screen.getByText("Bosch · SHPM65Z55N/01")).toBeInTheDocument()
  })

  it("still offers Use this — the model was right, only the wording was wrong", () => {
    const onUse = vi.fn()
    render(
      <IdentityCard
        state="found" identity={pageTitle} categoryLabel="Dishwasher"
        brand="Bosch" model="SHPM65Z55N/01" onUse={onUse}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Use this/ }))
    expect(onUse).toHaveBeenCalledOnce()
  })

  it("falls back to the matched fields when the category maps to nothing", () => {
    render(
      <IdentityCard
        state="found" identity={pageTitle} categoryLabel={null}
        brand="Bosch" model="SHPM65Z55N/01" onUse={vi.fn()}
      />,
    )
    expect(screen.getByText("Bosch · SHPM65Z55N/01")).toBeInTheDocument()
  })

  it("keeps a genuine product name as the headline", () => {
    render(
      <IdentityCard
        state="found" identity={identity} categoryLabel="Washer"
        brand="LG" model="WM4000HWA" onUse={vi.fn()}
      />,
    )
    expect(screen.getByText("LG WM4000HWA Front Load Washer")).toBeInTheDocument()
    expect(screen.getByText("Washer")).toBeInTheDocument()
    // The headline already carries both, so the evidence line would be the same
    // line twice.
    expect(screen.queryByText("LG · WM4000HWA")).toBeNull()
  })

  it("hides the page title in the applied state too", () => {
    render(
      <IdentityCard
        state="applied" identity={pageTitle} categoryLabel="Dishwasher"
        brand="Bosch" model="SHPM65Z55N/01" onUndo={vi.fn()} onNotMine={vi.fn()}
      />,
    )
    expect(screen.queryByText(/manual/i)).toBeNull()
    expect(screen.getByText("Dishwasher")).toBeInTheDocument()
  })
})
