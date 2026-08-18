/**
 * "No part of the flow searched for the manual" (beta round 5).
 *
 * findManual has been deployed and working the whole time — Brave-backed,
 * ranked, manufacturer-first. It sat on ONE of the three surfaces where
 * someone asks for a manual, and there it waited to be tapped. These pin the
 * two properties that fix: it starts on its own where the user has already
 * said what they want, and it never buys the same search twice.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { FindManualCard } from "./FindManualCard"

// vi.mock factories are hoisted above module-scope consts, and the callable is
// built at import time — so the fn has to be hoisted with them.
const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ callable: () => call }))
vi.mock("@/lib/manualSearch", () => ({ manualSearchUrl: () => "https://example.test/search" }))

beforeEach(() => {
  call.mockReset().mockResolvedValue({
    candidates: [{ url: "https://levoit.com/core300.pdf", title: "Core 300 manual", host: "levoit.com", official: true }],
    source: "search",
  })
})

describe("FindManualCard", () => {
  it("waits to be asked by default, and says it is a beta", async () => {
    // The default path for the beta is uploading the manual yourself. This
    // stays one tap away, labelled, and does not run on its own.
    render(<FindManualCard brand="Levoit" model="Core 300" onPick={() => {}} />)
    expect(screen.getByText("Find it for me")).toBeInTheDocument()
    expect(screen.getByText("Beta")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try the search" })).toBeInTheDocument()
    expect(call).not.toHaveBeenCalled()
  })

  it("warns when a candidate names a different model, and still allows it", async () => {
    // The reported case: a Core 300S manual offered for a Core 300.
    call.mockResolvedValue({
      candidates: [{ url: "https://files.vesync.com/core300s.pdf", title: "Levoit Core 300S user manual", host: "files.vesync.com", official: true }],
      source: "search",
    })
    const onPick = vi.fn()
    render(<FindManualCard brand="Levoit" model="Core 300" onPick={onPick} autoStart />)
    expect(await screen.findByText(/This manual is for the/)).toBeInTheDocument()
    expect(screen.getByText("Core 300S")).toBeInTheDocument()
    // Warn, never block — a manual sometimes does cover a family.
    screen.getByRole("button", { name: "Use this" }).click()
    expect(onPick).toHaveBeenCalledWith("https://files.vesync.com/core300s.pdf", "Levoit Core 300S user manual")
  })

  it("says why it trusts a manufacturer result, and offers a preview", async () => {
    call.mockResolvedValue({
      candidates: [{ url: "https://files.vesync.com/core300.pdf", title: "Levoit Core 300 user manual", host: "files.vesync.com", official: true }],
      source: "search",
    })
    render(<FindManualCard brand="Levoit" model="Core 300" onPick={() => {}} autoStart />)
    expect(await screen.findByText(/manufacturer's own site/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Preview/ })).toBeInTheDocument()
    // An exact model match must NOT be flagged.
    expect(screen.queryByText(/This manual is for the/)).toBeNull()
  })

  it("searches on its own when autoStart is set, and shows what it found", async () => {
    render(<FindManualCard brand="Levoit" model="Core 300" onPick={() => {}} autoStart />)
    await waitFor(() => expect(call).toHaveBeenCalledWith({ brand: "Levoit", model: "Core 300" }))
    expect(await screen.findByText("Core 300 manual")).toBeInTheDocument()
  })

  it("buys the search once, not once per render", async () => {
    const { rerender } = render(<FindManualCard brand="Levoit" model="Core 300" onPick={() => {}} autoStart />)
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1))
    rerender(<FindManualCard brand="Levoit" model="Core 300" onPick={() => {}} autoStart />)
    rerender(<FindManualCard brand="Levoit" model="Core 300" onPick={() => {}} autoStart />)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it("searches again when the model changes — a different product, a different manual", async () => {
    const { rerender } = render(<FindManualCard brand="Levoit" model="Core 300" onPick={() => {}} autoStart />)
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1))
    rerender(<FindManualCard brand="Levoit" model="Core 400S" onPick={() => {}} autoStart />)
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2))
    expect(call).toHaveBeenLastCalledWith({ brand: "Levoit", model: "Core 400S" })
  })

  it("stays quiet until there is enough to search with", () => {
    const { container } = render(<FindManualCard brand="L" model="" onPick={() => {}} autoStart />)
    expect(container).toBeEmptyDOMElement()
    expect(call).not.toHaveBeenCalled()
  })
})
