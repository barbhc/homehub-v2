/**
 * The bar exists because silence read as data loss: a tester swiped a row,
 * watched it disappear, and reported deleting a task that was only snoozed.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { UndoBar } from "./UndoBar"

describe("UndoBar", () => {
  it("states what happened and offers the way back", () => {
    const onUndo = vi.fn(), onDismiss = vi.fn()
    render(<UndoBar message="Snoozed until Aug 27" onUndo={onUndo} onDismiss={onDismiss} />)
    expect(screen.getByText("Snoozed until Aug 27")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()   // undoing also closes it
  })

  it("omits Undo when the action cannot be reversed — a receipt, not a lie", () => {
    render(<UndoBar message="Marked done" onDismiss={() => {}} />)
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
    expect(screen.getByText("Marked done")).toBeInTheDocument()
  })

  it("dismisses itself so it never becomes permanent furniture", () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<UndoBar message="Snoozed" onDismiss={onDismiss} ms={7000} />)
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(7000) })
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
