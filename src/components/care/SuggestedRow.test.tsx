/**
 * The Suggested row — the one anatomy every library offer uses (item page,
 * Tasks page, home setup). Approved mock: detail full width, actions on their
 * own line, and a failed action keeps the row with the error in place.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { SuggestedRow } from "./SuggestedRow"
import { entryByKey } from "../../../shared/care/library"

const hepa = entryByKey("air_purifier.hepa")!
const descale = entryByKey("coffee_machine.descale")!

describe("SuggestedRow", () => {
  it("reads as a suggestion for the named item, with why and how", () => {
    render(<SuggestedRow suggestion={{ entry: hepa }} itemName="Levoit Core 400S" onAdd={vi.fn(async () => ({ error: null }))} onDismiss={vi.fn(async () => ({ error: null }))} last />)
    expect(screen.getByText(hepa.title)).toBeTruthy()
    expect(screen.getByText(/Suggested/)).toBeTruthy()
    expect(screen.getByText(/Levoit Core 400S/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Add\b(?! backstop)/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Not this one/ })).toBeTruthy()
  })

  it("a failed Add keeps the row and says why — never a silent success", async () => {
    const onAdd = vi.fn(async () => ({ error: { message: "You're offline" } }))
    render(<SuggestedRow suggestion={{ entry: hepa }} itemName="Levoit" onAdd={onAdd} onDismiss={vi.fn(async () => ({ error: null }))} last />)
    fireEvent.click(screen.getByRole("button", { name: /^Add\b(?! backstop)/ }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/offline/i))
    expect(screen.getByText(hepa.title)).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Add\b(?! backstop)/ })).toBeTruthy()
  })

  it("Not this one asks the parent to dismiss, nothing else", async () => {
    const onDismiss = vi.fn(async () => ({ error: null }))
    const onAdd = vi.fn(async () => ({ error: null }))
    render(<SuggestedRow suggestion={{ entry: hepa }} itemName="Levoit" onAdd={onAdd} onDismiss={onDismiss} last />)
    fireEvent.click(screen.getByRole("button", { name: /Not this one/ }))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it("an indicator entry behind an existing as_needed task is offered as a BACKSTOP, not a second task", () => {
    render(
      <SuggestedRow
        suggestion={{ entry: descale, backstopFor: { title: "Descale the machine", scheduleType: "as_needed" } }}
        itemName="Nespresso Vertuo"
        onAdd={vi.fn(async () => ({ error: null }))}
        onDismiss={vi.fn(async () => ({ error: null }))}
        last
      />,
    )
    expect(screen.getByRole("button", { name: /Add backstop/ })).toBeTruthy()
    // The offer never reads as if the light is being replaced by a clock.
    expect(document.body.textContent).toMatch(/tells you when|light|indicator/i)
  })
})
