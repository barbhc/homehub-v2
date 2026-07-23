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
    expect(screen.getByText("We found this")).toBeInTheDocument()
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
